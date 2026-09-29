"use client";

import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogOut } from "lucide-react";

export function AdminNav({ user }: { user: Session["user"] }) {
  const initials = (user.name ?? "A")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <header
      className="h-14 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30
                 bg-white/80 dark:bg-transparent
                 border-b border-black/8 dark:border-border
                 backdrop-blur-md dark:backdrop-blur-none"
      role="banner"
    >
      {/* Spacer matching sidebar width */}
      <div className="hidden lg:block w-[224px] shrink-0" />

      {/* Page label */}
      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest hidden sm:block">
        Admin Console
      </span>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        {/* User pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-black/8 dark:border-border">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-orange-400/30 shrink-0"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            {initials}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{user.name}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-8 h-8 flex items-center justify-center rounded-xl
                     text-slate-400 hover:text-red-500 hover:bg-red-50
                     dark:hover:text-red-400 dark:hover:bg-red-500/10
                     transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
