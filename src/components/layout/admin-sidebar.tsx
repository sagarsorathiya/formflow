"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Link2,
  ClipboardList,
  ScrollText,
  ArrowLeftRight,
  Settings,
  ChevronLeft,
  Archive,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin",               label: "Dashboard",     icon: LayoutDashboard, exact: true },
  { href: "/admin/organization",  label: "Organisation",  icon: Building2 },
  { href: "/admin/users",         label: "Users & Roles", icon: Users },
  { href: "/admin/role-mappings", label: "Role Mappings", icon: Link2 },
  { href: "/admin/submissions",   label: "Submissions",   icon: ClipboardList },
  { href: "/admin/audit-logs",    label: "Audit Log",     icon: ScrollText },
  { href: "/admin/reassign",      label: "Reassignment",  icon: ArrowLeftRight },
  { href: "/admin/forms",         label: "Archived Forms", icon: Archive },
  { href: "/admin/settings",      label: "Settings",      icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-[224px] shrink-0 flex flex-col border-r border-white/6"
      style={{ background: "rgba(11,17,32,0.98)" }}
      aria-label="Admin sidebar"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 shrink-0 border-b border-white/6">
        <Link href="/admin" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none tracking-tight">FormFlow</p>
            <p className="text-slate-500 text-[10px] leading-tight mt-0.5 font-medium">Admin Console</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Admin navigation">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-2">
          Admin Console
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white/12 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              )}
            >
              <Icon
                className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-colors",
                  active ? "text-orange-400" : "text-slate-500 group-hover:text-slate-300"
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{label}</span>
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Back to portal */}
      <div className="shrink-0 px-2.5 pb-3 pt-2 border-t border-white/6">
        <Link
          href="/dashboard"
          className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-slate-400 hover:text-white hover:bg-white/6"
        >
          <ChevronLeft className="w-[18px] h-[18px] shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" aria-hidden="true" />
          <span>Back to Portal</span>
        </Link>
      </div>
    </aside>
  );
}
