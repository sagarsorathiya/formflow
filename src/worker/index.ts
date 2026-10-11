/**
 * FormFlow BullMQ worker process.
 * Entry point is bootstrap.ts (`npm run worker`), which loads .env before
 * this file's imports run. Do not run this file directly — env vars won't be loaded.
 */

import { Worker } from "bullmq";
import {
  getQueueConnection,
  slaQueue,
  enqueueWorkflowAdvance,
  scheduleStuckSubmissionReconciliation,
} from "@/lib/queues";
import { sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { ANONYMOUS_LABEL } from "@/lib/form-privacy";
import type { EmailJob, WorkflowAdvanceJob, AdSyncJob, PdfJob, SlaCheckJob } from "@/lib/queues";
import type { VisibilityCondition } from "@/lib/types/schema";

const connection = getQueueConnection();

// ─── Email worker ─────────────────────────────────────────────────────────────

const emailWorker = new Worker<EmailJob>(
  "email",
  async (job) => {
    await sendMail({
      to: job.data.to,
      subject: job.data.subject,
      html: job.data.html,
      text: job.data.text,
    });
    console.log(`[email] sent "${job.data.subject}" to ${job.data.to}`);
  },
  { connection, concurrency: 5 }
);

// ─── Workflow advance worker ──────────────────────────────────────────────────

const workflowWorker = new Worker<WorkflowAdvanceJob>(
  "workflow",
  async (job) => {
    const { advanceSubmission } = await import("@/lib/workflow/advance");
    console.log(`[workflow] advancing submission ${job.data.submissionId}`);
    await advanceSubmission(job.data.submissionId);
    console.log(`[workflow] done: submission ${job.data.submissionId}`);
  },
  { connection, concurrency: 10 }
);

// ─── AD sync worker ───────────────────────────────────────────────────────────

const adSyncWorker = new Worker<AdSyncJob>(
  "ad-sync",
  async (_job) => {
    const { ldapSearchAllUsers } = await import("@/lib/ldap");
    const { upsertUserFromLdap } = await import("@/lib/user-sync");

    console.log("[ad-sync] starting user sync...");
    const users = await ldapSearchAllUsers();
    let updated = 0;
    for (const user of users) {
      try {
        await upsertUserFromLdap(user);
        updated++;
      } catch (err) {
        console.error(`[ad-sync] failed to upsert ${user.samAccountName}:`, err);
      }
    }
    console.log(`[ad-sync] synced ${updated}/${users.length} users`);
  },
  { connection, concurrency: 1 }
);

// ─── PDF worker ───────────────────────────────────────────────────────────────

const pdfWorker = new Worker<PdfJob>(
  "pdf",
  async (job) => {
    const { submissionId } = job.data;
    console.log(`[pdf] generating PDF for submission ${submissionId}`);

    const { prisma } = await import("@/lib/prisma");
    const { generateApprovedPdf } = await import("@/lib/pdf-gen");
    const path = await import("path");
    const fs = await import("fs/promises");

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        formVersion: {
          include: { form: { select: { title: true, departmentId: true, anonymous: true } } },
        },
        submittedBy: {
          select: {
            displayName: true,
            designation: true,
            department: { select: { name: true } },
          },
        },
        tasks: {
          where: { status: { not: "PENDING" } },
          include: { actedBy: { select: { displayName: true } } },
          orderBy: { updatedAt: "asc" },
        },
        files: { select: { id: true, originalName: true } },
      },
    });

    if (!submission) {
      console.warn(`[pdf] submission ${submissionId} not found`);
      return;
    }

    const { isFieldVisible } = await import("@/lib/visibility");
    const schema = submission.formVersion.schemaJson as {
      pages: { fields: { key: string; label: string; type: string; visibleIf?: VisibilityCondition | null }[] }[];
    };

    const fileNameById = new Map(submission.files.map((f) => [f.id, f.originalName]));
    const data = submission.dataJson as Record<string, unknown>;
    const fields: { label: string; value: string }[] = [];
    for (const page of schema.pages ?? []) {
      for (const field of page.fields ?? []) {
        // Layout-only fields (canonical + legacy names) carry no answer.
        if (["section-header", "section_header", "divider", "rich-text", "static_text"].includes(field.type)) continue;
        // Same rule as the form screen: a field hidden by its condition is not part of the answer.
        if (!isFieldVisible(field, data)) continue;
        const val = data[field.key];
        let value: string;
        if (field.type === "file-upload" || field.type === "file") {
          value = Array.isArray(val)
            ? val.map((v) => (typeof v === "string" ? fileNameById.get(v) ?? v : String(v))).join(", ")
            : "";
        } else {
          value = Array.isArray(val) ? val.join(", ") : val != null ? String(val) : "";
        }
        fields.push({ label: field.label, value });
      }
    }

    // Build a map of node id → human-readable label from the published workflow JSON
    const wf = submission.formVersion.workflowJson as {
      nodes?: { id: string; label?: string; data?: { label?: string } }[];
    };
    const nodeLabelMap = new Map<string, string>(
      (wf.nodes ?? []).map((n) => [
        n.id,
        n.label ?? (n.data as Record<string, string> | undefined)?.label ?? n.id,
      ])
    );

    const trail = submission.tasks.map((t) => ({
      stepKey: t.stepKey,
      stepLabel: nodeLabelMap.get(t.stepKey) ?? t.stepKey,
      actorName: t.actedBy?.displayName ?? "—",
      status: t.status,
      actedAt: t.actedAt,
      comment: t.comment,
    }));

    const submitter = submission.submittedBy as {
      displayName: string;
      designation: string | null;
      department?: { name: string } | null;
    };

    const pdfBytes = await generateApprovedPdf({
      serialNo: submission.serialNo,
      formTitle: submission.formVersion.form.title,
      // The PDF is handed around outside the app, so an anonymous form must not
      // name its submitter anywhere in it — including the dept/designation,
      // which would narrow it down in a small department.
      submitterName: submission.formVersion.form.anonymous ? ANONYMOUS_LABEL : submitter.displayName,
      submitterDept: submission.formVersion.form.anonymous ? null : submitter.department?.name ?? null,
      submitterDesignation: submission.formVersion.form.anonymous ? null : submitter.designation,
      submittedAt: submission.createdAt,
      completedAt: submission.completedAt,
      fields,
      trail,
    });

    const uploadDir = process.env.UPLOAD_DIR ?? "/data/uploads";
    const pdfDir = path.join(uploadDir, "pdfs");
    await fs.mkdir(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, `${submissionId}.pdf`);
    await fs.writeFile(pdfPath, pdfBytes);

    await prisma.submission.update({
      where: { id: submissionId },
      data: { pdfPath },
    });

    console.log(`[pdf] saved PDF for submission ${submissionId} → ${pdfPath}`);
  },
  { connection, concurrency: 2 }
);

// ─── SLA check worker ─────────────────────────────────────────────────────────

const slaWorker = new Worker<SlaCheckJob>(
  "sla",
  async (job) => {
    const { prisma } = await import("@/lib/prisma");
    const { writeNotificationForMany } = await import("@/lib/notifications");

    const { taskId, reminderCount, slaDays, escalateAfterReminders } = job.data;

    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        submission: {
          include: {
            formVersion: { include: { form: { select: { title: true } } } },
            submittedBy: { select: { displayName: true } },
          },
        },
      },
    });

    if (!task || task.status !== "PENDING") {
      console.log(`[sla] task ${taskId} no longer pending, skipping`);
      return;
    }

    const assignees = await prisma.user.findMany({
      where: { id: { in: task.resolvedAssigneeIds } },
      select: { id: true, email: true, displayName: true },
    });

    const formTitle = task.submission.formVersion.form.title;
    const serialNo = task.submission.serialNo ?? "";

    const shouldEscalate =
      escalateAfterReminders !== undefined &&
      escalateAfterReminders > 0 &&
      reminderCount >= escalateAfterReminders;

    if (shouldEscalate) {
      // Find escalation target: submitter's manager or dept head
      const submitter = await prisma.user.findUnique({
        where: { id: task.submission.submittedById },
        select: { managerGuid: true, departmentId: true },
      });

      let escalateToId: string | null = null;

      if (submitter?.managerGuid) {
        const manager = await prisma.user.findUnique({
          where: { objectGuid: submitter.managerGuid },
          select: { id: true, active: true, email: true },
        });
        if (manager?.active) escalateToId = manager.id;
      }

      if (!escalateToId && submitter?.departmentId) {
        const deptHead = await prisma.user.findFirst({
          where: { departmentId: submitter.departmentId, role: "DEPT_ADMIN", active: true },
          select: { id: true, email: true },
        });
        if (deptHead) escalateToId = deptHead.id;
      }

      await prisma.$transaction(async (tx) => {
        await tx.workflowTask.update({
          where: { id: taskId },
          data: {
            status: "ESCALATED",
            escalatedToId: escalateToId,
            resolvedAssigneeIds: escalateToId
              ? [...task.resolvedAssigneeIds, escalateToId]
              : task.resolvedAssigneeIds,
          },
        });
      });

      if (escalateToId) {
        const escalatee = await prisma.user.findUnique({
          where: { id: escalateToId },
          select: { email: true, displayName: true },
        });
        if (escalatee?.email) {
          await sendMail({
            to: escalatee.email,
            subject: `Escalation: ${formTitle} — ${serialNo} requires your attention`,
            html: `<p>Hi ${escalatee.displayName ?? ""},</p><p>A request <strong>${serialNo}</strong> for <strong>${formTitle}</strong> has been escalated to you after ${reminderCount} reminders without action.</p><p>Please log in to FormFlow to review and act.</p>`,
          });
        }
        await writeNotificationForMany([escalateToId], "SLA_ESCALATED", {
          submissionId: task.submissionId,
          taskId,
          serialNo,
          formTitle,
          stepKey: task.stepKey,
        });
      }

      console.log(`[sla] task ${taskId} escalated after ${reminderCount} reminders`);
      return;
    }

    // Send reminder
    for (const assignee of assignees) {
      if (!assignee.email) continue;
      await sendMail({
        to: assignee.email,
        subject: `Reminder: ${formTitle} — ${serialNo} is overdue`,
        html: `<p>Hi ${assignee.displayName ?? ""},</p><p>A request <strong>${serialNo}</strong> for <strong>${formTitle}</strong> is overdue and waiting for your approval at step <strong>${task.stepKey}</strong>.</p><p>Please log in to FormFlow to review and act.</p>`,
      });
    }

    await writeNotificationForMany(
      assignees.map((a) => a.id),
      "SLA_REMINDER",
      { submissionId: task.submissionId, taskId, serialNo, formTitle, stepKey: task.stepKey }
    );

    console.log(`[sla] sent reminder #${reminderCount + 1} for task ${taskId}`);

    // Re-enqueue next reminder in 24h (underscore separator — BullMQ v5 forbids colons in jobIds)
    const nextReminderCount = reminderCount + 1;
    const nextJobId = `sla_${taskId}_${nextReminderCount}`;
    await slaQueue.add(
      "check",
      { taskId, reminderCount: nextReminderCount, slaDays, escalateAfterReminders },
      { jobId: nextJobId, delay: 24 * 60 * 60 * 1000 }
    );
  },
  { connection, concurrency: 5 }
);

// ─── Stuck-submission reconciliation worker ───────────────────────────────────
// Self-healing safety net: if a submission's workflow.advance job never made it
// into Redis (e.g. Redis was down at the moment of submit — the enqueue call in
// POST /api/submissions is fire-and-forget and silently swallows that failure),
// the submission is left at IN_PROGRESS with no WorkflowTask rows forever. This
// runs every 10 minutes and re-enqueues advance for any such submission older
// than 5 minutes (grace window so an in-flight advance isn't double-enqueued).

const reconcileWorker = new Worker(
  "reconcile",
  async (job) => {
    if (job.name !== "reconcile-stuck") return;
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const stuck = await prisma.submission.findMany({
      where: {
        status: "IN_PROGRESS",
        currentStepKey: null,
        createdAt: { lt: cutoff },
        tasks: { none: {} },
      },
      select: { id: true, serialNo: true },
    });
    if (stuck.length === 0) return;
    console.warn(`[reconcile] found ${stuck.length} stuck submission(s) with no workflow tasks — re-enqueuing advance`);
    for (const s of stuck) {
      await enqueueWorkflowAdvance(s.id);
      console.warn(`[reconcile] re-enqueued advance for ${s.serialNo ?? s.id}`);
    }
  },
  { connection, concurrency: 1 }
);

scheduleStuckSubmissionReconciliation().catch((err) =>
  console.error("[reconcile] failed to schedule repeatable job:", err)
);

// ─── Error handlers ───────────────────────────────────────────────────────────

for (const worker of [emailWorker, workflowWorker, adSyncWorker, pdfWorker, slaWorker, reconcileWorker]) {
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down...`);
  await Promise.all([
    emailWorker.close(),
    workflowWorker.close(),
    adSyncWorker.close(),
    pdfWorker.close(),
    slaWorker.close(),
    reconcileWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[worker] FormFlow worker started, listening on all queues");
