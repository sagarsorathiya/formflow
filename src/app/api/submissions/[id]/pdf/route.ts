import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canSeeSubmissionValues } from "@/lib/form-privacy";
import { readFile } from "fs/promises";
import { enqueuePdf } from "@/lib/queues";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        submittedById: true,
        status: true,
        pdfPath: true,
        serialNo: true,
        formVersion: {
          select: {
            formId: true,
            form: { select: { departmentId: true, title: true, confidential: true } },
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: { message: "Not found." } }, { status: 404 });
    }

    // Access check: submitter, DEPT_ADMIN of the form's dept, or SUPER_ADMIN
    const canAccess =
      user.role === "SUPER_ADMIN" ||
      submission.submittedById === user.id ||
      (user.role === "DEPT_ADMIN" && user.departmentId === submission.formVersion.form.departmentId);

    if (!canAccess) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    // The PDF reproduces every field value, so a confidential form's PDF follows
    // the same rule as its values: a SUPER_ADMIN with no other claim is refused.
    const approverIds = await prisma.workflowTask.findMany({
      where: { submissionId: params.id },
      select: { resolvedAssigneeIds: true },
    });
    const maySeeValues = canSeeSubmissionValues(
      submission.formVersion.form,
      {
        submittedById: submission.submittedById,
        approverIds: approverIds.flatMap((t) => t.resolvedAssigneeIds),
      },
      { id: user.id, role: user.role, departmentId: user.departmentId }
    );
    if (!maySeeValues) {
      return NextResponse.json(
        { error: { message: "This form is confidential; its PDF is not available to your role." } },
        { status: 403 }
      );
    }

    if (submission.status !== "APPROVED") {
      return NextResponse.json(
        { error: { message: "PDF is only available for approved submissions." } },
        { status: 400 }
      );
    }

    // If PDF not yet generated, trigger generation and ask client to retry
    if (!submission.pdfPath) {
      await enqueuePdf(submission.id);
      return NextResponse.json(
        { error: { message: "PDF is being generated. Please try again in a few seconds." }, generating: true },
        { status: 202 }
      );
    }

    const bytes = await readFile(submission.pdfPath);
    const filename = `${(submission.serialNo ?? submission.id).replace(/[^a-z0-9-]/gi, "_")}.pdf`;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": bytes.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
