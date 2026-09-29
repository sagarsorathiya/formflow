"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

interface DeleteFormButtonProps {
  formId: string;
  /** If true, redirect to /builder after deletion instead of router.refresh() */
  redirectAfter?: boolean;
}

export function DeleteFormButton({ formId, redirectAfter = false }: DeleteFormButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error?.message ?? "Delete failed");
        setConfirming(false);
        return;
      }
      if (redirectAfter) {
        window.location.href = "/builder";
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-red-600 dark:text-red-400 font-medium">Delete?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
        >
          {loading ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 dark:text-white/20 dark:hover:text-red-400 transition-all"
      title="Delete form"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
