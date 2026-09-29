import path from "path";
import { access, mkdir, rename } from "fs/promises";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** Strip characters that are unsafe in a filesystem path segment. */
function sanitizeForPath(name: string): string {
  return name.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").trim() || "file";
}

/**
 * Directory a submission's uploaded files live under. Drafts (no serial number
 * yet) are keyed by submission id; once the submission is finalized and gets a
 * serial number, the directory is renamed to the serial — see
 * renameSubmissionUploadDir() in the submit route.
 */
export function submissionUploadDir(submission: { id: string; serialNo: string | null }): string {
  const key = submission.serialNo ? sanitizeForPath(submission.serialNo) : submission.id;
  return path.join(env.UPLOAD_DIR, "submissions", key);
}

/** Resolve a collision-free path for `originalName` inside `dir`, creating `dir` if needed. */
export async function uniqueStoredPath(dir: string, originalName: string): Promise<string> {
  await mkdir(dir, { recursive: true });

  const safeName = sanitizeForPath(originalName);
  const ext = path.extname(safeName);
  const base = safeName.slice(0, safeName.length - ext.length);

  let candidate = path.join(dir, safeName);
  let n = 1;
  while (await pathExists(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n++;
  }
  return candidate;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a submission's upload folder from its draft-time name (the submission id)
 * to its now-assigned serial number, and repoint each SubmissionFile.storedPath
 * at the new location. No-op if no files were ever uploaded during the draft.
 */
export async function renameSubmissionUploadDir(submissionId: string, serialNo: string | null): Promise<void> {
  if (!serialNo) return;

  const oldDir = path.join(env.UPLOAD_DIR, "submissions", submissionId);
  const newDir = path.join(env.UPLOAD_DIR, "submissions", sanitizeForPath(serialNo));
  if (oldDir === newDir || !(await pathExists(oldDir))) return;

  await rename(oldDir, newDir);

  const files = await prisma.submissionFile.findMany({
    where: { submissionId },
    select: { id: true, storedPath: true },
  });
  for (const f of files) {
    await prisma.submissionFile.update({
      where: { id: f.id },
      data: { storedPath: path.join(newDir, path.basename(f.storedPath)) },
    });
  }
}
