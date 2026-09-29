import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { enqueueWorkflowAdvance } from "@/lib/queues";
import { buildZodSchema } from "@/lib/schema-validator";
import { writeNotificationForMany } from "@/lib/notifications";
import type { FormSchema } from "@/lib/types/schema";

const resubmitSchema = z.object({
  dataJson: z.record(z.unknown()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const body = resubmitSchema.parse(await req.json());

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        formVersion: { include: { form: { select: { title: true } } } },
      },
    });

    if (!submission) throw new AppError("NOT_FOUND", 404, "Submission not found.");
    if (submission.submittedById !== user.id) {
      throw new AppError("FORBIDDEN", 403, "You can only resubmit your own requests.");
    }
    if (submission.status !== "RETURNED") {
      throw new AppError("INVALID_STATUS", 400, "Only returned submissions can be resubmitted.");
    }

    // Validate dataJson against schema
    const schema = submission.formVersion.schemaJson as unknown as FormSchema;
    const zodSchema = buildZodSchema(schema);
    const result = zodSchema.safeParse(body.dataJson);
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        `Form data is invalid: ${result.error.issues.map((issue) => issue.message).join("; ")}`
      );
    }

    await prisma.$transaction(async (tx) => {
      // Reset workflow state: clear currentStepKey so advance starts from beginning
      await tx.submission.update({
        where: { id: params.id },
        data: {
          dataJson: body.dataJson as object,
          status: "IN_PROGRESS",
          currentStepKey: null,
          completedAt: null,
        },
      });

      await writeAudit({
        actorId: user.id,
        action: "SUBMISSION_RESUBMITTED",
        entityType: "Submission",
        entityId: params.id,
        after: { status: "IN_PROGRESS" },
        tx,
      });
    });

    // Notify approvers that it's been resubmitted (advance will handle task creation)
    await enqueueWorkflowAdvance(params.id);

    // Notify dept admins if any
    const formTitle = submission.formVersion.form.title;
    const deptAdmins = await prisma.user.findMany({
      where: { role: "DEPT_ADMIN", active: true },
      select: { id: true },
    });
    if (deptAdmins.length > 0) {
      await writeNotificationForMany(
        deptAdmins.map((u) => u.id),
        "SUBMISSION_RESUBMITTED",
        {
          submissionId: params.id,
          serialNo: submission.serialNo ?? undefined,
          formTitle,
        }
      );
    }

    return NextResponse.json({ ok: true, data: { submissionId: params.id } });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
