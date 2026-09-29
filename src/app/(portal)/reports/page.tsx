import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Download, BarChart3, FileSearch, FileText, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldAnalyticsPanel } from "@/components/reports/field-analytics-panel";
import { analyseSubmissions, type FieldAnalytics } from "@/lib/field-analytics";
import type { FormSchema } from "@/lib/types/schema";
import { isSubmitterHidden, ANONYMOUS_LABEL } from "@/lib/form-privacy";

type SubmissionRow = Prisma.SubmissionGetPayload<{
  include: {
    formVersion: { include: { form: { select: { title: true; anonymous: true } } } };
    submittedBy: { select: { displayName: true; email: true; designation: true } };
  };
}>;

export const metadata: Metadata = { title: "Reports — FormFlow" };

const STATUS_ORDER = ["IN_PROGRESS", "APPROVED", "REJECTED", "RETURNED"];

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { formId?: string; status?: string; page?: string; view?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "USER") redirect("/dashboard");

  const { user } = session;
  const page = Math.max(1, parseInt(searchParams.page ?? "1"));
  const pageSize = 30;
  const selectedFormId = searchParams.formId;
  const status = searchParams.status;
  const view = searchParams.view === "answers" ? "answers" : "submissions";

  const formWhere =
    user.role === "SUPER_ADMIN" ? {} : { departmentId: user.departmentId ?? undefined };

  // A form moved back to Draft keeps its submissions, so it must stay reportable.
  // Include anything ever published; never-published drafts have no data.
  const forms = await prisma.form.findMany({
    where: {
      ...formWhere,
      OR: [
        { status: "PUBLISHED" },
        { status: "DRAFT", versions: { some: { publishedAt: { not: null } } } },
      ],
    },
    select: { id: true, title: true, status: true, department: { select: { name: true } } },
    orderBy: { title: "asc" },
  });

  // â"€â"€ Overview stats (always loaded) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const formIds = forms.map((f) => f.id);

  const overviewStats = await prisma.submission.groupBy({
    by: ["status"],
    where: { formVersion: { formId: { in: formIds } }, status: { notIn: ["DRAFT", "CANCELLED"] } },
    _count: true,
  });

  // Per-form counts
  const perFormCounts = await Promise.all(
    forms.map(async (f) => {
      const counts = await prisma.submission.groupBy({
        by: ["status"],
        where: { formVersion: { formId: f.id }, status: { notIn: ["DRAFT", "CANCELLED"] } },
        _count: true,
      });
      const total = counts.reduce((a, c) => a + c._count, 0);
      const pending = counts.find((c) => c.status === "IN_PROGRESS")?._count ?? 0;
      const approved = counts.find((c) => c.status === "APPROVED")?._count ?? 0;
      return { ...f, total, pending, approved };
    })
  );

  const totalSubmissions = overviewStats.reduce((a, c) => a + c._count, 0);
  const totalPending = overviewStats.find((c) => c.status === "IN_PROGRESS")?._count ?? 0;
  const totalApproved = overviewStats.find((c) => c.status === "APPROVED")?._count ?? 0;

  // â"€â"€ Per-form detail (only when a form is selected) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  let submissions: SubmissionRow[] = [];
  let total = 0;
  let totalPages = 0;
  let fieldAnalytics: FieldAnalytics[] = [];
  let analyticsHidden = false;
  let analyticsTotal = 0;
  let stats: { _count: number; status: string }[] = [];
  const selectedForm = selectedFormId ? forms.find((f) => f.id === selectedFormId) : null;

  if (selectedFormId) {
    const subWhere = {
      formVersion: { formId: selectedFormId },
      status: { notIn: ["DRAFT", "CANCELLED"] as never[] },
      ...(status ? { status: status as never } : {}),
    };

    const [rows, count, grouped] = await Promise.all([
      prisma.submission.findMany({
        where: subWhere,
        include: {
          formVersion: { include: { form: { select: { title: true, anonymous: true } } } },
          submittedBy: { select: { displayName: true, email: true, designation: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.submission.count({ where: subWhere }),
      prisma.submission.groupBy({
        by: ["status"],
        where: { formVersion: { formId: selectedFormId }, status: { notIn: ["DRAFT", "CANCELLED"] } },
        _count: true,
      }),
    ]);

    submissions = rows as SubmissionRow[];
    total = count;
    totalPages = Math.ceil(total / pageSize);
    stats = grouped.map((g) => ({ status: g.status, _count: g._count }));

    // ── Answer breakdown ──────────────────────────────────────────────────────
    // Only loaded for the answers tab: it reads every submission's dataJson for
    // the form, which the submissions tab (paginated) has no need for.
    if (view === "answers") {
      const formMeta = await prisma.form.findUnique({
        where: { id: selectedFormId },
        select: { departmentId: true, confidential: true, currentVersionId: true },
      });

      // A confidential form's answers stay hidden from anyone who isn't the
      // owning department's admin — an aggregate is still the values. Counts and
      // status remain visible on the submissions tab, per the Form Rules design.
      analyticsHidden =
        Boolean(formMeta?.confidential) &&
        !(user.role === "DEPT_ADMIN" && user.departmentId === formMeta?.departmentId);

      if (!analyticsHidden) {
        const [version, allRows] = await Promise.all([
          formMeta?.currentVersionId
            ? prisma.formVersion.findUnique({
                where: { id: formMeta.currentVersionId },
                select: { schemaJson: true },
              })
            : null,
          prisma.submission.findMany({
            where: {
              formVersion: { formId: selectedFormId },
              status: { notIn: ["DRAFT", "CANCELLED"] },
            },
            select: { dataJson: true },
          }),
        ]);

        analyticsTotal = allRows.length;
        const schemaJson = (version?.schemaJson ?? null) as FormSchema | null;
        fieldAnalytics = analyseSubmissions(
          schemaJson,
          allRows.map((r) => (r.dataJson ?? {}) as Record<string, unknown>)
        );
      }
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Reports"
        description="Submission analytics and export across all forms."
        action={
          selectedFormId ? (
            <div className="flex items-center gap-2">
              <a
                href={`/api/reports/csv?formId=${selectedFormId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:opacity-90
                           bg-slate-100 border border-black/8 text-slate-700
                           dark:bg-muted/70 dark:border-border dark:text-slate-300"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </a>
              <a
                href={`/api/reports/excel?formId=${selectedFormId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:opacity-90 text-white"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export Excel
              </a>
            </div>
          ) : null
        }
      />

      {/* Summary stat cards — always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Forms", value: forms.length, color: "text-slate-900 dark:text-white" },
          { label: "Total Submissions", value: totalSubmissions, color: "text-slate-900 dark:text-white" },
          { label: "Pending Approval", value: totalPending, color: "text-amber-600 dark:text-amber-400" },
          { label: "Approved", value: totalApproved, color: "text-emerald-600 dark:text-emerald-400" },
        ].map((s) => (
          <div key={s.label}
            className="bg-white border border-black/8 rounded-2xl p-4 shadow-card
                       dark:bg-card dark:border-border dark:shadow-none">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-black/8 rounded-2xl p-4 shadow-card
                      dark:bg-card dark:border-border dark:shadow-none">
        <form method="GET" className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-0">
            <label htmlFor="formId" className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Filter by Form
            </label>
            <select
              id="formId"
              name="formId"
              defaultValue={selectedFormId ?? ""}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40
                         bg-slate-50 border border-black/8 text-slate-700
                         dark:bg-muted/70 dark:border-border dark:text-slate-200 dark:[&>option]:bg-slate-800"
            >
              <option value="">— all forms —</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>{f.title}{f.status === "DRAFT" ? " (Draft)" : ""}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 w-full sm:w-44">
            <label htmlFor="status" className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40
                         bg-slate-50 border border-black/8 text-slate-700
                         dark:bg-muted/70 dark:border-border dark:text-slate-200 dark:[&>option]:bg-slate-800"
            >
              <option value="">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-5 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            View Report
          </button>
          {selectedFormId && (
            <a href="/reports" className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              Clear
            </a>
          )}
        </form>
      </div>

      {selectedFormId ? (
        <>
          {/* Selected form breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <a href="/reports" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              All Forms
            </a>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-white/20" />
            <span className="font-semibold text-slate-900 dark:text-white">
              {selectedForm?.title ?? selectedFormId}
            </span>
            {selectedForm?.department?.name && (
              <span className="text-xs text-slate-400 bg-slate-100 dark:bg-muted/70 px-2 py-0.5 rounded-full">
                {selectedForm.department.name}
              </span>
            )}
          </div>

          {/* Per-form status breakdown */}
          {stats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {stats
                .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
                .map((s) => (
                  <a
                    key={s.status}
                    href={`/reports?formId=${selectedFormId}&status=${s.status}`}
                    className={`bg-white border rounded-2xl p-4 text-center shadow-card transition-all hover:-translate-y-0.5
                                dark:bg-card dark:shadow-none
                                ${status === s.status
                                  ? "border-orange-300 dark:border-orange-500/50"
                                  : "border-black/8 dark:border-border hover:border-black/15 dark:hover:border-white/15"}`}
                  >
                    <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{s._count}</p>
                    <div className="mt-2 flex justify-center">
                      <StatusBadge status={s.status} />
                    </div>
                  </a>
                ))}
            </div>
          )}

          {/* Submissions | Answer breakdown tabs */}
          <div className="flex gap-1.5">
            {([
              { key: "submissions", label: "Submissions" },
              { key: "answers", label: "Answer Breakdown" },
            ] as const).map((t) => (
              <a
                key={t.key}
                href={`/reports?formId=${selectedFormId}${t.key === "answers" ? "&view=answers" : ""}`}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  view === t.key
                    ? "bg-primary text-white"
                    : "bg-white border border-black/8 text-slate-600 hover:border-black/15 dark:bg-card dark:border-border dark:text-slate-300"
                }`}
              >
                {t.label}
              </a>
            ))}
          </div>

          {view === "answers" ? (
            <FieldAnalyticsPanel
              analytics={fieldAnalytics}
              totalSubmissions={analyticsTotal}
              hidden={analyticsHidden}
            />
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="No submissions found"
              description="No submissions match the current filters."
              className="bg-white border border-black/8 rounded-2xl py-16 shadow-card
                         dark:bg-card dark:border-border dark:shadow-none"
            />
          ) : (
            <>
              <div className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                              dark:bg-card dark:border-border dark:shadow-none">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="grid">
                    <thead>
                      <tr className="border-b border-black/6 bg-slate-50/80 dark:border-border dark:bg-card">
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Serial</th>
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Submitter</th>
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Designation</th>
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Submitted</th>
                        <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Completed</th>
                        <th scope="col" className="px-5 py-3.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/6">
                      {submissions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-500 dark:bg-muted/70 dark:text-slate-300 px-2 py-1 rounded-md">
                              {s.serialNo ?? "—"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-800 dark:text-slate-200 text-xs font-medium">
                            {isSubmitterHidden(s.formVersion.form, s.submittedById, session.user.id)
                              ? <span className="italic text-slate-400">{ANONYMOUS_LABEL}</span>
                              : s.submittedBy.displayName}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-xs hidden md:table-cell">
                            {isSubmitterHidden(s.formVersion.form, s.submittedById, session.user.id)
                              ? "—"
                              : s.submittedBy.designation ?? "—"}
                          </td>
                          <td className="px-5 py-3.5"><StatusBadge status={s.status} /></td>
                          <td className="px-5 py-3.5 text-slate-400 text-xs hidden sm:table-cell whitespace-nowrap">
                            {s.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-xs hidden lg:table-cell whitespace-nowrap">
                            {s.completedAt?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) ?? "—"}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <a href={`/requests/${s.id}?from=reports&formId=${selectedFormId}`}
                              className="text-xs font-semibold whitespace-nowrap transition-colors
                                         text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300">
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2 justify-between px-1">
                  <p className="text-xs text-slate-400">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {page > 1 && (
                      <a href={`/reports?formId=${selectedFormId}&page=${page - 1}${status ? `&status=${status}` : ""}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors
                                   bg-slate-100 border border-black/8 text-slate-600 hover:bg-slate-200
                                   dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-muted">
                        Previous
                      </a>
                    )}
                    <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
                    {page < totalPages && (
                      <a href={`/reports?formId=${selectedFormId}&page=${page + 1}${status ? `&status=${status}` : ""}`}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors
                                   bg-slate-100 border border-black/8 text-slate-600 hover:bg-slate-200
                                   dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-muted">
                        Next
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* No form selected — show per-form overview table */
        forms.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No forms with submissions yet"
            description="Publish a form to start seeing submission data here."
            className="bg-white border border-black/8 rounded-2xl py-16 shadow-card
                       dark:bg-card dark:border-border dark:shadow-none"
          />
        ) : (
          <div className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                          dark:bg-card dark:border-border dark:shadow-none">
            <div className="px-5 py-3.5 border-b border-black/6 dark:border-border">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">All Forms</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/6 bg-slate-50/60 dark:border-border dark:bg-muted/30">
                    <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Form</th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Department</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Pending</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Approved</th>
                    <th scope="col" className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/6">
                  {perFormCounts.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-muted/50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0">
                            <FileText className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                          </div>
                          <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{f.title}</span>
                          {f.status === "DRAFT" && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md
                                             bg-slate-100 text-slate-500 dark:bg-muted/70 dark:text-slate-400">
                              Draft
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs hidden sm:table-cell">
                        {f.department?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums text-sm">{f.total}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right hidden md:table-cell">
                        {f.pending > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums text-xs">{f.pending}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-white/20 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right hidden md:table-cell">
                        {f.approved > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums text-xs">{f.approved}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-white/20 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <a
                          href={`/reports?formId=${f.id}`}
                          className="text-xs font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors whitespace-nowrap"
                        >
                          View →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
