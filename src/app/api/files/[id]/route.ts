import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canSeeSubmissionValues } from "@/lib/form-privacy";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const file = await prisma.submissionFile.findUnique({
      where: { id: params.id },
      include: {
        submission: {
          select: {
            submittedById: true,
            formVersion: {
              select: { form: { select: { departmentId: true, confidential: true } } },
            },
            tasks: {
              where: {
                resolvedAssigneeIds: { has: user.id },
                status: "PENDING",
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!file) {
      return NextResponse.json({ error: { message: "File not found." } }, { status: 404 });
    }

    const { submission } = file;
    const isApprover = submission.tasks.length > 0;
    const canAccess =
      user.role === "SUPER_ADMIN" ||
      submission.submittedById === user.id ||
      isApprover ||
      (user.role === "DEPT_ADMIN" && user.departmentId === submission.formVersion.form.departmentId);

    if (!canAccess) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    // Attachments are submission values — a confidential form withholds them from
    // a SUPER_ADMIN with no other claim, same as the field data and the PDF.
    // `isApprover` above already reflects an assigned pending task for this user.
    const maySeeValues = canSeeSubmissionValues(
      submission.formVersion.form,
      { submittedById: submission.submittedById, approverIds: isApprover ? [user.id] : [] },
      { id: user.id, role: user.role, departmentId: user.departmentId }
    );
    if (!maySeeValues) {
      return NextResponse.json(
        { error: { message: "This form is confidential; its attachments are not available to your role." } },
        { status: 403 }
      );
    }

    // Verify file exists on disk
    await stat(file.storedPath);

    const stream = createReadStream(file.storedPath);
    const readable = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(readable, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${file.originalName.replace(/"/g, "")}"`,
        "Content-Length": file.size.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
