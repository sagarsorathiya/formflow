"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";

export function DeleteUserButton({ userId, displayName }: { userId: string; displayName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) { setError(d.error?.message ?? "Delete failed."); setLoading(false); return; }
      router.push("/admin/users");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (step === "idle") {
    return (
      <button
        onClick={() => { setStep("confirm"); setError(null); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete User
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Delete {displayName}?</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
            This permanently removes the account. Only allowed if the user has no submitted forms. This cannot be undone.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Yes, delete permanently
        </button>
        <button
          onClick={() => { setStep("idle"); setError(null); }}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
