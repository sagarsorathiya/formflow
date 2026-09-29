"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewFormPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Owner department drives who can manage the form (canManageForm), which
  // DEPT_ADMINs can see its submissions, and the serial-number prefix.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/orgs/departments");
        const json = await res.json();
        if (json.ok) setDepartments(json.data);
      } catch {
        /* leave the list empty — the field falls back to the creator's own department */
      }
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          departmentId: departmentId || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to create form.");
        return;
      }

      router.push(`/builder/${json.data.id}`);
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1120] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-black/8 p-8 shadow-sm dark:bg-card dark:border-border">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Create New Form</h1>
          <p className="text-sm text-slate-500 mb-6">Start building your department form.</p>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">
                Form Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. IT Asset Request Form"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this form's purpose..."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department">Owner Department</Label>
              <select
                id="department"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="flex h-9 w-full rounded-lg border px-3 py-1 text-sm transition-colors
                           border-slate-300 bg-white text-slate-900
                           dark:border-border dark:bg-secondary dark:text-slate-200
                           focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="">— Use my own department —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Sets who can manage this form and view its submissions, and the serial-number prefix
                (e.g. HR-2026-00042). Can be changed later while the form is a draft.
              </p>
            </div>

            {error && (
              <p className="text-sm rounded-lg px-3 py-2 text-red-700 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/25">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !title.trim()} className="flex-1">
                {isPending ? "Creating..." : "Create & Open Builder"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
