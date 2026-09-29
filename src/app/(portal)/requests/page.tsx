import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText, ArrowRight, Plus, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "My Requests — FormFlow" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; cancelled?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const filterStatus = searchParams.status;

  const submissions = await prisma.submission.findMany({
    where: {
      submittedById: session.user.id,
      ...(filterStatus ? { status: filterStatus as never } : { status: { not: "DRAFT" } }),
    },
    include: {
      formVersion: { include: { form: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const statusTabs = [
    { label: "All",         value: "" },
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "Approved",    value: "APPROVED" },
    { label: "Returned",    value: "RETURNED" },
    { label: "Rejected",    value: "REJECTED" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {searchParams.cancelled === "true" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-3 text-sm
                     dark:bg-muted/60 dark:border-border dark:text-slate-300"
        >
          <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>Your request has been cancelled and all pending approvals have been withdrawn.</span>
        </div>
      )}
      <PageHeader
        title="My Requests"
        description="All form submissions you have created."
        action={
          <Link
            href="/forms"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 hover:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Request
          </Link>
        }
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-2xl overflow-x-auto
                      bg-black/5 border border-black/8
                      dark:bg-card dark:border-border">
        {statusTabs.map((tab) => {
          const active = filterStatus === tab.value || (!filterStatus && tab.value === "");
          return (
            <Link
              key={tab.value}
              href={tab.value ? `/requests?status=${tab.value}` : "/requests"}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                active
                  ? "bg-white shadow-sm text-orange-600 dark:bg-muted dark:text-orange-400 dark:shadow-none"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/60 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-muted/60"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filterStatus ? "No matching requests" : "No requests yet"}
          description={
            filterStatus
              ? "Try a different filter, or create a new request."
              : "Submit your first form to start tracking requests here."
          }
          action={
            !filterStatus ? (
              <Link
                href="/forms"
                className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity"
              >
                Browse forms <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : undefined
          }
          className="bg-white border border-black/8 rounded-2xl py-16 shadow-card
                     dark:bg-card dark:border-border dark:shadow-none"
        />
      ) : (
        <div className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/6 bg-slate-50/80 dark:border-border dark:bg-muted/30">
                  <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap text-slate-400 dark:text-slate-500">
                    Serial No.
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Form
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap hidden sm:table-cell text-slate-400 dark:text-slate-500">
                    Submitted
                  </th>
                  <th scope="col" className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/6">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-muted/50 transition-colors group">
                    <td className="px-5 py-4">
                      <span className="font-mono text-[11px] px-2 py-1 rounded-lg
                                       text-slate-500 bg-slate-100 dark:text-slate-500 dark:bg-muted/60 dark:border dark:border-border">
                        {sub.serialNo ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/requests/${sub.id}`}
                        className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors"
                      >
                        {sub.formVersion.form.title}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400 hidden sm:table-cell whitespace-nowrap">
                      {sub.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/requests/${sub.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition-colors
                                   text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                      >
                        View <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
