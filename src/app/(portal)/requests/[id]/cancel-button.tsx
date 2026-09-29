"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface CancelButtonProps {
  submissionId: string;
  serialNo: string;
  isSuperAdmin?: boolean;
}

export function CancelButton({ submissionId, serialNo, isSuperAdmin }: CancelButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Cancel failed.");
        setConfirming(false);
        return;
      }
      if (isSuperAdmin) {
        router.refresh();
      } else {
        router.push("/requests?cancelled=true");
      }
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5
                      dark:bg-red-500/10 dark:border-red-500/30">
        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        <span className="text-xs text-red-700 dark:text-red-300 font-medium">
          Cancel {serialNo}?
        </span>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-xs font-bold text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 disabled:opacity-50 transition"
        >
          {loading ? <Spinner className="w-3.5 h-3.5" /> : "Yes, cancel"}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null); }}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
        >
          Keep
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors
                 border border-red-200 text-red-600 hover:bg-red-50
                 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Cancel Request
    </button>
  );
}
