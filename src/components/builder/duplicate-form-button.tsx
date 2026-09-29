"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";

/**
 * Duplicates a form and opens the copy in the builder.
 *
 * Two-step inline confirm, matching `delete-form-button.tsx`'s convention in
 * this folder rather than introducing a dialog — the builder list has no modal
 * primitive and the action is cheap to undo (the copy is a DRAFT nobody sees).
 */
export function DuplicateFormButton({ formId, title }: { formId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${formId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Could not duplicate this form.");
        setConfirming(false);
        return;
      }
      // Land in the copy's builder — the whole point is to edit it next.
      router.push(`/builder/${json.data.id}`);
    } catch {
      setError("Network error.");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <span className="text-xs text-red-600 dark:text-red-400" title={error}>
        {error}
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
        <span className="text-slate-500 dark:text-slate-400">Copy?</span>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={loading}
          className="font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-50"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`Duplicate "${title}"`}
      aria-label={`Duplicate ${title}`}
      className="text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
    >
      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}
