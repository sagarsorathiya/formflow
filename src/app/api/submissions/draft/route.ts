import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isFormVisibleToUser, isCompanyHeadDesignation } from "@/lib/audience";

const draftSchema = z.object({
  versionId: z.string().cuid(),
  dataJson: z.record(z.unknown()),
  submissionId: z.string().cuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = draftSchema.parse(await req.json());

    // Verify version exists and is published
    const version = await prisma.formVersion.findUnique({
      where: { id: body.versionId },
      include: { form: { include: { audience: true } } },
    });
    if (!version?.publishedAt) {
      throw new AppError("NOT_PUBLISHED", 400, "Cannot draft an unpublished form.");
    }

    const audienceUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true, departmentId: true, designation: true, adGroups: true },
    });
    const isCompanyHead = await isCompanyHeadDesignation(audienceUser?.designation ?? null);
    const audienceContext = audienceUser ? { ...audienceUser, isCompanyHead, role: user.role } : null;
    if (!isFormVisibleToUser(version.form.audience, audienceContext)) {
      throw new AppError("FORBIDDEN", 403, "This form is not published to your audience.");
    }

    let submission;

    if (body.submissionId) {
      // Update existing draft
      submission = await prisma.submission.update({
        where: { id: body.submissionId, submittedById: user.id, status: "DRAFT" },
        data: { dataJson: body.dataJson as object },
      });
    } else {
      // Create new draft
      submission = await prisma.submission.create({
        data: {
          formVersionId: body.versionId,
          submittedById: user.id,
          dataJson: body.dataJson as object,
          status: "DRAFT",
        },
      });
    }

    return NextResponse.json({ ok: true, data: { id: submission.id } });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
