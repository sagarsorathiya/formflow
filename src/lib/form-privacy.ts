/**
 * Form-level privacy rules — the single source of truth for the three flags on
 * `Form`: `anonymous`, `confidential` and `oneTimeOnly`.
 *
 * These are deliberately centralised. The same class of bug has bitten this
 * codebase twice already (audience targeting enforced on /forms but forgotten on
 * the dashboard; `canViewSubmission` missing its DEPT_ADMIN branch), and privacy
 * rules fail silently in exactly the same way — a surface that forgets to call
 * these helpers simply leaks, with nothing to notice at runtime.
 *
 * ANY new surface that renders a submitter's name, a submission's field values,
 * or exports either, must go through `submitterLabel()` / `canSeeSubmissionValues()`.
 */

export interface PrivacyFormFlags {
  anonymous: boolean;
  confidential: boolean;
  departmentId?: string | null;
}

export interface PrivacyViewer {
  id: string;
  role: string;
  departmentId?: string | null;
}

export const ANONYMOUS_LABEL = "Anonymous";
export const REDACTED_LABEL = "[redacted]";

/**
 * The name to show for a submission's submitter.
 *
 * On an anonymous form nobody sees the real identity except the submitter
 * looking at their own submission — not approvers, not department admins, not
 * SUPER_ADMIN, and not the generated PDF. Workflow routing is unaffected: the
 * engine resolves assignees from the database, never from what is displayed.
 */
export function submitterLabel(
  form: Pick<PrivacyFormFlags, "anonymous">,
  submittedById: string,
  realName: string | null | undefined,
  viewerId: string | null | undefined
): string {
  if (!form.anonymous) return realName ?? "Unknown";
  if (viewerId && viewerId === submittedById) return `${realName ?? "You"} (you — hidden from others)`;
  return ANONYMOUS_LABEL;
}

/** True when the submitter's identity must be withheld from this viewer. */
export function isSubmitterHidden(
  form: Pick<PrivacyFormFlags, "anonymous">,
  submittedById: string,
  viewerId: string | null | undefined
): boolean {
  return form.anonymous && submittedById !== viewerId;
}

/**
 * Whether this viewer may see a submission's actual field values, attachments
 * and PDF — as opposed to just its serial number, status, dates and approval
 * trail, which stay visible so support and troubleshooting still work.
 *
 * Only `confidential` forms restrict anything here, and only for a SUPER_ADMIN
 * who has no other claim on the submission. The submitter, any assigned
 * approver, and the DEPT_ADMIN of the owning department are unaffected.
 */
export function canSeeSubmissionValues(
  form: Pick<PrivacyFormFlags, "confidential"> & { departmentId?: string | null },
  submission: { submittedById: string; approverIds?: string[] },
  viewer: PrivacyViewer
): boolean {
  if (!form.confidential) return true;
  if (viewer.id === submission.submittedById) return true;
  if (submission.approverIds?.includes(viewer.id)) return true;
  if (viewer.role === "DEPT_ADMIN" && viewer.departmentId && viewer.departmentId === form.departmentId) {
    return true;
  }
  // SUPER_ADMIN with no other claim: status yes, values no.
  return false;
}

/** Replaces every value in a submission's dataJson with a redaction marker. */
export function redactValues(dataJson: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(dataJson)) out[key] = REDACTED_LABEL;
  return out;
}

/**
 * A SUPER_ADMIN cannot be technically prevented from reading the database or
 * flipping `confidential` off — this is a segregation-of-duties control that
 * keeps confidential data out of the routine admin surfaces (reports, exports,
 * global search, PDFs), not a cryptographic boundary. Flag changes are audited.
 */
export const CONFIDENTIAL_CAVEAT =
  "Confidential hides values from SUPER_ADMIN in the app. It is not a hard security boundary — a server administrator retains database access.";
