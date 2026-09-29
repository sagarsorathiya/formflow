import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canSeeSubmissionValues, isSubmitterHidden, redactValues } from "@/lib/form-privacy";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        formVersion: {
          include: {
            form: { select: { title: true, departmentId: true, anonymous: true, confidential: true } },
          },
        },
        tasks: { select: { status: true, resolvedAssigneeIds: true } },
        files: { select: { id: true, originalName: true, mime: true, size: true } },
      },
    });

    if (!submission) throw new AppError("NOT_FOUND", 404, "Submission not found.");

    const isApprover = submission.tasks.some((t) => t.resolvedAssigneeIds.includes(user.id));
    const canAccess =
      user.role === "SUPER_ADMIN" ||
      submission.submittedById === user.id ||
      isApprover ||
      (user.role === "DEPT_ADMIN" && user.departmentId === submission.formVersion.form.departmentId);

    if (!canAccess) {
      throw new AppError("FORBIDDEN", 403, "Access denied.");
    }

    // Same rules as the pages that consume this: confidential hides values from a
    // SUPER_ADMIN with no other claim; anonymous hides the submitter's identity.
    const form = submission.formVersion.form;
    const showValues = canSeeSubmissionValues(
      form,
      {
        submittedById: submission.submittedById,
        approverIds: submission.tasks.flatMap((t) => t.resolvedAssigneeIds),
      },
      { id: user.id, role: user.role, departmentId: user.departmentId }
    );

    return NextResponse.json({
      ok: true,
      data: {
        ...submission,
        dataJson: showValues
          ? submission.dataJson
          : redactValues(submission.dataJson as Record<string, unknown>),
        files: showValues ? submission.files : [],
        submittedById: isSubmitterHidden(form, submission.submittedById, user.id)
          ? null
          : submission.submittedById,
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
