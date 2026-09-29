"use client";

import { useEffect, useState } from "react";
import { EyeOff, Lock, Repeat1, Loader2 } from "lucide-react";

/**
 * Form-level privacy / submission rules: anonymous, one-time-only, confidential.
 * Saved to `Form` via PATCH /api/forms/[id] — these are Form metadata, not
 * FormVersion content, so (like title and description) they can be changed while
 * the form is published without cutting a new version.
 */

interface FormRules {
  anonymous: boolean;
  oneTimeOnly: boolean;
  confidential: boolean;
}

interface Props {
  formId: string;
  initial: FormRules;
}

const RULES: {
  key: keyof FormRules;
  icon: typeof EyeOff;
  title: string;
  /** One line, shown inline. */
  summary: string;
  /** Full explanation, shown on hover. */
  detail: string;
}[] = [
  {
    key: "anonymous",
    icon: EyeOff,
    title: "Anonymous",
    summary: "Hide who submitted from reports, exports, approvals and the PDF.",
    detail:
      "The submitter's name, email, department and designation are withheld everywhere except from the submitter themselves. Approval routing still works — the workflow resolves approvers from the database, not from what is displayed.",
  },
  {
    key: "oneTimeOnly",
    icon: Repeat1,
    title: "One submission per person",
    summary: "Each user can submit once; a cancelled entry frees the slot.",
    detail:
      "Users can still edit or cancel their own entry within the usual 15-minute grace window. Applies across all versions of the form.",
  },
  {
    key: "confidential",
    icon: Lock,
    title: "Confidential",
    summary: "Hide field values and files from Super Admins; status stays visible.",
    detail:
      "Super Admins still see serial number, status, dates and approval trail. The submitter, assigned approvers and this department's admin are unaffected. Not a hard security boundary: a server administrator retains database access. Flag changes are audited.",
  },
];

export function FormRulesPanel({ formId, initial }: Props) {
  const [rules, setRules] = useState<FormRules>(initial);
  const [saving, setSaving] = useState<keyof FormRules | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRules(initial), [initial]);

  async function toggle(key: keyof FormRules) {
    const next = { ...rules, [key]: !rules[key] };
    setRules(next);
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRules(rules); // roll back the optimistic toggle
        setError(json?.error?.message ?? "Could not save that setting.");
      }
    } catch {
      setRules(rules);
      setError("Network error — setting not saved.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-black/8 p-4 space-y-3 dark:bg-card dark:border-border">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Form Rules</h2>
        <p className="text-xs text-slate-400">Privacy and submission limits. Apply immediately.</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700
                      dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="divide-y divide-black/6 dark:divide-border">
        {RULES.map(({ key, icon: Icon, title, summary, detail }) => {
          const on = rules[key];
          return (
            <label
              key={key}
              htmlFor={`rule-${key}`}
              title={detail}
              className="flex cursor-pointer items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${on ? "text-orange-600 dark:text-orange-400" : "text-slate-400"}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{summary}</span>
              </span>
              {saving === key && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-400" aria-hidden="true" />}
              <input
                id={`rule-${key}`}
                type="checkbox"
                checked={on}
                disabled={saving !== null}
                onChange={() => toggle(key)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-orange-600 focus:ring-orange-500/30 disabled:opacity-50"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
