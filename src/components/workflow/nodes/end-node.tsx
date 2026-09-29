"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

interface EndNodeData {
  label?: string;
  [key: string]: unknown;
}

export function EndApprovedNode({ data }: NodeProps) {
  const d = data as EndNodeData;
  return (
    <div className="bg-green-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-md min-w-[110px] text-center">
      <Handle type="target" position={Position.Top} className="!bg-green-400" />
      {d.label ?? "Approved"}
    </div>
  );
}

export function EndRejectedNode({ data }: NodeProps) {
  const d = data as EndNodeData;
  return (
    <div className="bg-red-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-md min-w-[110px] text-center">
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      {d.label ?? "Rejected"}
    </div>
  );
}
