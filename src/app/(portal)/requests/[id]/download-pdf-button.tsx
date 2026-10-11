"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 15; // ~30s — generation normally takes a second or two

interface DownloadPdfButtonProps {
  submissionId: string;
  serialNo: string | null;
}

/**
 * The PDF route answers 202 while the worker is still generating the file.
 * Instead of letting the browser show that JSON, poll until it is ready and
 * then save it — one click, one download.
 */
export function DownloadPdfButton({ submissionId, serialNo }: DownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const res = await fetch(`/api/submissions/${submissionId}/pdf`, { cache: "no-store" });

        if (res.status === 202) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setError(json?.error?.message ?? "Could not download the PDF.");
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(serialNo ?? submissionId).replace(/[^a-z0-9-]/gi, "_")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      setError("The PDF is taking longer than usual. Please try again in a minute.");
    } catch {
      setError("Could not download the PDF.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors
                   bg-slate-100 border border-black/8 text-slate-600 hover:bg-slate-200 disabled:opacity-70
                   dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-muted"
      >
        {loading ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {loading ? "Preparing PDF…" : "Download PDF"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
