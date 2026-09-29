import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ANONYMOUS_LABEL } from "@/lib/form-privacy";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSearch } from "lucide-react";

export const metadata: Metadata = { title: "Admin — Submissions" };

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; formId?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"));
  const pageSize = 30;
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const formId = searchParams.formId;

  const where = {
    ...(q
      ? {
          OR: [
            { serialNo: { contains: q, mode: "insensitive" as const } },
            // Name search must not match submissions on anonymous forms, or an
            // admin could confirm who submitted one just by typing their name.
            {
              submittedBy: { displayName: { contains: q, mode: "insensitive" as const } },
              formVersion: { form: { anonymous: false } },
            },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
    ...(formId ? { formVersion: { formId } } : {}),
    status: { notIn: ["DRAFT" as never] },
  };

  const [submissions, total, forms] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        formVersion: { include: { form: { select: { title: true, anonymous: true } } } },
        submittedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.submission.count({ where }),
    prisma.form.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  const inputCls = `rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
                    border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400
                    dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-500`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="All Submissions"
        description={`${total.toLocaleString()} total submissions across all forms.`}
      />

      <div className="rounded-2xl border border-black/8 dark:border-border p-4
                      bg-white dark:bg-card">
        <form method="GET" className="flex flex-col sm:flex-row flex-wrap gap-2 items-end">
          <div className="space-y-1 w-full sm:w-auto">
            <label htmlFor="q" className="sr-only">Search</label>
            <input id="q" name="q" defaultValue={q}
              placeholder="Search serial no or submitter..."
              className={`w-full sm:w-56 ${inputCls}`} />
          </div>
          <select name="status" defaultValue={status ?? ""} aria-label="Filter by status"
            className={`w-full sm:w-auto ${inputCls}`}>
            <option value="">All statuses</option>
            {["IN_PROGRESS", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select name="formId" defaultValue={formId ?? ""} aria-label="Filter by form"
            className={`w-full sm:w-auto ${inputCls}`}>
            <option value="">All forms</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>{f.title}</option>
            ))}
          </select>
          <button type="submit"
            className="min-h-[36px] px-4 py-1.5 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
            Search
          </button>
          {(q || status || formId) && (
            <a href="/admin/submissions"
              className="px-3 py-1.5 text-sm rounded-lg transition-colors
                         text-slate-500 border border-slate-200 bg-white hover:bg-slate-50
                         dark:text-slate-400 dark:border-border dark:bg-card dark:hover:bg-muted/70">
              Clear
            </a>
          )}
        </form>
      </div>

      <div className="rounded-2xl border border-black/8 dark:border-border overflow-hidden
                      bg-white dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 border-slate-200 dark:border-border dark:bg-muted/30">
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Serial</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Form</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Submitted By</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell whitespace-nowrap">Date</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/6">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={FileSearch} title="No submissions found"
                      description="Try a different search query or clear the filters." className="py-10" />
                  </td>
                </tr>
              ) : submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{s.serialNo ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-200 text-xs">{s.formVersion.form.title}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs hidden sm:table-cell">
                    {s.formVersion.form.anonymous
                      ? <span className="italic text-slate-400">{ANONYMOUS_LABEL}</span>
                      : s.submittedBy.displayName}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell whitespace-nowrap">
                    {s.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/requests/${s.id}`}
                      className="text-xs font-medium whitespace-nowrap transition-colors
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
        <div className="flex items-center gap-2 justify-between text-sm px-1">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} · {total.toLocaleString()} results
          </p>
          <div className="flex gap-1.5">
            {page > 1 && (
              <a href={`/admin/submissions?page=${page - 1}${q ? `&q=${q}` : ""}${status ? `&status=${status}` : ""}${formId ? `&formId=${formId}` : ""}`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                           border border-slate-200 text-slate-600 hover:bg-slate-50
                           dark:border-border dark:text-slate-300 dark:hover:bg-muted/70"
                aria-label="Previous page">Previous</a>
            )}
            {page < totalPages && (
              <a href={`/admin/submissions?page=${page + 1}${q ? `&q=${q}` : ""}${status ? `&status=${status}` : ""}${formId ? `&formId=${formId}` : ""}`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                           border border-slate-200 text-slate-600 hover:bg-slate-50
                           dark:border-border dark:text-slate-300 dark:hover:bg-muted/70"
                aria-label="Next page">Next</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
