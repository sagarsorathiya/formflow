import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { validateSubmission } from "@/lib/schema-validator";
import { enqueueWorkflowAdvance, enqueueEmail } from "@/lib/queues";
import { nextSerial } from "@/lib/serial";
import type { FormSchema } from "@/lib/types/schema";
import { isFormVisibleToUser, isCompanyHeadDesignation } from "@/lib/audience";
import { renameSubmissionUploadDir } from "@/lib/file-storage";

const submitSchema = z.object({
  versionId: z.string().cuid(),
  dataJson: z.record(z.unknown()),
  draftSubmissionId: z.string().cuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = submitSchema.parse(await req.json());

    const formVersion = await prisma.formVersion.findUnique({
      where: { id: body.versionId },
      include: {
        form: {
          include: { department: { select: { code: true, name: true } }, audience: true },
        },
      },
    });

    if (!formVersion) throw new AppError("NOT_FOUND", 404, "Form version not found.");
    if (!formVersion.publishedAt) {
      throw new AppError("NOT_PUBLISHED", 400, "This form is not published.");
    }

    const audienceUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true, departmentId: true, designation: true, adGroups: true },
    });
    const isCompanyHead = await isCompanyHeadDesignation(audienceUser?.designation ?? null);
    const audienceContext = audienceUser ? { ...audienceUser, isCompanyHead, role: user.role } : null;
    if (!isFormVisibleToUser(formVersion.form.audience, audienceContext)) {
      throw new AppError("FORBIDDEN", 403, "This form is not published to your audience.");
    }

    // One-time-only forms: a user gets a single submission across ALL versions of
    // the form. Checked here (not just in the UI) because the fill page can be
    // reached directly by URL. DRAFT doesn't count (nothing submitted yet) and
    // neither does CANCELLED — a withdrawn entry frees the slot, otherwise
    // cancelling within the grace window would lock the user out permanently.
    if (formVersion.form.oneTimeOnly) {
      const existing = await prisma.submission.findFirst({
        where: {
          submittedById: user.id,
          status: { notIn: ["DRAFT", "CANCELLED"] },
          formVersion: { formId: formVersion.formId },
          ...(body.draftSubmissionId ? { id: { not: body.draftSubmissionId } } : {}),
        },
        select: { serialNo: true },
      });
      if (existing) {
        throw new AppError(
          "ALREADY_SUBMITTED",
          409,
          `You have already submitted this form${existing.serialNo ? ` (${existing.serialNo})` : ""}. Only one submission per person is allowed.`
        );
      }
    }

    // Server-side validation
    const schema = formVersion.schemaJson as unknown as FormSchema;
    const validation = validateSubmission(schema, body.dataJson);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Validation failed.", details: validation.errors } },
        { status: 422 }
      );
    }

    const deptCode = formVersion.form.department?.code ?? "GEN";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    const submission = await prisma.$transaction(async (tx) => {
      const serialNo = await nextSerial(tx, deptCode);

      // If there's an existing draft, update it; otherwise create new
      let sub;
      if (body.draftSubmissionId) {
        sub = await tx.submission.update({
          where: { id: body.draftSubmissionId },
          data: {
            dataJson: body.dataJson as object,
            status: "IN_PROGRESS",
            serialNo,
            currentStepKey: null,
          },
        });
      } else {
        sub = await tx.submission.create({
          data: {
            formVersionId: body.versionId,
            submittedById: user.id,
            dataJson: body.dataJson as object,
            status: "IN_PROGRESS",
            serialNo,
          },
        });
      }

      await writeAudit({
        actorId: user.id,
        action: "SUBMISSION_CREATED",
        entityType: "Submission",
        entityId: sub.id,
        after: { serialNo, formTitle: formVersion.form.title },
        ip,
        tx,
      });

      return sub;
    });

    // Files uploaded while this was still a draft live in a folder keyed by the
    // submission id (no serial number existed yet) — move them into a folder
    // named after the now-assigned serial number, and point SubmissionFile rows
    // at the new path. Best-effort: a failure here must not block the submit.
    await renameSubmissionUploadDir(submission.id, submission.serialNo).catch((err) =>
      console.error("[submissions] failed to rename upload dir to serial number:", err)
    );

    await enqueueWorkflowAdvance(submission.id).catch(console.error);

    // Send submission confirmation email to the submitter
    if (user.email) {
      await enqueueEmail({
        to: user.email,
        subject: `Submission received: ${formVersion.form.title} — ${submission.serialNo}`,
        html: `<p>Hi ${user.name ?? ""},</p><p>Your request <strong>${submission.serialNo}</strong> for <strong>${formVersion.form.title}</strong> has been received and is now in progress.</p><p>You will be notified when it is approved or if any action is required from you.</p>`,
      }).catch(console.error);
    }

    return NextResponse.json({ ok: true, data: submission }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
