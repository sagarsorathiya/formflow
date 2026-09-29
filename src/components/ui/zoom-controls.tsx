"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zoom control for long/dense forms — lets a user scale the form up for
 * readability without changing their whole browser zoom.
 *
 * Fixed steps rather than free ±%: predictable, and every step lands on a value
 * that keeps text crisp. The choice is persisted per browser so a user who
 * needs 125% doesn't have to set it on every form.
 */

const STEPS = [70, 80, 90, 100, 110, 125, 150, 175, 200] as const;

/**
 * The form's layout width, in its own (unzoomed) coordinate space — matches the
 * `max-w-3xl` the fill page used before zoom existed.
 *
 * This must be applied INSIDE the zoomed element, never on an ancestor. Capping
 * an ancestor makes zoom shrink the layout width instead of growing the rendered
 * one: at 125% a 768px cap leaves only 614px of layout, so the text re-wraps
 * narrower and the surrounding whitespace never gets used. Inside, 768px of
 * layout renders as 768 x zoom on screen — which is the point.
 */
export const FORM_BASE_WIDTH = 768;

/** On-screen width of the zoomed form — use it to align unzoomed chrome (headers). */
export function scaledWidth(zoom: number): number {
  return Math.round((FORM_BASE_WIDTH * zoom) / 100);
}

const DEFAULT = 100;
const STORAGE_KEY = "formZoom";

export function useFormZoom() {
  const [zoom, setZoom] = useState<number>(DEFAULT);

  // Read after mount, never during render — the server has no localStorage and
  // a mismatch would hydrate-error (same pattern as the sidebar collapse state).
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      if (STEPS.includes(stored as (typeof STEPS)[number])) setZoom(stored);
    } catch {
      /* blocked storage — stay at 100% */
    }
  }, []);

  const persist = useCallback((next: number) => {
    setZoom(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* non-fatal: the choice just won't survive a reload */
    }
  }, []);

  const zoomIn = useCallback(() => {
    const i = STEPS.indexOf(zoom as (typeof STEPS)[number]);
    persist(STEPS[Math.min(i + 1, STEPS.length - 1)]);
  }, [zoom, persist]);

  const zoomOut = useCallback(() => {
    const i = STEPS.indexOf(zoom as (typeof STEPS)[number]);
    persist(STEPS[Math.max(i - 1, 0)]);
  }, [zoom, persist]);

  const reset = useCallback(() => persist(DEFAULT), [persist]);

  return { zoom, zoomIn, zoomOut, reset, canZoomIn: zoom < STEPS[STEPS.length - 1], canZoomOut: zoom > STEPS[0] };
}

/**
 * Style for the element being zoomed.
 *
 * `zoom` is used where supported (Chrome, Edge, Safari, Firefox 126+) because it
 * REFLOWS — the form re-wraps to the new size and the page scrolls normally.
 * `transform: scale()` does not reflow: it paints the same layout larger, which
 * clips wide fields and leaves the scroll height wrong. The transform branch is
 * only a fallback for older Firefox.
 */
export function zoomStyle(zoom: number): React.CSSProperties {
  if (zoom === 100) return {};

  const supportsZoom =
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "1.5");

  if (supportsZoom) return { zoom: zoom / 100 };

  // Fallback for browsers without `zoom` (Firefox < 126). It scales visually but
  // does not reflow or reserve vertical space, so it is deliberately minimal —
  // the caller's max-width still applies inside the scaled box.
  return {
    transform: `scale(${zoom / 100})`,
    transformOrigin: "top center",
  };
}

export function ZoomControls({
  zoom,
  zoomIn,
  zoomOut,
  reset,
  canZoomIn,
  canZoomOut,
  className,
}: ReturnType<typeof useFormZoom> & { className?: string }) {
  const btn =
    "w-7 h-7 flex items-center justify-center rounded-lg transition-colors " +
    "text-slate-500 hover:text-slate-900 hover:bg-slate-100 " +
    "dark:text-slate-400 dark:hover:text-white dark:hover:bg-muted/70 " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border p-1",
        "bg-white border-black/8 shadow-card",
        "dark:bg-card dark:border-border dark:shadow-none",
        className
      )}
      role="group"
      aria-label="Form zoom"
    >
      <button type="button" onClick={zoomOut} disabled={!canZoomOut} className={btn} aria-label="Zoom out" title="Zoom out">
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      <span
        className="min-w-[46px] text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300"
        aria-live="polite"
      >
        {zoom}%
      </span>

      <button type="button" onClick={zoomIn} disabled={!canZoomIn} className={btn} aria-label="Zoom in" title="Zoom in">
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {zoom !== 100 && (
        <button type="button" onClick={reset} className={btn} aria-label="Reset zoom to 100%" title="Reset zoom">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
