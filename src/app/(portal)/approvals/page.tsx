import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckCircle2, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ANONYMOUS_LABEL } from "@/lib/form-privacy";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Approvals — FormFlow" };

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const tasks = await prisma.workflowTask.findMany({
    where: {
      resolvedAssigneeIds: { has: session.user.id },
      status: "PENDING",
    },
    include: {
      submission: {
        include: {
          formVersion: { include: { form: { select: { title: true, anonymous: true } } } },
          submittedBy: { select: { displayName: true, designation: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const overdueCount = tasks.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Approvals Inbox"
        description="Requests waiting for your review and action."
        action={
          tasks.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl
                               bg-amber-50 border border-amber-200 text-amber-700
                               dark:bg-amber-500/15 dark:border-amber-500/20 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {tasks.length} pending
              </span>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl
                                 bg-red-50 border border-red-200 text-red-700
                                 dark:bg-red-500/15 dark:border-red-500/20 dark:text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  {overdueCount} overdue
                </span>
              )}
            </div>
          ) : null
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up!"
          description="You have no pending approvals. We'll notify you when new requests arrive."
          className="bg-white border border-black/8 rounded-2xl py-16 shadow-card
                     dark:bg-card dark:border-border dark:shadow-none"
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const isOverdue = task.dueAt && new Date(task.dueAt) < new Date();
            const isDueSoon = !isOverdue && task.dueAt && new Date(task.dueAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;

            return (
              <div
                key={task.id}
                className={`group flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all duration-150 hover:-translate-y-px ${
                  isOverdue
                    ? "border-red-200 bg-red-50 hover:bg-red-100/70 dark:border-red-500/20 dark:bg-red-500/8 dark:hover:bg-red-500/12"
                    : isDueSoon
                    ? "border-amber-200 bg-amber-50 hover:bg-amber-100/70 dark:border-amber-500/20 dark:bg-amber-500/8 dark:hover:bg-amber-500/12"
                    : "border-black/8 bg-white hover:bg-slate-50 dark:border-border dark:bg-card dark:hover:bg-white/7"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isOverdue ? "bg-red-100 dark:bg-red-500/20" : isDueSoon ? "bg-amber-100 dark:bg-amber-500/20" : "bg-slate-100 dark:bg-muted/70"
                  }`}>
                    {isOverdue ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                    ) : isDueSoon ? (
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-orange-500 dark:text-orange-400" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-sm leading-tight truncate
                                  text-slate-900 group-hover:text-orange-600
                                  dark:text-white dark:group-hover:text-orange-400
                                  transition-colors">
                      {task.submission.formVersion.form.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-slate-500 dark:text-slate-500">
                      <span>
                        From{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {task.submission.formVersion.form.anonymous
                            ? ANONYMOUS_LABEL
                            : task.submission.submittedBy.displayName}
                        </span>
                        {!task.submission.formVersion.form.anonymous && task.submission.submittedBy.designation && (
                          <span> · {task.submission.submittedBy.designation}</span>
                        )}
                      </span>
                      {task.submission.serialNo && (
                        <span className="font-mono px-1.5 py-0.5 rounded text-[10px]
                                         bg-slate-100 text-slate-500
                                         dark:bg-muted/60 dark:border dark:border-border dark:text-slate-500">
                          {task.submission.serialNo}
                        </span>
                      )}
                    </div>
                    {task.dueAt && (
                      <p className={`text-[11px] font-medium flex items-center gap-1 ${
                        isOverdue ? "text-red-600 dark:text-red-400" : isDueSoon ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
                      }`}>
                        <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                        {isOverdue ? "Overdue · " : "Due: "}
                        {new Date(task.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </div>

                <Link
                  href={`/approvals/${task.id}`}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all hover:opacity-90 hover:scale-[0.97] ${
                    isOverdue
                      ? "bg-red-600 text-white dark:bg-red-500/20 dark:text-red-300 dark:border dark:border-red-500/25"
                      : "text-white"
                  }`}
                  style={isOverdue ? {} : { background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                >
                  Review <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
