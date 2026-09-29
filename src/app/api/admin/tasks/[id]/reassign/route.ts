import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { writeNotification } from "@/lib/notifications";

const schema = z.object({
  newUserId: z.string().cuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSuperAdmin();
    const body = schema.parse(await req.json());

    const task = await prisma.workflowTask.findUnique({
      where: { id: params.id },
      include: {
        submission: {
          include: { formVersion: { include: { form: { select: { title: true } } } } },
        },
      },
    });

    if (!task) throw new AppError("NOT_FOUND", 404, "Task not found.");
    if (!["PENDING", "ESCALATED"].includes(task.status)) {
      throw new AppError("INVALID_STATUS", 400, "Only PENDING or ESCALATED tasks can be reassigned.");
    }

    const newUser = await prisma.user.findUnique({
      where: { id: body.newUserId, active: true },
      select: { id: true },
    });
    if (!newUser) throw new AppError("NOT_FOUND", 404, "Target user not found or inactive.");

    const previousIds = task.resolvedAssigneeIds;
    const newIds = Array.from(new Set([...previousIds, body.newUserId]));

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: params.id },
        data: {
          resolvedAssigneeIds: newIds,
          status: "PENDING",
        },
      });
      await writeAudit({
        actorId: actor.id,
        action: "TASK_REASSIGNED",
        entityType: "WorkflowTask",
        entityId: params.id,
        before: { resolvedAssigneeIds: previousIds },
        after: { resolvedAssigneeIds: newIds },
        tx,
      });
    });

    await writeNotification(body.newUserId, "TASK_ASSIGNED", {
      submissionId: task.submissionId,
      taskId: params.id,
      serialNo: task.submission.serialNo ?? undefined,
      formTitle: task.submission.formVersion.form.title,
      stepKey: task.stepKey,
      message: "This task was reassigned to you by an administrator.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
