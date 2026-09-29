import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewSubmission } from "@/lib/authz";
import { canSeeSubmissionValues, submitterLabel, redactValues } from "@/lib/form-privacy";
import Link from "next/link";
import { ArrowLeft, Download, CheckCircle2, Pencil, Lock } from "lucide-react";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { ResubmitButton } from "./resubmit-button";
import { EditButton } from "./edit-button";
import { CancelButton } from "./cancel-button";
import type { FormSchema } from "@/lib/types/schema";

const GRACE_PERIOD_MS = 15 * 60 * 1000;

export const metadata: Metadata = { title: "Request Details" };

interface Props {
  params: { id: string };
  searchParams: { submitted?: string; edited?: string; cancelled?: string; from?: string; formId?: string };
}

export default async function RequestDetailPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: {
      formVersion: {
        include: {
          form: { select: { title: true, departmentId: true, anonymous: true, confidential: true } },
        },
      },
      submittedBy: { select: { id: true, displayName: true } },
      tasks: {
        include: { actedBy: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
      files: { select: { id: true, originalName: true, mime: true, size: true } },
    },
  });

  if (!submission) notFound();

  // departmentId comes from the DB, not the JWT — an admin-side org change does not
  // refresh the target user's session, and a stale value silently denies access here.
  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { departmentId: true },
  });
  const canView = await canViewSubmission(session.user.id, session.user.role, params.id, viewer?.departmentId ?? null);
  if (!canView) redirect("/requests");

  const backToReports = searchParams.from === "reports";

  const schema = submission.formVersion.schemaJson as unknown as FormSchema;
  const privacyForm = submission.formVersion.form;
  const showValues = canSeeSubmissionValues(
    privacyForm,
    {
      submittedById: submission.submittedById,
      approverIds: submission.tasks.flatMap((t) => t.resolvedAssigneeIds),
    },
    { id: session.user.id, role: session.user.role, departmentId: viewer?.departmentId ?? null }
  );

  const rawData = submission.dataJson as Record<string, unknown>;
  const data = showValues ? rawData : redactValues(rawData);
  const fileMeta = Object.fromEntries(submission.files.map((f) => [f.id, f]));

  // Grace-period edit eligibility (server-side — also enforced in the API)
  const ageMs = Date.now() - submission.createdAt.getTime();
  const withinGrace = ageMs < GRACE_PERIOD_MS;
  const hasApproverActed = submission.tasks.some((t) =>
    ["APPROVED", "REJECTED", "RETURNED"].includes(t.status)
  );
  const canEdit =
    withinGrace &&
    !hasApproverActed &&
    submission.submittedById === session.user.id &&
    !["REJECTED", "CANCELLED", "RETURNED"].includes(submission.status);

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const canCancel =
    !["REJECTED", "CANCELLED"].includes(submission.status) &&
    (
      isSuperAdmin ||
      (
        withinGrace &&
        !hasApproverActed &&
        submission.submittedById === session.user.id &&
        submission.status !== "APPROVED"
      )
    );

  // Build node label map from workflowJson so timeline shows "Manager Approval" not "manager-approval"
  const wf = submission.formVersion.workflowJson as { nodes?: { id: string; label?: string; data?: { label?: string } }[] };
  const nodeLabelMap = new Map((wf.nodes ?? []).map((n) => [n.id, n.label ?? (n.data as Record<string, string> | undefined)?.label ?? n.id]));

  const timelineSteps = submission.tasks.map((task) => ({
    label: nodeLabelMap.get(task.stepKey) ?? task.stepKey,
    actor: task.actedBy?.displayName,
    timestamp: task.actedAt,
    comment: task.comment,
    status: task.status,
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={submission.formVersion.form.title}
        description={`${submission.serialNo ?? "Draft"} · Submitted by ${submitterLabel(privacyForm, submission.submittedById, submission.submittedBy.displayName, session.user.id)}`}
        breadcrumb={
          backToReports ? (
            <Link
              href={`/reports${searchParams.formId ? `?formId=${searchParams.formId}` : ""}`}
              className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              Back to Reports
            </Link>
          ) : (
            <Link href="/requests" className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              My Requests
            </Link>
          )
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <EditButton
                submissionId={submission.id}
                createdAt={submission.createdAt.toISOString()}
                hasApproverActed={hasApproverActed}
                status={submission.status}
              />
            )}
            {canCancel && (
              <CancelButton
                submissionId={submission.id}
                serialNo={submission.serialNo ?? "this request"}
                isSuperAdmin={isSuperAdmin}
              />
            )}
            {submission.status === "APPROVED" && showValues && (
              <a
                href={`/api/submissions/${submission.id}/pdf`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors
                         bg-slate-100 border border-black/8 text-slate-600 hover:bg-slate-200
                         dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download PDF
              </a>
            )}
            <StatusBadge status={submission.status} />
          </div>
        }
      />

      {/* Success banner */}
      {searchParams.submitted === "true" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm
                     dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-400"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Your request has been submitted successfully. Serial No:{" "}
            <strong className="font-semibold text-green-300">{submission.serialNo}</strong>
          </span>
        </div>
      )}

      {/* Edited banner */}
      {searchParams.edited === "true" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm
                     dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300"
        >
          <Pencil className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Your request has been updated successfully. The original serial number <strong>{submission.serialNo}</strong> is unchanged.</span>
        </div>
      )}

      {/* Returned banner */}
      {submission.status === "RETURNED" && submission.submittedById === session.user.id && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2
                        dark:bg-violet-500/10 dark:border-violet-500/30">
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">This request was returned for revision</p>
          <p className="text-xs text-violet-600 dark:text-violet-400">Review the comments below, then resubmit when ready.</p>
          <ResubmitButton submissionId={params.id} dataJson={data} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form data */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                      dark:bg-card dark:border-border dark:shadow-none">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Form Details</h2>
            {!showValues && (
              <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800
                            dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  This form is marked <strong>confidential</strong>. Its status and approval trail are shown,
                  but the submitted values and attachments are visible only to the submitter, the assigned
                  approvers, and the owning department&apos;s admin.
                </span>
              </p>
            )}
            <FormRenderer schema={schema} data={data} mode="readonly" fileMeta={showValues ? fileMeta : {}} />
          </div>
        </div>

        {/* Approval trail */}
        <div>
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Approval Trail</h2>
            {timelineSteps.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No workflow steps yet.</p>
            ) : (
              <Timeline steps={timelineSteps} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
