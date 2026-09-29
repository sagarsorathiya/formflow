import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canActOnTask } from "@/lib/authz";
import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { PageHeader } from "@/components/ui/page-header";
import { isSubmitterHidden, ANONYMOUS_LABEL } from "@/lib/form-privacy";
import { StatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { AttachmentItem } from "@/components/ui/document-viewer";
import { TaskActionForm } from "./task-action-form";
import type { FormSchema, WorkflowDefinition, ApprovalNodeConfig } from "@/lib/types/schema";

export const metadata: Metadata = { title: "Review Request" };

interface Props {
  params: { taskId: string };
}

export default async function TaskReviewPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const task = await prisma.workflowTask.findUnique({
    where: { id: params.taskId },
    include: {
      submission: {
        include: {
          formVersion: {
            include: { form: { select: { title: true, departmentId: true, anonymous: true } } },
          },
          submittedBy: { select: { displayName: true, email: true, designation: true, department: true } },
          tasks: {
            include: { actedBy: { select: { displayName: true } } },
            orderBy: { createdAt: "asc" },
          },
          files: { select: { id: true, fieldKey: true, originalName: true, mime: true, size: true } },
        },
      },
    },
  });

  if (!task) notFound();

  const canAct = canActOnTask(session.user.id, task);
  const isAlreadyActed = task.status !== "PENDING";

  const schema = task.submission.formVersion.schemaJson as unknown as FormSchema;
  const data = task.submission.dataJson as Record<string, unknown>;
  const workflow = task.submission.formVersion.workflowJson as unknown as WorkflowDefinition | null;

  const fileMeta = Object.fromEntries(task.submission.files.map((f) => [f.id, f]));

  const stepKey = task.stepKey;
  const stepEditableFields = schema.pages
    .flatMap((p) => p.fields)
    .filter((f) => f.stepEditable === stepKey)
    .map((f) => f.key);

  const node = workflow?.nodes.find((n) => n.id === stepKey);
  const nodeConfig = node?.type === "approval" ? (node.data as ApprovalNodeConfig) : null;
  const allowReturn = nodeConfig?.allowReturn ?? false;

  const timelineSteps = task.submission.tasks.map((t) => ({
    label: t.stepKey + (t.id === task.id ? " (current)" : ""),
    actor: t.actedBy?.displayName,
    timestamp: t.actedAt,
    comment: t.comment,
    status: t.status,
    description: t.dueAt && t.status === "PENDING"
      ? `Due: ${t.dueAt.toLocaleDateString("en-IN")}`
      : undefined,
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={task.submission.formVersion.form.title}
        description={(() => {
          // An approver still approves; they just don't learn who submitted it.
          const anon = isSubmitterHidden(
            task.submission.formVersion.form,
            task.submission.submittedById,
            session.user.id
          );
          const who = anon
            ? ANONYMOUS_LABEL
            : `${task.submission.submittedBy.displayName}${task.submission.submittedBy.designation ? ` · ${task.submission.submittedBy.designation}` : ""}`;
          return `${task.submission.serialNo ?? "No serial"} · Submitted by ${who}`;
        })()}
        breadcrumb={
          <Link href="/approvals" className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Approvals Inbox
          </Link>
        }
        action={<StatusBadge status={task.submission.status} />}
      />

      {isAlreadyActed && (
        <div className="rounded-xl p-4 text-sm
                        bg-slate-100 border border-black/8 text-slate-600
                        dark:bg-card dark:border-border dark:text-slate-300">
          This task was already <strong className="font-semibold text-slate-900 dark:text-white">{task.status.toLowerCase()}</strong>
          {task.actedAt && ` on ${task.actedAt.toLocaleDateString("en-IN")}`}
          {task.comment && <>: &ldquo;{task.comment}&rdquo;</>}.
        </div>
      )}

      {!canAct && !isAlreadyActed && (
        <div className="rounded-xl p-4 text-sm
                        bg-amber-50 border border-amber-200 text-amber-700
                        dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
          You are not assigned to this approval step and cannot act on it.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form + action */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Submitted Form</h2>
            <FormRenderer
              schema={schema}
              data={data}
              mode="readonly"
              stepKey={stepEditableFields.length > 0 ? stepKey : undefined}
              fileMeta={fileMeta}
            />
          </div>

          {task.submission.files.length > 0 && (
            <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                            dark:bg-card dark:border-border dark:shadow-none">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Attachments ({task.submission.files.length})
              </h2>
              <ul className="space-y-2">
                {task.submission.files.map((file) => (
                  <li key={file.id}>
                    <AttachmentItem file={file} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action form — desktop: inline; mobile: sticky bottom */}
          {canAct && !isAlreadyActed && (
            <>
              {/* Desktop inline */}
              <div className="hidden sm:block">
                <TaskActionForm taskId={task.id} allowReturn={allowReturn} />
              </div>
              {/* Mobile sticky bottom */}
              <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-[#0b1120] border-t border-black/8 dark:border-border p-4">
                <TaskActionForm taskId={task.id} allowReturn={allowReturn} mobile />
              </div>
              {/* Spacer for mobile sticky bar */}
              <div className="sm:hidden h-28" aria-hidden="true" />
            </>
          )}
        </div>

        {/* Right: trail */}
        <div>
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Approval Trail</h2>
            {timelineSteps.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No workflow steps yet.</p>
            ) : (
              <Timeline steps={timelineSteps} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
