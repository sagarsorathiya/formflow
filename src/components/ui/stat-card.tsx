import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ColorVariant = "blue" | "green" | "amber" | "violet" | "slate" | "red";

const COLOR_MAP: Record<ColorVariant, { bg: string; text: string; icon: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   icon: "bg-blue-100 text-blue-600" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  icon: "bg-green-100 text-green-600" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  icon: "bg-amber-100 text-amber-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", icon: "bg-violet-100 text-violet-600" },
  slate:  { bg: "bg-slate-50",  text: "text-slate-700",  icon: "bg-slate-100 text-slate-500" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    icon: "bg-red-100 text-red-600" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: ColorVariant;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, color = "blue", trend, className }: StatCardProps) {
  const colors = COLOR_MAP[color];
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trend.value >= 0 ? "text-green-600" : "text-red-600")}>
              {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2.5", colors.icon)}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
