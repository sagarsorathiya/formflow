"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Briefcase, Users, Pencil, X, Loader2 } from "lucide-react";

interface Company { id: string; code: string; name: string }
interface Department { id: string; code: string; name: string }
interface Designation { id: string; name: string; isCompanyHead?: boolean }

interface OrgEditorProps {
  userId: string;
  currentCompanyName: string | null;
  currentDepartmentName: string | null;
  currentDesignation: string | null;
}

/** SUPER_ADMIN-only editor for a user's single active company/department/designation. */
export function UserOrgEditor({ userId, currentCompanyName, currentDepartmentName, currentDesignation }: OrgEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  const [selCompany, setSelCompany] = useState<Company | null>(null);
  const [selDesig, setSelDesig] = useState("");
  const [isCompanyHead, setIsCompanyHead] = useState(false);
  const [selDept, setSelDept] = useState<Department | null>(null);

  const [loadingDesigs, setLoadingDesigs] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(currentCompanyName);
  const [departmentName, setDepartmentName] = useState(currentDepartmentName);
  const [designation, setDesignation] = useState(currentDesignation);

  async function startEdit() {
    setError(null);
    const r = await fetch("/api/orgs");
    const d = await r.json();
    if (d.ok) setCompanies(d.data.companies);
    setEditing(true);
  }

  async function onCompanyChange(co: Company) {
    setSelCompany(co);
    setSelDesig("");
    setIsCompanyHead(false);
    setSelDept(null);
    setDesignations([]);
    setDepartments([]);
    setLoadingDesigs(true);
    try {
      const r = await fetch(`/api/orgs/designations?companyId=${co.id}`);
      const d = await r.json();
      if (d.ok) setDesignations(d.data);
    } finally { setLoadingDesigs(false); }
  }

  async function onDesignationChange(d: Designation) {
    setSelDesig(d.name);
    setIsCompanyHead(Boolean(d.isCompanyHead));
    setSelDept(null);
    if (d.isCompanyHead) return;

    setLoadingDepts(true);
    try {
      const r = await fetch(`/api/orgs/departments?companyId=${selCompany!.id}`);
      const dd = await r.json();
      if (dd.ok) setDepartments(dd.data);
    } finally { setLoadingDepts(false); }
  }

  async function handleSave() {
    if (!selCompany || !selDesig) return;
    if (!isCompanyHead && !selDept) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/org`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selCompany.id, departmentId: isCompanyHead ? null : selDept!.id, designation: selDesig }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? "Save failed."); return; }
      setCompanyName(selCompany.name);
      setDepartmentName(isCompanyHead ? null : (selDept?.name ?? null));
      setDesignation(selDesig);
      setEditing(false);
      // Re-render the server component so every other section on this page picks up
      // the new values instead of holding its page-load snapshot.
      router.refresh();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="rounded-xl border p-5 space-y-3 bg-white border-slate-200 dark:bg-card dark:border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Organisation Profile</h2>
          <button onClick={startEdit} className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Company</dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium">{companyName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Designation</dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium">{designation ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> Department</dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium">{departmentName ?? "—"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-5 space-y-4 bg-white border-slate-200 dark:bg-card dark:border-border">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Edit Organisation Profile</h2>
        <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-4 h-4" /></button>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Company</label>
        <div className="flex flex-wrap gap-2">
          {companies.map((co) => (
            <button key={co.id} onClick={() => onCompanyChange(co)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                selCompany?.id === co.id ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-500/50"
              }`}
            >{co.name}</button>
          ))}
        </div>
      </div>

      {selCompany && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Designation</label>
          {loadingDesigs ? (
            <span className="text-sm text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {designations.map((d) => (
                <button key={d.id} onClick={() => onDesignationChange(d)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    selDesig === d.name ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-500/50"
                  }`}
                >{d.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {selDesig && isCompanyHead ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Department:</span> Not applicable (Company Head)
        </p>
      ) : selDesig && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">Department</label>
          {loadingDepts ? (
            <span className="text-sm text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {departments.map((dept) => (
                <button key={dept.id} onClick={() => setSelDept(dept)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    selDept?.id === dept.id ? "bg-orange-500 border-orange-500 text-white" : "border-black/8 dark:border-border text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-500/50"
                  }`}
                >{dept.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!selCompany || !selDesig || (!isCompanyHead && !selDept) || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : "Save Changes"}
        </button>
        <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-muted/60 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
