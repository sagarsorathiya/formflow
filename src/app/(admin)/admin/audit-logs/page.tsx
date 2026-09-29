import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

export const metadata: Metadata = { title: "Admin — Audit Log" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { action?: string; entity?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"));
  const pageSize = 50;
  const action = searchParams.action?.trim();
  const entity = searchParams.entity?.trim();

  const where = {
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(entity ? { entityType: { contains: entity, mode: "insensitive" as const } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  const inputCls = `rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
                    border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400
                    dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-500`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description={`Append-only tamper-evident trail. ${total.toLocaleString()} entries.`}
      />

      <div className="rounded-2xl border border-black/8 dark:border-border p-4
                      bg-white dark:bg-card">
        <form method="GET" className="flex flex-col sm:flex-row flex-wrap gap-2 items-end">
          <div className="space-y-1 w-full sm:w-auto">
            <label htmlFor="filter-action" className="text-xs font-medium text-slate-600 dark:text-slate-400 sr-only">Filter by action</label>
            <input id="filter-action" name="action" defaultValue={action}
              placeholder="Filter by action..." className={`w-full sm:w-48 ${inputCls}`} />
          </div>
          <div className="space-y-1 w-full sm:w-auto">
            <label htmlFor="filter-entity" className="text-xs font-medium text-slate-600 dark:text-slate-400 sr-only">Filter by entity type</label>
            <input id="filter-entity" name="entity" defaultValue={entity}
              placeholder="Entity type..." className={`w-full sm:w-40 ${inputCls}`} />
          </div>
          <button type="submit"
            className="min-h-[36px] px-4 py-1.5 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
            Filter
          </button>
          {(action || entity) && (
            <a href="/admin/audit-logs"
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
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50 border-slate-200 dark:border-border dark:bg-muted/30">
                <th scope="col" className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Time</th>
                <th scope="col" className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Actor</th>
                <th scope="col" className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Action</th>
                <th scope="col" className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Entity</th>
                <th scope="col" className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/6">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={Activity} title="No audit entries"
                      description="No log entries match the current filters." className="py-10" />
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {log.createdAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {log.actor?.displayName ?? "System"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono px-1.5 py-0.5 rounded text-[10px]
                                     bg-slate-100 text-slate-700 dark:bg-muted/70 dark:text-slate-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400 hidden sm:table-cell">
                    {log.entityType}{" "}
                    <span className="text-slate-400 dark:text-slate-500 font-mono">{log.entityId.slice(0, 8)}...</span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 font-mono hidden md:table-cell">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-between text-sm px-1">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} · {total.toLocaleString()} entries
          </p>
          <div className="flex gap-1.5">
            {page > 1 && (
              <a href={`/admin/audit-logs?page=${page - 1}${action ? `&action=${action}` : ""}${entity ? `&entity=${entity}` : ""}`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                           border border-slate-200 text-slate-600 hover:bg-slate-50
                           dark:border-border dark:text-slate-300 dark:hover:bg-muted/70"
                aria-label="Previous page">Previous</a>
            )}
            {page < totalPages && (
              <a href={`/admin/audit-logs?page=${page + 1}${action ? `&action=${action}` : ""}${entity ? `&entity=${entity}` : ""}`}
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
