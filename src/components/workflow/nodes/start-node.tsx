"use client";

import { Handle, Position } from "@xyflow/react";

export function StartNode() {
  return (
    <div className="bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-md min-w-[90px] text-center">
      Start
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}
