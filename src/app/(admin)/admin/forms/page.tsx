"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw, Archive, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

interface ArchivedForm {
  id: string;
  title: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
  department: { name: string; code: string } | null;
}

export default function ArchivedFormsPage() {
  const [forms, setForms] = useState<ArchivedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/forms/archived");
      const json = await res.json();
      if (json.ok) setForms(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/admin/forms/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Form restored", description: "The form has been moved back to Draft status.", variant: "success" });
        setForms((prev) => prev.filter((f) => f.id !== id));
      } else {
        toast({ title: "Restore failed", description: json.error?.message, variant: "error" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "error" });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Archived Forms"
        description="Forms deleted by department admins. Restore to move them back to Draft for editing."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="w-6 h-6 text-slate-400" />
        </div>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No archived forms"
          description="Deleted forms will appear here so they can be restored."
        />
      ) : (
        <div className="bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/6 dark:border-border bg-slate-50 dark:bg-muted/40">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Form</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Department</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Archived</th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/4 dark:divide-white/6">
              {forms.map((form) => (
                <tr key={form.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-muted/70 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{form.title}</p>
                        {form.slug && (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">/{form.slug}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="text-slate-600 dark:text-slate-300">
                      {form.department?.name ?? "—"}
                    </span>
                    {form.department?.code && (
                      <span className="ml-1.5 text-xs text-slate-400">({form.department.code})</span>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                    {new Date(form.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ConfirmDialog
                      title="Restore this form?"
                      description={`"${form.title}" will be moved back to Draft. Department admins can then edit and republish it.`}
                      onConfirm={() => handleRestore(form.id)}
                      trigger={
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoringId === form.id}
                          className="gap-1.5 text-xs"
                        >
                          {restoringId === form.id ? (
                            <Spinner className="w-3.5 h-3.5" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          Restore
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
