import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-100 dark:bg-muted/70", className)}
      {...props}
    />
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card", className)}>
      {/* thead */}
      <div className="border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-card px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
      {/* tbody */}
      <div className="divide-y divide-slate-100 dark:divide-white/6">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn("h-3 flex-1", col === 0 ? "max-w-[120px]" : "")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 dark:border-border dark:bg-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

function SkeletonForm({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function SkeletonTimeline({ steps = 3, className }: { steps?: number; className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: steps }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonTable, SkeletonCard, SkeletonForm, SkeletonTimeline };
