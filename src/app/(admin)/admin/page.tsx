import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Users, FileText, Inbox, Activity,
  Link2, ClipboardList, ScrollText, ArrowLeftRight, Settings, Archive,
  ArrowRight,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin — Dashboard" };

const QUICK_LINKS = [
  { href: "/admin/users",         label: "Users & Roles",   desc: "View and assign roles",         icon: Users,          gradient: "from-blue-500 to-indigo-600",   glow: "shadow-blue-500/20" },
  { href: "/admin/role-mappings", label: "Role Mappings",   desc: "AD group → app role",            icon: Link2,          gradient: "from-purple-500 to-violet-600", glow: "shadow-purple-500/20" },
  { href: "/admin/reassign",      label: "Reassign Tasks",  desc: "Force-reassign approvals",       icon: ArrowLeftRight, gradient: "from-amber-500 to-orange-500",  glow: "shadow-amber-500/20" },
  { href: "/admin/submissions",   label: "All Submissions", desc: "Search any request",             icon: ClipboardList,  gradient: "from-teal-500 to-cyan-600",     glow: "shadow-teal-500/20" },
  { href: "/admin/audit-logs",    label: "Audit Logs",      desc: "Tamper-evident trail",           icon: ScrollText,     gradient: "from-emerald-500 to-green-600", glow: "shadow-emerald-500/20" },
  { href: "/admin/forms",         label: "Archived Forms",  desc: "Restore deleted forms",          icon: Archive,        gradient: "from-rose-500 to-pink-600",     glow: "shadow-rose-500/20" },
  { href: "/admin/settings",      label: "Settings",        desc: "SMTP / LDAP configuration",     icon: Settings,       gradient: "from-slate-500 to-slate-600",   glow: "shadow-slate-500/20" },
];

export default async function AdminDashboardPage() {
  const [
    totalUsers,
    publishedForms,
    totalSubmissions,
    pendingTasks,
    recentAudit,
    submissionsByStatus,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.form.count({ where: { status: "PUBLISHED" } }),
    prisma.submission.count({ where: { status: { notIn: ["DRAFT"] } } }),
    prisma.workflowTask.count({ where: { status: "PENDING" } }),
    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { displayName: true } } },
    }),
    prisma.submission.groupBy({
      by: ["status"],
      _count: true,
      where: { status: { notIn: ["DRAFT"] } },
    }),
  ]);

  const statusMap = Object.fromEntries(submissionsByStatus.map((s) => [s.status, s._count]));

  const STATS = [
    { label: "Total Users",       value: totalUsers,       icon: Users,     gradient: "from-blue-500 to-indigo-600",   glow: "shadow-blue-500/25" },
    { label: "Published Forms",   value: publishedForms,   icon: FileText,  gradient: "from-emerald-500 to-teal-600",  glow: "shadow-emerald-500/25" },
    { label: "Submissions",       value: totalSubmissions, icon: Activity,  gradient: "from-purple-500 to-violet-600", glow: "shadow-purple-500/25" },
    { label: "Pending Approvals", value: pendingTasks,     icon: Inbox,     gradient: pendingTasks > 0 ? "from-orange-500 to-red-500" : "from-slate-400 to-slate-500", glow: pendingTasks > 0 ? "shadow-orange-500/25" : "shadow-slate-500/20" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">System overview and quick actions.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(({ label, value, icon: Icon, gradient, glow }) => (
          <div
            key={label}
            className="bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl p-5 flex items-center gap-4"
          >
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${glow} shrink-0`}>
              <Icon className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/6 dark:border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Activity</h2>
            <Link href="/admin/audit-logs" className="text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 font-medium transition-opacity">
              View all →
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <EmptyState icon={Activity} title="No audit entries yet." className="py-10" />
          ) : (
            <div className="divide-y divide-black/4 dark:divide-white/6">
              {recentAudit.map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-center gap-3 text-xs hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors">
                  <span className="font-mono px-2 py-0.5 rounded-lg text-[10px] shrink-0 whitespace-nowrap
                                   bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-slate-300">
                    {log.action}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 truncate flex-1 font-medium">
                    {log.actor?.displayName ?? "System"}
                  </span>
                  <span className="text-slate-400 dark:text-slate-600 shrink-0 whitespace-nowrap">
                    {log.createdAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/6 dark:border-border">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Submission Status</h2>
          </div>
          <div className="p-5">
            {Object.keys(statusMap).length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">No submissions yet.</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(statusMap).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <StatusBadge status={status} />
                    <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ href, label, desc, icon: Icon, gradient, glow }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl p-4
                         hover:border-black/15 hover:-translate-y-0.5 hover:shadow-md
                         dark:hover:bg-white/9 dark:hover:border-white/15 dark:hover:shadow-none
                         transition-all duration-200 flex flex-col overflow-hidden relative"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${glow} mb-3 group-hover:scale-105 transition-transform duration-200`}>
                <Icon className="w-4.5 h-4.5 text-white w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-1">{desc}</p>
              <ArrowRight className="absolute bottom-4 right-4 w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-orange-500 dark:group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all duration-200" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
