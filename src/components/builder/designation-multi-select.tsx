"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * Multi-select dropdown for audience designations, sourced from the Designation
 * master list (Admin -> Organisation) instead of free-typed text.
 *
 * Values are designation NAMES, not ids. That is deliberate: `FormAudience.designations`
 * has always stored names, and `isFormVisibleToUser()` matches them
 * case-insensitively against `User.designation`, which is also a name string.
 * Switching to ids would silently break every existing form's audience.
 *
 * Values already saved that are NOT in the master list (typed before this
 * dropdown existed, e.g. "DGM", or a designation since renamed/deactivated) are
 * kept and shown with a warning rather than dropped — dropping them would
 * quietly widen who can see the form.
 */

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

const norm = (s: string) => s.trim().toLowerCase();

export function DesignationMultiSelect({ options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedKeys = useMemo(() => new Set(selected.map(norm)), [selected]);
  const knownKeys = useMemo(() => new Set(options.map(norm)), [options]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return q ? options.filter((o) => norm(o).includes(q)) : options;
  }, [options, query]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(name: string) {
    // Match case-insensitively so ticking "Manager" removes a saved "manager".
    const key = norm(name);
    onChange(
      selectedKeys.has(key)
        ? selected.filter((s) => norm(s) !== key)
        : [...selected, name]
    );
  }

  function remove(value: string) {
    onChange(selected.filter((s) => s !== value));
  }

  const summary =
    selected.length === 0
      ? "All designations"
      : `${selected.length} designation${selected.length === 1 ? "" : "s"} selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm
                   text-slate-700 transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30
                   dark:border-border dark:bg-secondary dark:text-slate-200"
      >
        <span className={selected.length === 0 ? "text-slate-400" : ""}>{summary}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-black/8 bg-white shadow-panel
                     dark:border-border dark:bg-card"
        >
          <div className="flex items-center gap-2 border-b border-black/6 px-3 py-2 dark:border-border">
            <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designations..."
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
            />
          </div>

          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">
                {options.length === 0
                  ? "No designations defined. Add them in Admin -> Organisation."
                  : "No match."}
              </li>
            ) : (
              filtered.map((name) => {
                const on = selectedKeys.has(norm(name));
                return (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(name)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-slate-700
                                 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-muted/60"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 dark:border-border"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      {name}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {selected.length > 0 && (
            <div className="flex justify-end border-t border-black/6 px-3 py-1.5 dark:border-border">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((d) => {
            const unknown = !knownKeys.has(norm(d));
            return (
              <span
                key={d}
                title={unknown ? "Not in the designation master list — no user may match this. Remove it or add the designation in Admin -> Organisation." : undefined}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  unknown
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                    : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/15 dark:text-orange-300"
                }`}
              >
                {d}
                {unknown && <span className="font-semibold">(not in list)</span>}
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="ml-0.5 opacity-70 hover:opacity-100"
                  aria-label={`Remove ${d}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
