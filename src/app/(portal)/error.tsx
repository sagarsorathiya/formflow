"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 mb-4">
        <AlertTriangle className="h-7 w-7 text-red-400" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="mt-1 text-sm text-slate-500 max-w-xs leading-relaxed">
        An unexpected error occurred. Please try again or return to the dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-slate-400 font-mono">Error ID: {error.digest}</p>
      )}
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={reset} size="sm" variant="outline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild size="sm">
          <Link href="/dashboard">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
