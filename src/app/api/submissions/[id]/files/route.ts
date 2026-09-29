import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import path from "path";
import { writeFile } from "fs/promises";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { submissionUploadDir, uniqueStoredPath } from "@/lib/file-storage";
import type { FormSchema } from "@/lib/types/schema";

const GRACE_PERIOD_MS = 15 * 60 * 1000; // mirrors the edit-grace window in [id]/edit/route.ts

/** Upload one or more files for a file-upload field on a not-yet-finalized submission. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    await enforceRateLimit({ key: `ratelimit:file-upload:${user.id}`, limit: 30, windowSeconds: 5 * 60 });

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        formVersion: { select: { schemaJson: true } },
        tasks: { select: { status: true } },
      },
    });
    if (!submission) throw new AppError("NOT_FOUND", 404, "Submission not found.");

    if (submission.submittedById !== user.id) {
      throw new AppError("FORBIDDEN", 403, "You can only attach files to your own submissions.");
    }
    if (["APPROVED", "REJECTED", "CANCELLED"].includes(submission.status)) {
      throw new AppError("INVALID_STATUS", 400, "This submission can no longer be modified.");
    }
    // Drafts have no time limit; once a submission has actually been filed, the same
    // 15-minute grace + no-approver-acted rule as editing dataJson applies here too.
    if (submission.status !== "DRAFT") {
      const ageMs = Date.now() - submission.createdAt.getTime();
      if (ageMs > GRACE_PERIOD_MS) {
        throw new AppError("GRACE_EXPIRED", 403, "The 15-minute edit window has expired.");
      }
      const acted = submission.tasks.some((t) => ["APPROVED", "REJECTED", "RETURNED"].includes(t.status));
      if (acted) {
        throw new AppError("ALREADY_ACTED", 403, "An approver has already acted on this request.");
      }
    }

    const formData = await req.formData();
    const fieldKey = formData.get("fieldKey");
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (typeof fieldKey !== "string" || !fieldKey) {
      throw new AppError("VALIDATION_ERROR", 400, "fieldKey is required.");
    }
    if (files.length === 0) {
      throw new AppError("VALIDATION_ERROR", 400, "No files provided.");
    }

    const schema = submission.formVersion.schemaJson as unknown as FormSchema;
    const field = schema.pages.flatMap((p) => p.fields).find((f) => f.key === fieldKey);
    if (!field || field.type !== "file-upload") {
      throw new AppError("VALIDATION_ERROR", 400, "Not a file-upload field on this form.");
    }

    const fieldAny = field as unknown as Record<string, unknown>;
    const allowedExtensions = (field.allowedExtensions ?? (fieldAny.fileTypes as string[]) ?? []) as string[];
    const maxMb = field.maxFileSizeMb ?? (fieldAny.maxFileSizeMB as number) ?? env.MAX_UPLOAD_MB;
    const maxBytes = maxMb * 1024 * 1024;

    const submissionDir = submissionUploadDir(submission);

    const created = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.some((a) => a.toLowerCase().replace(/^\./, "") === ext.replace(/^\./, ""))) {
        throw new AppError("VALIDATION_ERROR", 400, `File type ${ext || "unknown"} is not allowed for ${field.label}.`);
      }
      if (file.size > maxBytes) {
        throw new AppError("VALIDATION_ERROR", 400, `${file.name} exceeds the ${maxMb} MB limit.`);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const storedPath = await uniqueStoredPath(submissionDir, file.name);
      await writeFile(storedPath, buffer);

      const record = await prisma.submissionFile.create({
        data: {
          submissionId: submission.id,
          fieldKey,
          originalName: file.name,
          storedPath,
          mime: file.type || "application/octet-stream",
          size: file.size,
          sha256,
        },
      });

      created.push({ id: record.id, originalName: record.originalName, mime: record.mime, size: record.size });
    }

    return NextResponse.json({ ok: true, data: { files: created } }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
