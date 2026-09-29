import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircle2 } from "lucide-react";
import { ReassignPanel } from "./reassign-panel";

export const metadata: Metadata = { title: "Admin — Reassignment" };

export default async function ReassignPage() {
  const [pendingTasks, users] = await Promise.all([
    prisma.workflowTask.findMany({
      where: { status: { in: ["PENDING", "ESCALATED"] } },
      include: {
        submission: {
          include: {
            formVersion: { include: { form: { select: { title: true, anonymous: true } } } },
            submittedBy: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, displayName: true, email: true, designation: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Task Reassignment"
        description="Force-reassign pending approval tasks to another user. All reassignments are recorded in the audit log."
        action={
          pendingTasks.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
                             bg-amber-50 border border-amber-200 text-amber-700
                             dark:bg-amber-500/15 dark:border-amber-500/20 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {pendingTasks.length} pending
            </span>
          ) : null
        }
      />

      {pendingTasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No pending tasks"
          description="All approval tasks are currently assigned and up to date."
          className="bg-white rounded-2xl border border-slate-200 py-16 shadow-card
                     dark:bg-card dark:border-border dark:shadow-none"
        />
      ) : (
        <ReassignPanel tasks={pendingTasks} users={users} />
      )}
    </div>
  );
}
