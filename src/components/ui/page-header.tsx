import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && (
        <div className="mb-2 text-sm text-slate-500 dark:text-slate-400">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
