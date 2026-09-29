import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFormVisibleToUser, isCompanyHeadDesignation } from "@/lib/audience";
import {
  Plus,
  ClipboardList,
  CheckCircle2,
  LayoutGrid,
  BarChart3,
  ArrowRight,
  FileText,
  CalendarDays,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard — FormFlow" };

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const { user } = session;
  const firstName = user.name?.split(" ")[0] ?? "there";
  const userId = user.id;
  const isManager = user.role === "DEPT_ADMIN" || user.role === "SUPER_ADMIN";

  const [pendingTasks, recentActivity, recentForms, pendingCount, audienceUser] = await Promise.all([
    prisma.workflowTask.findMany({
      where: { resolvedAssigneeIds: { has: userId }, status: "PENDING" },
      include: {
        submission: {
          include: {
            formVersion: { include: { form: { select: { title: true } } } },
            submittedBy: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.submission.findMany({
      where: { submittedById: userId, status: { not: "DRAFT" } },
      include: {
        formVersion: { include: { form: { select: { title: true } } } },
        submittedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.form.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, slug: true, title: true, department: { select: { name: true } }, audience: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workflowTask.count({
      where: { resolvedAssigneeIds: { has: userId }, status: "PENDING" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, departmentId: true, designation: true, adGroups: true },
    }),
  ]);

  const isCompanyHead = await isCompanyHeadDesignation(audienceUser?.designation ?? null);
  const audienceContext = audienceUser ? { ...audienceUser, isCompanyHead, role: user.role } : null;
  const featuredForms = recentForms
    .filter((form) => isFormVisibleToUser(form.audience, audienceContext))
    .slice(0, 4);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const LAUNCHPAD = [
    {
      href: "/forms",
      label: "Create Request",
      desc: "Start a new request or submission",
      icon: Plus,
      gradient: "from-orange-500 to-amber-500",
      glow: "shadow-orange-500/20",
      badge: null as number | null,
      show: true,
    },
    {
      href: "/requests",
      label: "My Requests",
      desc: "Track and manage your requests",
      icon: ClipboardList,
      gradient: "from-emerald-500 to-teal-600",
      glow: "shadow-emerald-500/20",
      badge: null,
      show: true,
    },
    {
      href: "/approvals",
      label: "Approvals",
      desc: "Review and take action on pending items",
      icon: CheckCircle2,
      gradient: "from-orange-500 to-red-500",
      glow: "shadow-orange-500/20",
      badge: pendingCount > 0 ? pendingCount : null,
      show: true,
    },
    {
      href: "/forms",
      label: "Browse Forms",
      desc: "Explore and fill available forms",
      icon: LayoutGrid,
      gradient: "from-indigo-500 to-purple-600",
      glow: "shadow-indigo-500/20",
      badge: null,
      show: true,
    },
    {
      href: "/reports",
      label: "Reports",
      desc: "View analytics and insights",
      icon: BarChart3,
      gradient: "from-purple-500 to-violet-600",
      glow: "shadow-purple-500/20",
      badge: null,
      show: isManager,
    },
  ].filter((c) => c.show);

  return (
    <div className="flex min-h-full">
      {/* Main content */}
      <div className="flex-1 min-w-0 p-6 space-y-6 overflow-x-hidden">

        {/* Greeting row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {getGreeting()}, {firstName}! 👋
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Let&apos;s get things done. What would you like to do today?
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-black/8 rounded-xl px-3.5 py-2 shrink-0
                          dark:bg-muted/60 dark:border-border">
            <CalendarDays className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">{dateStr}</span>
          </div>
        </div>

        {/* Launchpad */}
        <div>
          <h2 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
            Launchpad
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {LAUNCHPAD.map((card) => (
              <Link
                key={card.href + card.label}
                href={card.href}
                className="group relative bg-white border border-black/8 rounded-2xl p-4
                           hover:border-black/15 hover:-translate-y-0.5 hover:shadow-md
                           transition-all duration-200 overflow-hidden flex flex-col
                           dark:bg-card dark:border-border dark:hover:bg-muted/80 dark:hover:border-white/15 dark:hover:shadow-none"
              >
                {/* Icon + optional badge */}
                <div className="relative mb-3 self-start">
                  <div
                    className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg ${card.glow} group-hover:scale-105 transition-transform duration-200`}
                  >
                    <card.icon className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  {card.badge != null && (
                    <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {card.badge > 99 ? "99+" : card.badge}
                    </span>
                  )}
                </div>

                <p className="text-slate-900 dark:text-white font-semibold text-sm leading-tight">{card.label}</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed flex-1 line-clamp-2">
                  {card.desc}
                </p>
                <ArrowRight
                  className="absolute bottom-3.5 right-3.5 w-3.5 h-3.5 text-slate-300 group-hover:text-orange-500 dark:text-slate-600 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-200"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Featured Forms */}
        {featuredForms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Recently Added Forms
              </h2>
              <Link
                href="/forms"
                className="text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 font-medium transition-opacity"
              >
                View all
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {featuredForms.map((form) => (
                <Link
                  key={form.id}
                  href={`/forms/${form.slug ?? form.id}`}
                  className="group bg-white border border-black/8 rounded-xl p-3.5
                             hover:border-black/12 hover:shadow-sm transition-all duration-150
                             dark:bg-card dark:border-border dark:hover:bg-muted/70 dark:hover:border-white/12 dark:hover:shadow-none"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-white" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-900 dark:text-white text-xs font-semibold truncate leading-tight group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        {form.title}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-0.5 truncate">
                        {form.department?.name ?? "General"}
                      </p>
                    </div>
                    <svg
                      className="w-3 h-3 text-amber-400 shrink-0 fill-current mt-0.5"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside className="hidden xl:flex w-[296px] flex-col shrink-0 border-l border-black/6 dark:border-border p-4 space-y-4 overflow-y-auto">

        {/* My Tasks */}
        <div className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/6 dark:border-border">
            <h3 className="text-slate-900 dark:text-white text-sm font-semibold">My Tasks</h3>
            <Link
              href="/approvals"
              className="text-[11px] text-orange-600 dark:text-orange-400 hover:opacity-80 font-medium transition-opacity"
            >
              View all
            </Link>
          </div>
          <div className="p-2.5">
            {pendingTasks.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 dark:text-emerald-400 mx-auto mb-1.5" aria-hidden="true" />
                <p className="text-slate-400 dark:text-slate-500 text-xs">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {pendingTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/approvals/${task.id}`}
                    className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-muted/60 transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-black/6 dark:bg-muted/60 dark:border-border flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-900 dark:text-white text-xs font-medium truncate leading-tight group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        {task.submission.formVersion.form.title}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-0.5 truncate">
                        Requested by {task.submission.submittedBy.displayName ?? "Unknown"}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-600 whitespace-nowrap mt-0.5 shrink-0">
                      {formatTimeAgo(task.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/6 dark:border-border">
            <h3 className="text-slate-900 dark:text-white text-sm font-semibold">Recent Activity</h3>
            <Link
              href="/requests"
              className="text-[11px] text-orange-600 dark:text-orange-400 hover:opacity-80 font-medium transition-opacity"
            >
              View all
            </Link>
          </div>
          <div className="p-3 space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-slate-400 dark:text-slate-500 text-xs text-center py-4">No recent activity.</p>
            ) : (
              recentActivity.map((sub) => {
                const name = sub.submittedBy.displayName ?? "Unknown";
                const initial = name[0].toUpperCase();
                const isApproved = sub.status === "APPROVED";
                const avatarBg =
                  isApproved
                    ? "#22c55e"
                    : sub.status === "IN_PROGRESS"
                    ? "#f97316"
                    : "#64748b";
                return (
                  <div key={sub.id} className="flex items-start gap-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white mt-0.5"
                      style={{ background: avatarBg }}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-600 dark:text-slate-300 text-xs leading-snug">
                        <span className="text-slate-900 dark:text-white font-medium">{name}</span>{" "}
                        {isApproved ? (
                          <>
                            {"request was "}
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">approved</span>
                          </>
                        ) : (
                          <>
                            {"submitted "}
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {sub.formVersion.form.title}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-600 whitespace-nowrap mt-0.5 shrink-0">
                      {formatTimeAgo(sub.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
