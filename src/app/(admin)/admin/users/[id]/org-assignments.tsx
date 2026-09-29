"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Building2 } from "lucide-react";

interface Company { id: string; code: string; name: string }
interface Department { id: string; code: string; name: string }
interface Designation { id: string; name: string }

interface Assignment {
  id: string;
  company: { id: string; code: string; name: string };
  departmentId: string | null;
  designation: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * Additional company/department/designation mappings super admin can attach to a user,
 * beyond their single active org profile (UserOrgEditor). Reference/reporting metadata
 * only — does not affect form visibility, submissions, or workflow assignment.
 */
export function UserOrgAssignments({ userId }: { userId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selCompany, setSelCompany] = useState<Company | null>(null);
  const [selDept, setSelDept] = useState<Department | null>(null);
  const [selDesig, setSelDesig] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/admin/users/${userId}/org-assignments`);
    const d = await r.json();
    if (d.ok) setAssignments(d.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startAdd() {
    setError(null);
    const r = await fetch("/api/orgs");
    const d = await r.json();
    if (d.ok) setCompanies(d.data.companies);
    setAdding(true);
  }

  async function onCompanyChange(co: Company) {
    setSelCompany(co);
    setSelDept(null);
    setSelDesig("");
    const [deptRes, desigRes] = await Promise.all([
      fetch(`/api/orgs/departments?companyId=${co.id}`),
      fetch(`/api/orgs/designations?companyId=${co.id}`),
    ]);
    const deptJson = await deptRes.json();
    const desigJson = await desigRes.json();
    if (deptJson.ok) setDepartments(deptJson.data);
    if (desigJson.ok) setDesignations(desigJson.data);
  }

  async function handleAdd() {
    if (!selCompany) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/org-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selCompany.id,
          departmentId: selDept?.id ?? null,
          designation: selDesig || null,
          note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? "Failed to add."); return; }
      setAdding(false);
      setSelCompany(null); setSelDept(null); setSelDesig(""); setNote("");
      await load();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  async function handleDelete(assignmentId: string) {
    await fetch(`/api/admin/users/${userId}/org-assignments/${assignmentId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="rounded-xl border p-5 space-y-3 bg-white border-slate-200 dark:bg-card dark:border-border">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Additional Org Mappings</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Reference only — does not change this user&apos;s active company/department/designation used elsewhere in the app.
          </p>
        </div>
        {!adding && (
          <button onClick={startAdd} className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity">
            <Plus className="w-3.5 h-3.5" /> Add mapping
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
      ) : assignments.length === 0 && !adding ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No additional mappings.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-muted/40 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{a.company.name}</span>
                {a.departmentId && <span className="text-slate-400">· dept</span>}
                {a.designation && <span className="text-slate-400">· {a.designation}</span>}
                {a.note && <span className="text-xs text-slate-400 italic truncate">({a.note})</span>}
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-3 pt-2 border-t border-black/6 dark:border-border">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Company</label>
            <div className="flex flex-wrap gap-2">
              {companies.map((co) => (
                <button key={co.id} onClick={() => onCompanyChange(co)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    selCompany?.id === co.id ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300"
                  }`}
                >{co.name}</button>
              ))}
            </div>
          </div>
          {selCompany && (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Department (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {departments.map((d) => (
                    <button key={d.id} onClick={() => setSelDept(selDept?.id === d.id ? null : d)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        selDept?.id === d.id ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300"
                      }`}
                    >{d.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Designation (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {designations.map((d) => (
                    <button key={d.id} onClick={() => setSelDesig(selDesig === d.name ? "" : d.name)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        selDesig === d.name ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300"
                      }`}
                    >{d.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Note (optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  className="w-full text-sm rounded-md border border-slate-300 dark:border-border dark:bg-muted/60 px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!selCompany || saving} className="text-xs px-3 py-1.5 rounded-md bg-primary text-white disabled:opacity-50 transition">
              {saving ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs px-3 py-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-muted/60 transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
