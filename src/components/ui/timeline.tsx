import * as React from "react";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status";

interface TimelineStep {
  label: string;
  actor?: string;
  timestamp?: string | Date | null;
  comment?: string | null;
  status?: string;
  description?: string;
}

interface TimelineProps {
  steps: TimelineStep[];
  className?: string;
}

function variantClass(variant: string | null | undefined): string {
  switch (variant) {
    case "success":     return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "warning":     return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
    case "destructive": return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
    case "violet":      return "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400";
    case "secondary":   return "bg-slate-100 text-slate-600 dark:bg-muted/80 dark:text-slate-400";
    default:            return "bg-slate-100 text-slate-500 dark:bg-muted/70 dark:text-slate-400";
  }
}

function formatTs(ts: string | Date | null | undefined): string {
  if (!ts) return "";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function Timeline({ steps, className }: TimelineProps) {
  return (
    <ol className={cn("space-y-0", className)} aria-label="Approval timeline">
      {steps.map((step, i) => {
        const meta = step.status ? getStatusMeta(step.status) : null;
        const isLast = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3">
            {/* Left: dot + connector line */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2",
                  meta
                    ? "border-transparent"
                    : "border-slate-200 dark:border-border bg-white dark:bg-card"
                )}
              >
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    meta ? meta.dot : "bg-slate-300 dark:bg-white/20"
                  )}
                  aria-hidden="true"
                />
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 bg-slate-200 dark:bg-muted/80 my-1" aria-hidden="true" />
              )}
            </div>

            {/* Right: content */}
            <div className={cn("pb-5 min-w-0 flex-1", isLast && "pb-0")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                  {step.label}
                </span>
                {meta && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      variantClass(meta.variant)
                    )}
                  >
                    {meta.label}
                  </span>
                )}
              </div>
              {step.actor && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {step.actor}
                  {step.timestamp && (
                    <span className="text-slate-400 dark:text-slate-500">
                      {" · "}{formatTs(step.timestamp)}
                    </span>
                  )}
                </p>
              )}
              {step.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
              )}
              {step.comment && (
                <blockquote className="mt-1.5 border-l-2 border-slate-200 dark:border-border pl-3 text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  {step.comment}
                </blockquote>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
