"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Clock } from "lucide-react";

const GRACE_PERIOD_MS = 15 * 60 * 1000;

interface EditButtonProps {
  submissionId: string;
  createdAt: string; // ISO string
  hasApproverActed: boolean;
  status: string;
}

export function EditButton({ submissionId, createdAt, hasApproverActed, status }: EditButtonProps) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState<number>(0);

  useEffect(() => {
    function calc() {
      const age = Date.now() - new Date(createdAt).getTime();
      setRemainingMs(Math.max(0, GRACE_PERIOD_MS - age));
    }
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  // Not editable if grace period expired, approver acted, or terminal status
  if (
    remainingMs === 0 ||
    hasApproverActed ||
    ["REJECTED", "CANCELLED", "RETURNED"].includes(status)
  ) {
    return null;
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

  // Warn when under 3 minutes
  const isUrgent = remainingMs < 3 * 60 * 1000;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
          isUrgent
            ? "text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30"
            : "text-amber-600 bg-amber-50 border border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30"
        }`}
      >
        <Clock className="h-3 w-3" />
        {countdown} to edit
      </span>
      <button
        onClick={() => router.push(`/requests/${submissionId}/edit`)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors
                   bg-slate-100 border border-black/8 text-slate-600 hover:bg-slate-200
                   dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit Request
      </button>
    </div>
  );
}
