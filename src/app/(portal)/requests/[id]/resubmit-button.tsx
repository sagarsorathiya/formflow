"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResubmitButtonProps {
  submissionId: string;
  dataJson: Record<string, unknown>;
}

export function ResubmitButton({ submissionId, dataJson }: ResubmitButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleResubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataJson }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Resubmit failed. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          {error}
        </p>
      )}
      <button
        onClick={handleResubmit}
        disabled={loading}
        className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg
                   hover:bg-primary/90 transition disabled:opacity-60"
      >
        {loading ? "Resubmitting…" : "Resubmit Request"}
      </button>
    </div>
  );
}
