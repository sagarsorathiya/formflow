/**
 * POST /api/tasks/[taskId]/action
 * Approve, Reject, or Return a workflow task.
 * Idempotent: re-acting on an already-acted task returns 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, canActOnTask, apiError, AppError } from "@/lib/authz";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { enqueueWorkflowAdvance } from "@/lib/queues";

const actionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "RETURN"]),
  comment: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireUser();
    await enforceRateLimit({ key: `ratelimit:task-action:${user.id}`, limit: 60, windowSeconds: 5 * 60 });
    const body = actionSchema.parse(await req.json());

    if (body.action === "REJECT" && !body.comment?.trim()) {
      throw new AppError("COMMENT_REQUIRED", 400, "A comment is required when rejecting a request.");
    }

    const task = await prisma.workflowTask.findUnique({
      where: { id: params.taskId },
      include: {
        submission: {
          select: { id: true, status: true, currentStepKey: true, serialNo: true },
        },
      },
    });

    if (!task) throw new AppError("NOT_FOUND", 404, "Task not found.");
    if (!canActOnTask(user.id, task)) {
      throw new AppError(
        "FORBIDDEN_STEP_ACTION",
        403,
        "You are not authorized to act on this task, or it is no longer pending."
      );
    }

    // Determine new task status
    const newTaskStatus = body.action === "APPROVE"
      ? "APPROVED"
      : body.action === "REJECT"
        ? "REJECTED"
        : "RETURNED";

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: params.taskId },
        data: {
          status: newTaskStatus,
          actedById: user.id,
          actedAt: new Date(),
          comment: body.comment ?? null,
        },
      });

      await writeAudit({
        actorId: user.id,
        action: `TASK_${body.action}` as string,
        entityType: "WorkflowTask",
        entityId: params.taskId,
        after: {
          taskId: params.taskId,
          submissionId: task.submissionId,
          action: body.action,
          comment: body.comment,
        },
        tx,
      });
    });

    // Enqueue workflow advance — worker will check new task state and advance
    await enqueueWorkflowAdvance(task.submissionId, task.stepKey);

    return NextResponse.json({
      ok: true,
      data: { taskId: params.taskId, status: newTaskStatus },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
