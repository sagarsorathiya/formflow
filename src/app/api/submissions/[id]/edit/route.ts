import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { enqueuePdf } from "@/lib/queues";
import { validateSubmission } from "@/lib/schema-validator";
import type { FormSchema } from "@/lib/types/schema";

const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes

const editSchema = z.object({
  dataJson: z.record(z.unknown()),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const body = editSchema.parse(await req.json());

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        formVersion: true,
        tasks: { select: { status: true } },
      },
    });

    if (!submission) throw new AppError("NOT_FOUND", 404, "Submission not found.");

    if (submission.submittedById !== user.id) {
      throw new AppError("FORBIDDEN", 403, "You can only edit your own submissions.");
    }

    if (["CANCELLED", "REJECTED"].includes(submission.status)) {
      throw new AppError("INVALID_STATUS", 400, "This submission can no longer be edited.");
    }

    // Grace period check
    const ageMs = Date.now() - submission.createdAt.getTime();
    if (ageMs > GRACE_PERIOD_MS) {
      throw new AppError("GRACE_EXPIRED", 403, "The 15-minute edit window has expired.");
    }

    // No approver must have acted yet
    const acted = submission.tasks.some((t) =>
      ["APPROVED", "REJECTED", "RETURNED"].includes(t.status)
    );
    if (acted) {
      throw new AppError(
        "ALREADY_ACTED",
        403,
        "An approver has already acted on this request. It can no longer be edited."
      );
    }

    // Server-side validation against published schema
    const schema = submission.formVersion.schemaJson as unknown as FormSchema;
    const validation = validateSubmission(schema, body.dataJson);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Validation failed.", details: validation.errors } },
        { status: 422 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: params.id },
        data: { dataJson: body.dataJson as object },
      });

      await writeAudit({
        actorId: user.id,
        action: "SUBMISSION_EDITED",
        entityType: "Submission",
        entityId: params.id,
        after: { note: "Grace-period edit by submitter" },
        tx,
      });
    });

    // Re-generate PDF if already auto-approved
    if (submission.status === "APPROVED") {
      await enqueuePdf(params.id).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
