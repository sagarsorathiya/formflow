"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ApprovalNodeConfig } from "@/lib/types/schema";

const STRATEGY_LABELS: Record<string, string> = {
  "specific-users": "Specific Users",
  "submitter-manager": "Submitter's Manager",
  "dept-head": "Department Head",
  designation: "By Designation",
  "app-role": "By Role",
  "ad-group": "AD Group",
  "dynamic-field": "From Form Field",
};

interface ApprovalNodeData extends ApprovalNodeConfig {
  label?: string;
  [key: string]: unknown;
}

export function ApprovalNode({ data, selected }: NodeProps) {
  const d = data as ApprovalNodeData;
  return (
    <div
      className={`bg-white dark:bg-[#1a2236] rounded-xl border-2 shadow-md min-w-[180px] max-w-[220px] transition-colors ${
        selected ? "border-primary" : "border-amber-400 dark:border-amber-500/60"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-400" />
      <div className="bg-amber-50 dark:bg-amber-500/10 rounded-t-xl px-3 py-1.5 border-b border-amber-200 dark:border-amber-500/20">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">
            {d.label ?? "Approval"}
          </span>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {STRATEGY_LABELS[d.assigneeStrategy ?? ""] ?? d.assigneeStrategy ?? "—"}
          {d.assigneeValue ? (
            <span className="ml-1 font-medium text-slate-700 dark:text-slate-300">
              {Array.isArray(d.assigneeValue)
                ? `(${d.assigneeValue.length})`
                : `"${d.assigneeValue}"`}
            </span>
          ) : null}
        </p>
        <div className="flex gap-2 flex-wrap">
          {d.anyOneApproves === false ? (
            <span className="text-[10px] bg-slate-100 dark:bg-muted/80 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">All must approve</span>
          ) : (
            <span className="text-[10px] bg-slate-100 dark:bg-muted/80 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">Any one approves</span>
          )}
          {d.allowReturn && (
            <span className="text-[10px] bg-violet-50 text-violet-700 rounded px-1.5 py-0.5">Can return</span>
          )}
          {d.slaDays && (
            <span className="text-[10px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">SLA {d.slaDays}d</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400" />
    </div>
  );
}
