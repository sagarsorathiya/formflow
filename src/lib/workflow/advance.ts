/**
 * Workflow state machine — advances a submission through the workflow graph.
 * Pure logic; called only by the BullMQ worker (never inside a Next.js request handler).
 *
 * Entry points:
 *   advanceSubmission(submissionId)   — called after initial submit or after a task action
 */

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { enqueueEmail, enqueueSlaCheck, enqueuePdf } from "@/lib/queues";
import { writeNotification, writeNotificationForMany } from "@/lib/notifications";
import { resolveAssignees, strategyToAssigneeType } from "./assignee-resolver";
import type {
  WorkflowDefinition,
  WorkflowNode,
  ApprovalNodeConfig,
  ConditionNodeConfig,
  ConditionBranch,
  NotifyNodeConfig,
} from "@/lib/types/schema";

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function advanceSubmission(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      formVersion: {
        include: {
          form: {
            select: { id: true, departmentId: true },
          },
        },
      },
      submittedBy: { select: { id: true, displayName: true, email: true } },
      tasks: {
        where: { status: { in: ["PENDING", "APPROVED", "REJECTED", "RETURNED", "ESCALATED", "SKIPPED"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!submission) {
    console.error(`[workflow] submission ${submissionId} not found`);
    return;
  }

  // Terminal states — nothing to do
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(submission.status)) {
    console.log(`[workflow] submission ${submissionId} already in terminal state ${submission.status}`);
    return;
  }

  const workflow = submission.formVersion.workflowJson as unknown as WorkflowDefinition;
  const dataJson = submission.dataJson as Record<string, unknown>;
  const ctx = {
    submittedById: submission.submittedById,
    departmentId: submission.formVersion.form.departmentId,
  };

  const currentStepKey = submission.currentStepKey;

  // ─── Case 1: First advance (no current step) ──────────────────────────────
  if (!currentStepKey) {
    const startNode = workflow.nodes.find((n) => n.type === "start");
    if (!startNode) {
      console.error(`[workflow] submission ${submissionId}: no start node in workflow`);
      return;
    }
    await followEdgesFrom(startNode.id, workflow, submissionId, submission, ctx, dataJson);
    return;
  }

  // ─── Case 2: Advancing from a current approval step ──────────────────────
  const currentNode = workflow.nodes.find((n) => n.id === currentStepKey);
  if (!currentNode) {
    console.error(`[workflow] node ${currentStepKey} not found for submission ${submissionId}`);
    return;
  }

  if (currentNode.type === "approval") {
    const config = currentNode.data as ApprovalNodeConfig;
    const stepTasks = submission.tasks.filter((t) => t.stepKey === currentStepKey);

    const rejectedTask = stepTasks.find((t) => t.status === "REJECTED");
    const returnedTask = stepTasks.find((t) => t.status === "RETURNED");
    const skippedTask  = stepTasks.find((t) => t.status === "SKIPPED");
    const approvedTasks = stepTasks.filter((t) => t.status === "APPROVED");
    const pendingTasks = stepTasks.filter((t) => t.status === "PENDING");

    // Step was auto-skipped (no assignees resolved) — advance past it now
    if (skippedTask && !pendingTasks.length && !approvedTasks.length && !rejectedTask && !returnedTask) {
      console.log(`[workflow] submission ${submissionId}: step ${currentStepKey} was skipped — continuing`);
      await followEdgesFrom(currentStepKey, workflow, submissionId, submission, ctx, dataJson);
      return;
    }

    // Return to submitter
    if (returnedTask) {
      await prisma.$transaction(async (tx) => {
        await tx.submission.update({
          where: { id: submissionId },
          data: { status: "RETURNED" },
        });
        await writeAudit({
          actorId: returnedTask.actedById ?? undefined,
          action: "SUBMISSION_RETURNED",
          entityType: "Submission",
          entityId: submissionId,
          after: { stepKey: currentStepKey, comment: returnedTask.comment },
          tx,
        });
      });
      // Notify submitter by email + in-app
      if (submission.submittedBy.email) {
        await enqueueEmail({
          to: submission.submittedBy.email,
          subject: `Your request ${submission.serialNo} has been returned for revision`,
          html: `<p>Your request <strong>${submission.serialNo}</strong> was returned at step <strong>${currentNode.label ?? currentStepKey}</strong>.</p><p>Comment: ${returnedTask.comment ?? "—"}</p>`,
        });
      }
      await writeNotification(submission.submittedById, "SUBMISSION_RETURNED", {
        submissionId,
        serialNo: submission.serialNo ?? undefined,
        stepKey: currentStepKey,
        stepLabel: currentNode.label ?? currentStepKey,
        comment: returnedTask.comment ?? undefined,
        actorName: undefined,
      });
      return;
    }

    // Rejection — terminal
    if (rejectedTask) {
      await prisma.$transaction(async (tx) => {
        await tx.submission.update({
          where: { id: submissionId },
          data: { status: "REJECTED", completedAt: new Date() },
        });
        await writeAudit({
          actorId: rejectedTask.actedById ?? undefined,
          action: "SUBMISSION_REJECTED",
          entityType: "Submission",
          entityId: submissionId,
          after: { stepKey: currentStepKey, comment: rejectedTask.comment },
          tx,
        });
      });
      // Notify submitter by email + in-app
      if (submission.submittedBy.email) {
        await enqueueEmail({
          to: submission.submittedBy.email,
          subject: `Your request ${submission.serialNo} has been rejected`,
          html: `<p>Your request <strong>${submission.serialNo}</strong> was rejected at step <strong>${currentNode.label ?? currentStepKey}</strong>.</p><p>Reason: ${rejectedTask.comment ?? "—"}</p>`,
        });
      }
      await writeNotification(submission.submittedById, "SUBMISSION_REJECTED", {
        submissionId,
        serialNo: submission.serialNo ?? undefined,
        stepKey: currentStepKey,
        stepLabel: currentNode.label ?? currentStepKey,
        comment: rejectedTask.comment ?? undefined,
      });
      return;
    }

    // Check if approval conditions are met
    const anyOneApproves = config.anyOneApproves !== false;
    const isComplete = anyOneApproves
      ? approvedTasks.length > 0
      : pendingTasks.length === 0 && approvedTasks.length > 0;

    if (!isComplete) {
      console.log(`[workflow] submission ${submissionId} waiting at step ${currentStepKey}`);
      return;
    }

    // Approval condition met — advance to next nodes
    await followEdgesFrom(currentStepKey, workflow, submissionId, submission, ctx, dataJson);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function followEdgesFrom(
  fromNodeId: string,
  workflow: WorkflowDefinition,
  submissionId: string,
  submission: Awaited<ReturnType<typeof prisma.submission.findUnique>> & object,
  ctx: { submittedById: string; departmentId: string | null },
  dataJson: Record<string, unknown>
): Promise<void> {
  const fromNode = workflow.nodes.find((n) => n.id === fromNodeId);
  if (!fromNode) return;

  const nextNodeIds = getNextNodeIds(fromNode, workflow, dataJson);

  for (const nextId of nextNodeIds) {
    const nextNode = workflow.nodes.find((n) => n.id === nextId);
    if (!nextNode) continue;
    await processNode(nextNode, workflow, submissionId, submission, ctx, dataJson);
  }
}

function getNextNodeIds(
  fromNode: WorkflowNode,
  workflow: WorkflowDefinition,
  dataJson: Record<string, unknown>
): string[] {
  if (fromNode.type === "condition") {
    const config = fromNode.data as ConditionNodeConfig;
    for (const branch of config.branches ?? []) {
      if (evaluateBranch(branch, dataJson)) {
        return [branch.targetNodeId];
      }
    }
    return config.elseBranchTarget ? [config.elseBranchTarget] : [];
  }

  if (fromNode.type === "parallel-split") {
    return workflow.edges.filter((e) => e.source === fromNode.id).map((e) => e.target);
  }

  // Default: single outgoing edge
  const edge = workflow.edges.find((e) => e.source === fromNode.id);
  return edge ? [edge.target] : [];
}

async function processNode(
  node: WorkflowNode,
  workflow: WorkflowDefinition,
  submissionId: string,
  submission: Awaited<ReturnType<typeof prisma.submission.findUnique>> & object,
  ctx: { submittedById: string; departmentId: string | null },
  dataJson: Record<string, unknown>
): Promise<void> {
  if (node.type === "approval") {
    const { autoSkipped } = await handleApprovalNode(node, submissionId, submission, ctx, dataJson);
    if (autoSkipped) {
      // No assignees — continue inline rather than re-queuing a second job
      await followEdgesFrom(node.id, workflow, submissionId, submission, ctx, dataJson);
    }
    return;
  }

  if (node.type === "end-approved") {
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: "APPROVED", completedAt: new Date(), currentStepKey: node.id },
      });
      await writeAudit({
        action: "SUBMISSION_APPROVED",
        entityType: "Submission",
        entityId: submissionId,
        tx,
      });
    });
    // Only notify if a human actually approved something — pure data-collection
    // submissions (no approval nodes, or every approval auto-skipped) already got
    // their confirmation email on submit and shouldn't get a second "approved" email.
    const sub = submission as unknown as {
      submittedBy: { email: string | null };
      serialNo: string | null;
      submittedById: string;
      tasks?: { status: string }[];
    };
    const hadRealApproval = (sub.tasks ?? []).some((t) => t.status === "APPROVED");
    if (hadRealApproval) {
      if (sub.submittedBy?.email) {
        await enqueueEmail({
          to: sub.submittedBy.email,
          subject: `Your request ${sub.serialNo} has been approved`,
          html: `<p>Your request <strong>${sub.serialNo}</strong> has been fully approved.</p>`,
        });
      }
      await writeNotification(sub.submittedById, "SUBMISSION_APPROVED", {
        submissionId,
        serialNo: sub.serialNo ?? undefined,
      });
    }
    await enqueuePdf(submissionId);
    return;
  }

  if (node.type === "end-rejected") {
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: "REJECTED", completedAt: new Date(), currentStepKey: node.id },
      });
      await writeAudit({
        action: "SUBMISSION_REJECTED",
        entityType: "Submission",
        entityId: submissionId,
        tx,
      });
    });
    return;
  }

  // Notify node — send and immediately advance
  if (node.type === "notify") {
    await handleNotifyNode(node, submission, ctx, dataJson);
    await followEdgesFrom(node.id, workflow, submissionId, submission, ctx, dataJson);
    return;
  }

  // Condition / parallel nodes — evaluate and continue
  if (node.type === "condition" || node.type === "parallel-split" || node.type === "parallel-join") {
    await followEdgesFrom(node.id, workflow, submissionId, submission, ctx, dataJson);
    return;
  }
}

async function handleApprovalNode(
  node: WorkflowNode,
  submissionId: string,
  submission: object,
  ctx: { submittedById: string; departmentId: string | null },
  dataJson: Record<string, unknown>
): Promise<{ autoSkipped: boolean }> {
  const config = node.data as ApprovalNodeConfig;
  const assigneeIds = await resolveAssignees(config, ctx, dataJson);

  if (assigneeIds.length === 0) {
    console.warn(`[workflow] No assignees resolved for node ${node.id} on submission ${submissionId} — auto-skipping`);
    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.create({
        data: {
          submissionId,
          stepKey: node.id,
          assigneeType: strategyToAssigneeType(config.assigneeStrategy) as never,
          resolvedAssigneeIds: [],
          status: "SKIPPED",
        },
      });
      await tx.submission.update({
        where: { id: submissionId },
        data: { currentStepKey: node.id, status: "IN_PROGRESS" },
      });
    });
    // Signal to caller to continue inline — no second job needed
    return { autoSkipped: true };
  }

  const dueAt = config.slaDays
    ? new Date(Date.now() + config.slaDays * 24 * 60 * 60 * 1000)
    : null;

  // Create one task per assignee (or one shared task if anyOneApproves)
  await prisma.$transaction(async (tx) => {
    await tx.workflowTask.create({
      data: {
        submissionId,
        stepKey: node.id,
        assigneeType: strategyToAssigneeType(config.assigneeStrategy) as never,
        resolvedAssigneeIds: assigneeIds,
        status: "PENDING",
        ...(dueAt ? { dueAt } : {}),
      },
    });
    await tx.submission.update({
      where: { id: submissionId },
      data: { currentStepKey: node.id, status: "IN_PROGRESS" },
    });
    await writeAudit({
      action: "WORKFLOW_TASK_CREATED",
      entityType: "Submission",
      entityId: submissionId,
      after: { stepKey: node.id, assigneeIds },
      tx,
    });
  });

  // Notify assignees by email + in-app
  const assignees = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, email: true, displayName: true },
  });
  const sub = submission as { serialNo: string | null; formVersion: { form: { title: string } } };
  for (const assignee of assignees) {
    if (assignee.email) {
      await enqueueEmail({
        to: assignee.email,
        subject: `Action required: ${sub.formVersion?.form?.title ?? "Form"} — ${sub.serialNo}`,
        html: `<p>Hi ${assignee.displayName ?? ""},</p><p>A request <strong>${sub.serialNo}</strong> is waiting for your approval at step <strong>${node.label ?? node.id}</strong>.</p><p>Please log in to FormFlow to review and act.</p>`,
      });
    }
  }
  await writeNotificationForMany(
    assignees.map((a) => a.id),
    "TASK_ASSIGNED",
    {
      submissionId,
      serialNo: sub.serialNo ?? undefined,
      formTitle: sub.formVersion?.form?.title,
      stepKey: node.id,
      stepLabel: node.label ?? node.id,
    }
  );

  // Enqueue SLA check if dueAt is set
  if (dueAt) {
    const task = await prisma.workflowTask.findFirst({
      where: { submissionId, stepKey: node.id, status: "PENDING" },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (task) {
      await enqueueSlaCheck(
        task.id,
        dueAt,
        config.slaDays!,
        config.escalateAfterReminders
      );
    }
  }
  return { autoSkipped: false };
}

async function handleNotifyNode(
  node: WorkflowNode,
  submission: object,
  ctx: { submittedById: string; departmentId: string | null },
  dataJson: Record<string, unknown>
): Promise<void> {
  const config = node.data as NotifyNodeConfig;
  const sub = submission as {
    serialNo: string | null;
    formVersion: { form: { title: string } };
    submittedBy: { email: string | null; displayName: string };
  };
  const formTitle = sub.formVersion?.form?.title ?? "Form";
  const serialNo = sub.serialNo ?? "";
  const subject = `Notification: ${formTitle} — ${serialNo}`;
  const body = config.messageTemplate
    ? `<p>${config.messageTemplate}</p>`
    : `<p>A new submission <strong>${serialNo}</strong> has been received for <strong>${formTitle}</strong>.</p>`;

  // "submitter" — send directly to whoever submitted the form
  if (config.recipientStrategy === "submitter") {
    if (sub.submittedBy?.email) {
      await enqueueEmail({ to: sub.submittedBy.email, subject, html: body });
    }
    return;
  }

  // "custom-email" — send to one or more comma-separated email addresses
  if (config.recipientStrategy === "custom-email") {
    const raw = Array.isArray(config.recipientValue)
      ? config.recipientValue.join(",")
      : (config.recipientValue as string) ?? "";
    const addresses = raw.split(",").map((e) => e.trim()).filter(Boolean);
    for (const addr of addresses) {
      await enqueueEmail({ to: addr, subject, html: body });
    }
    return;
  }

  // All other strategies — resolve via users in DB
  const assigneeIds = await resolveAssignees(
    { assigneeStrategy: config.recipientStrategy, assigneeValue: config.recipientValue },
    ctx,
    dataJson
  );
  const recipients = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { email: true },
  });
  for (const r of recipients) {
    if (!r.email) continue;
    await enqueueEmail({ to: r.email, subject, html: body });
  }
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evaluateBranch(branch: ConditionBranch, dataJson: Record<string, unknown>): boolean {
  const logic = branch.logic ?? "AND";
  const results = branch.rules.map((rule) => evaluateRule(rule, dataJson));
  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function evaluateRule(
  rule: { fieldKey: string; operator: string; value?: unknown },
  dataJson: Record<string, unknown>
): boolean {
  const fieldValue = dataJson[rule.fieldKey];
  const ruleValue = rule.value;

  switch (rule.operator) {
    case "==":
      return String(fieldValue) === String(ruleValue);
    case "!=":
      return String(fieldValue) !== String(ruleValue);
    case ">":
      return Number(fieldValue) > Number(ruleValue);
    case "<":
      return Number(fieldValue) < Number(ruleValue);
    case ">=":
      return Number(fieldValue) >= Number(ruleValue);
    case "<=":
      return Number(fieldValue) <= Number(ruleValue);
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(String(ruleValue));
    case "is_empty":
      return !fieldValue || fieldValue === "";
    case "is_not_empty":
      return !!fieldValue && fieldValue !== "";
    default:
      return false;
  }
}
