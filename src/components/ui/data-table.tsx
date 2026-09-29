"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSearch } from "lucide-react";

interface ServerPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface ServerSorting {
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort: (col: string, dir: "asc" | "desc") => void;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pagination?: ServerPagination;
  sorting?: ServerSorting;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  virtualize?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  pagination,
  sorting,
  emptyTitle = "No results",
  emptyDescription = "No records match your current filters.",
  className,
  virtualize = false,
}: DataTableProps<TData>) {
  const [clientSorting, setClientSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: clientSorting },
    onSortingChange: setClientSorting,
    manualPagination: !!pagination,
    manualSorting: !!sorting,
  });

  const rows = table.getRowModel().rows;
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    enabled: virtualize && rows.length > 100,
  });

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  function handleSort(colId: string) {
    if (sorting) {
      const nextDir = sorting.sortBy === colId && sorting.sortDir === "asc" ? "desc" : "asc";
      sorting.onSort(colId, nextDir);
    }
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div ref={parentRef} className={cn(virtualize && rows.length > 100 ? "overflow-auto max-h-[600px]" : "")}>
          <table className="w-full text-sm" role="grid">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort() || !!sorting;
                    const isSorted = sorting
                      ? sorting.sortBy === header.column.id
                      : header.column.getIsSorted();
                    const sortDir = sorting
                      ? sorting.sortBy === header.column.id ? sorting.sortDir : undefined
                      : (header.column.getIsSorted() as "asc" | "desc" | false) || undefined;

                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          "px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap",
                          canSort && "cursor-pointer select-none hover:text-slate-700"
                        )}
                        aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : isSorted ? "other" : "none"}
                        onClick={canSort ? () => {
                          if (sorting) handleSort(header.column.id);
                          else header.column.toggleSorting();
                        } : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            sortDir === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> :
                            sortDir === "desc" ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> :
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    <EmptyState
                      icon={FileSearch}
                      title={emptyTitle}
                      description={emptyDescription}
                    />
                  </td>
                </tr>
              ) : virtualize && rows.length > 100 ? (
                <>
                  <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} aria-hidden="true">
                    <td colSpan={columns.length} />
                  </tr>
                  {virtualizer.getVirtualItems().map((vRow) => {
                    const row = rows[vRow.index];
                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 transition-colors"
                        data-index={vRow.index}
                        ref={virtualizer.measureElement}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-2.5 text-sm text-slate-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr
                    style={{
                      height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    }}
                    aria-hidden="true"
                  >
                    <td colSpan={columns.length} />
                  </tr>
                </>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 text-sm text-slate-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white">
            <EmptyState icon={FileSearch} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              {row.getVisibleCells().map((cell) => {
                const header = cell.column.columnDef.header;
                const headerLabel = typeof header === "string" ? header : cell.column.id;
                return (
                  <div key={cell.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-xs font-medium text-slate-500 capitalize shrink-0">{headerLabel}</span>
                    <span className="text-slate-800 text-right min-w-0 truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 mt-4 px-1">
          <p className="text-xs text-slate-500">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-slate-600 px-2 font-medium">
              {pagination.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ColumnDef };
