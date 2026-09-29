"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NotifyNodeConfig } from "@/lib/types/schema";

const STRATEGY_LABELS: Record<string, string> = {
  "specific-users": "Specific Users",
  "submitter-manager": "Submitter's Manager",
  "dept-head": "Department Head",
  designation: "By Designation",
  "app-role": "By Role",
  "ad-group": "AD Group",
  "dynamic-field": "From Form Field",
};

interface NotifyNodeData extends NotifyNodeConfig {
  label?: string;
  [key: string]: unknown;
}

export function NotifyNode({ data, selected }: NodeProps) {
  const d = data as NotifyNodeData;
  return (
    <div
      className={`bg-white dark:bg-[#1a2236] rounded-xl border-2 shadow-md min-w-[160px] max-w-[200px] transition-colors ${
        selected ? "border-primary" : "border-slate-300 dark:border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="bg-slate-50 dark:bg-muted/70 rounded-t-xl px-3 py-1.5 border-b border-slate-200 dark:border-border">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
            {d.label ?? "Notify"}
          </span>
        </div>
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {STRATEGY_LABELS[d.recipientStrategy ?? ""] ?? "—"}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}
