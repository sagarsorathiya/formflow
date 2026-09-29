import { BarChart3, Hash, CalendarRange, Type, Lock } from "lucide-react";
import type { FieldAnalytics } from "@/lib/field-analytics";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Per-question breakdown of what people answered. Server-rendered and purely
 * presentational — the aggregation lives in `src/lib/field-analytics.ts`.
 *
 * Bars are plain divs rather than a charting library: the CSP is `default-src
 * 'self'` (no CDN) and the stack is locked, so adding Recharts for a horizontal
 * bar would be a dependency and a stack deviation for no real gain.
 */

function ResponseRate({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
      {answered} of {total} answered ({pct}%)
    </span>
  );
}

function Card({
  icon: Icon,
  label,
  type,
  answered,
  total,
  children,
}: {
  icon: typeof BarChart3;
  label: string;
  type: string;
  answered: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-card border-black/8
                    dark:bg-card dark:border-border dark:shadow-none">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{label}</h3>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{type}</p>
          </div>
        </div>
        <ResponseRate answered={answered} total={total} />
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-muted/60">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

export function FieldAnalyticsPanel({
  analytics,
  totalSubmissions,
  hidden,
}: {
  analytics: FieldAnalytics[];
  totalSubmissions: number;
  hidden?: boolean;
}) {
  if (hidden) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800
                      dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400">
        <p className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This form is marked <strong>confidential</strong>. Submission counts and status are shown on the
            Submissions tab, but the answers themselves are visible only to the owning department&apos;s admin.
          </span>
        </p>
      </div>
    );
  }

  if (totalSubmissions === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No submissions yet"
        description="Answer breakdowns appear here once this form has been submitted."
      />
    );
  }

  if (analytics.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to summarise"
        description="This form has no questions that can be aggregated — free text, files and signatures are listed on the Submissions tab instead."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {analytics.map((a) => {
        if (a.kind === "choice") {
          const max = Math.max(...a.options.map((o) => o.count), 1);
          return (
            <Card key={a.key} icon={BarChart3} label={a.label} type={a.type} answered={a.answered} total={a.total}>
              <div className="space-y-2">
                {a.options.map((o) => {
                  const noAnswer = o.label === "(no answer)";
                  return (
                    <div key={o.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className={`truncate ${noAnswer ? "italic text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>
                          {o.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                          {o.count}
                          {!noAnswer && <span className="ml-1.5 text-slate-400">{o.percent}%</span>}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted/70">
                        <div
                          className={`h-full rounded-full ${noAnswer ? "bg-slate-300 dark:bg-slate-600" : ""}`}
                          style={{
                            width: `${(o.count / max) * 100}%`,
                            ...(noAnswer ? {} : { background: "linear-gradient(90deg, #f97316, #ea580c)" }),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        }

        if (a.kind === "number") {
          return (
            <Card key={a.key} icon={Hash} label={a.label} type={a.type} answered={a.answered} total={a.total}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Total" value={a.sum} />
                <Stat label="Average" value={a.average} />
                <Stat label="Lowest" value={a.min} />
                <Stat label="Highest" value={a.max} />
              </div>
            </Card>
          );
        }

        if (a.kind === "date") {
          return (
            <Card key={a.key} icon={CalendarRange} label={a.label} type={a.type} answered={a.answered} total={a.total}>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Earliest" value={a.earliest} />
                <Stat label="Latest" value={a.latest} />
              </div>
            </Card>
          );
        }

        return (
          <Card key={a.key} icon={Type} label={a.label} type={a.type} answered={a.answered} total={a.total}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Responses" value={a.answered} />
              <Stat label="Distinct values" value={a.distinct} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Free-text answers aren&apos;t summarised — export to Excel to read them in full.
            </p>
          </Card>
        );
      })}
    </div>
  );
}
