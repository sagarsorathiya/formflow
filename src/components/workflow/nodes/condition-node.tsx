"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConditionNodeConfig } from "@/lib/types/schema";

interface ConditionNodeData extends ConditionNodeConfig {
  label?: string;
  [key: string]: unknown;
}

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as ConditionNodeData;
  const branchCount = (d.branches ?? []).length;
  return (
    <div
      className={`bg-white dark:bg-[#1a2236] rounded-xl border-2 shadow-md min-w-[160px] max-w-[200px] transition-colors ${
        selected ? "border-primary" : "border-blue-400 dark:border-blue-500/60"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400" />
      <div className="bg-blue-50 dark:bg-blue-500/10 rounded-t-xl px-3 py-1.5 border-b border-blue-200 dark:border-blue-500/20">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
          <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 truncate">
            {d.label ?? "Condition"}
          </span>
        </div>
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {branchCount} branch{branchCount !== 1 ? "es" : ""}
          {d.elseBranchTarget ? " + else" : ""}
        </p>
      </div>
      {(d.branches ?? []).length > 0 ? (
        (d.branches ?? []).map((branch, idx) => (
          <Handle
            key={branch.id ?? idx}
            type="source"
            position={Position.Bottom}
            id={branch.id ?? String(idx)}
            style={{ left: `${((idx + 1) / ((d.branches?.length ?? 1) + 1)) * 100}%` }}
            className="!bg-blue-400"
          />
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} id="default" className="!bg-blue-400" />
      )}
    </div>
  );
}
