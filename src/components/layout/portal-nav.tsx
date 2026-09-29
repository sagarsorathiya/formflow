"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  ClipboardList,
  CheckCircle2,
  FileText,
  BarChart3,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import type { Session } from "next-auth";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

interface PortalNavProps {
  user: Session["user"];
  children: React.ReactNode;
  pendingApprovals?: number;
}

const MAIN_NAV = [
  { href: "/dashboard", label: "Home",      icon: Home,         roles: null as string[] | null, exact: true },
  { href: "/requests",  label: "Requests",  icon: ClipboardList, roles: null, exact: false },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2,  roles: null, exact: false, badge: true },
  { href: "/forms",     label: "Forms",     icon: FileText,      roles: null, exact: false },
  { href: "/reports",   label: "Reports",   icon: BarChart3,     roles: ["DEPT_ADMIN", "SUPER_ADMIN"], exact: false },
];

const ADMIN_NAV = [
  { href: "/admin",            label: "Admin Panel",  icon: LayoutDashboard, roles: ["SUPER_ADMIN"] },
  { href: "/builder",          label: "Form Builder", icon: Layers,          roles: ["SUPER_ADMIN", "DEPT_ADMIN"] },
  { href: "/admin/audit-logs", label: "Audit Logs",   icon: ShieldCheck,     roles: ["SUPER_ADMIN"] },
];

export function PortalNav({ user, children, pendingApprovals = 0 }: PortalNavProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Collapsed desktop sidebar. Read from localStorage AFTER mount, never during
  // render, so the server and first client render agree (same reason the theme
  // script in layout.tsx runs inline rather than in React).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
    } catch {
      /* private mode / blocked storage — stay expanded */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", String(next));
      } catch {
        /* non-fatal: the choice just won't survive a reload */
      }
      return next;
    });
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const initials = (user.name ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const visibleAdminNav = ADMIN_NAV.filter((item) => item.roles.includes(user.role));

  const renderSidebar = (isCollapsed: boolean) => (
    <div className="flex flex-col h-full select-none">
      {/* Logo */}
      <div className={cn("h-[60px] flex items-center shrink-0", isCollapsed ? "px-0 justify-center" : "px-4")}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group"
          onClick={() => setSidebarOpen(false)}
          title={isCollapsed ? "FormFlow" : undefined}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform duration-200"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          {!isCollapsed && (
            <div>
              <p className="text-white font-bold text-sm leading-none tracking-tight">FormFlow</p>
              <p className="text-slate-500 text-[10px] leading-tight mt-0.5 font-medium">Enterprise Portal</p>
            </div>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-0.5" aria-label="Main navigation">
        {MAIN_NAV.map((item) => {
          if (item.roles && !item.roles.includes(user.role)) return null;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              title={isCollapsed ? item.label : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isCollapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-white/12 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              )}
            >
              <item.icon
                className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-colors",
                  active ? "text-orange-400" : "text-slate-500 group-hover:text-slate-300"
                )}
                aria-hidden="true"
              />
              {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              {item.badge && pendingApprovals > 0 && (
                <span
                  className={cn(
                    "rounded-full bg-orange-500 text-white font-bold flex items-center justify-center leading-none",
                    // Collapsed: a dot on the icon, since a count would not fit.
                    isCollapsed
                      ? "absolute top-1 right-1 w-2 h-2"
                      : "h-5 min-w-[20px] px-1.5 text-[10px]"
                  )}
                >
                  {isCollapsed ? "" : pendingApprovals > 99 ? "99+" : pendingApprovals}
                </span>
              )}
              {!isCollapsed && active && !item.badge && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" aria-hidden="true" />
              )}
            </Link>
          );
        })}

        {visibleAdminNav.length > 0 && (
          <div className="pt-3">
            {isCollapsed ? (
              <div className="mx-auto mb-1.5 h-px w-6 bg-white/10" aria-hidden="true" />
            ) : (
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-1.5">
                Admin
              </p>
            )}
            <div className="space-y-0.5">
              {visibleAdminNav.map((item) => {
                const active = item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={`admin-${item.label}`}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={isCollapsed ? item.label : undefined}
                    aria-label={isCollapsed ? item.label : undefined}
                    className={cn(
                      "group flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                      isCollapsed ? "justify-center px-0" : "px-3",
                      active
                        ? "bg-white/12 text-white"
                        : "text-slate-400 hover:text-white hover:bg-white/6"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "w-[18px] h-[18px] shrink-0 transition-colors",
                        active ? "text-orange-400" : "text-slate-500 group-hover:text-slate-300"
                      )}
                      aria-hidden="true"
                    />
                    {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* User profile */}
      <div className="shrink-0 px-2.5 pb-3 pt-2 border-t border-white/6 space-y-0.5">
        {/* Avatar + name row */}
        <div className={cn("flex items-center gap-2.5 py-2", isCollapsed ? "justify-center px-0" : "px-2")}>
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-white/10"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0b1120]" aria-hidden="true" />
          </div>
          {!isCollapsed && (
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">{user.name}</p>
            <p className="text-slate-500 text-[10px] truncate leading-tight mt-px uppercase tracking-wide">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
          )}
        </div>

        {/* Settings + Sign out — side by side */}
        <div className={cn("gap-1.5", isCollapsed ? "flex flex-col items-center px-0" : "flex px-1")}>
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            title={isCollapsed ? "Settings" : undefined}
            className={cn(
              "group flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 text-slate-400 hover:text-white hover:bg-white/6",
              isCollapsed ? "w-9" : "flex-1"
            )}
          >
            <Settings className="w-3.5 h-3.5 shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" aria-hidden="true" />
            {!isCollapsed && <span>Settings</span>}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={isCollapsed ? "Sign out" : undefined}
            aria-label="Sign out"
            className={cn(
              "group flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 text-red-400/80 hover:text-red-300 hover:bg-red-500/10",
              isCollapsed ? "w-9" : "flex-1"
            )}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0 transition-colors" aria-hidden="true" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    /* Root: light bg default, dark bg in dark mode */
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0b1120]">

      {/* Desktop sidebar — always dark */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 border-r border-white/6 transition-[width] duration-200 ease-out",
          collapsed ? "w-[68px]" : "w-[224px]"
        )}
        style={{ background: "rgba(11,17,32,0.98)" }}
        aria-label="Application sidebar"
      >
        {renderSidebar(collapsed)}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile sidebar — always dark */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[224px] flex flex-col lg:hidden transition-transform duration-200 ease-out border-r border-white/6",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: "#0b1120" }}
        aria-label="Navigation menu"
      >
        <button
          className="absolute top-4 right-3 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors z-10"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
        {renderSidebar(false)}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar — frosted glass on light, transparent on dark */}
        <header className="h-14 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30
                           bg-white/80 dark:bg-transparent
                           border-b border-black/8 dark:border-border
                           backdrop-blur-md dark:backdrop-blur-none">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl
                       text-slate-500 dark:text-slate-400
                       hover:bg-slate-100 dark:hover:bg-muted/80
                       hover:text-slate-900 dark:hover:text-white
                       transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          {/* Desktop sidebar collapse toggle */}
          <button
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-xl
                       text-slate-500 dark:text-slate-400
                       hover:bg-slate-100 dark:hover:bg-muted/80
                       hover:text-slate-900 dark:hover:text-white
                       transition-colors"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
              : <PanelLeftClose className="w-5 h-5" aria-hidden="true" />}
          </button>


          {/* Right controls */}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />

          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
