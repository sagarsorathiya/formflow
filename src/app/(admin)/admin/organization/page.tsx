"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Users, Briefcase, Plus, Pencil, Check, X,
  Link2, LinkIcon, ToggleLeft, ToggleRight, Loader2, Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanyLink {
  company: { id: string; code: string; name: string };
  active: boolean;
}

interface CompanyRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  _count: { users: number };
}

interface DeptRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  companies: CompanyLink[];
  _count: { users: number; forms: number };
}

interface DesigRow {
  id: string;
  name: string;
  active: boolean;
  isCompanyHead: boolean;
  isDepartmentHead: boolean;
  companies: CompanyLink[];
}

type Tab = "companies" | "departments" | "designations";

// ─── Inline edit input ────────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  onCancel,
  label,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  onCancel: () => void;
  label: string;
}) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="px-2 py-1 text-sm rounded-lg border border-orange-300 dark:border-orange-500/60 bg-white dark:bg-secondary text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
        placeholder={label}
        onKeyDown={(e) => { if (e.key === "Enter") { setSaving(true); onSave(val).finally(() => setSaving(false)); } if (e.key === "Escape") onCancel(); }}
      />
      <button onClick={() => { setSaving(true); onSave(val).finally(() => setSaving(false)); }} disabled={saving} className="text-emerald-600 dark:text-emerald-400 hover:opacity-80">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ─── Company pill ─────────────────────────────────────────────────────────────

function CompanyPill({
  link,
  onToggle,
}: {
  link: CompanyLink;
  onToggle: (companyId: string, active: boolean) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => { setLoading(true); await onToggle(link.company.id, !link.active).finally(() => setLoading(false)); }}
      title={link.active ? `Click to unlink from ${link.company.name}` : `Click to link to ${link.company.name}`}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
        link.active
          ? "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/25"
          : "bg-slate-50 dark:bg-muted/60 border-slate-200 dark:border-border text-slate-400 dark:text-slate-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-300 dark:hover:border-orange-500/40"
      }`}
    >
      {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : link.active ? <Link2 className="w-2.5 h-2.5" /> : <LinkIcon className="w-2.5 h-2.5" />}
      {link.company.code}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  const [tab, setTab] = useState<Tab>("companies");

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [designations, setDesignations] = useState<DesigRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "companies") {
        const r = await fetch("/api/admin/org/companies");
        const d = await r.json();
        if (d.ok) setCompanies(d.data);
      } else if (tab === "departments") {
        const r = await fetch("/api/admin/org/departments");
        const d = await r.json();
        if (d.ok) setDepartments(d.data);
      } else {
        const r = await fetch("/api/admin/org/designations");
        const d = await r.json();
        if (d.ok) setDesignations(d.data);
      }
    } catch { setError("Failed to load data."); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchData(); setAddingNew(false); setEditingId(null); setNewCode(""); setNewName(""); }, [fetchData]);

  // ── Company actions ────────────────────────────────────────────────────────

  async function createCompany() {
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/admin/org/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error?.message ?? "Failed."); return; }
      setAddingNew(false); setNewCode(""); setNewName("");
      await fetchData();
    } finally { setSaving(false); }
  }

  async function updateCompany(id: string, data: Partial<CompanyRow>) {
    const r = await fetch(`/api/admin/org/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (r.ok) { setEditingId(null); await fetchData(); }
  }

  async function toggleCompanyActive(id: string, active: boolean) {
    await fetch(`/api/admin/org/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await fetchData();
  }

  // ── Department actions ─────────────────────────────────────────────────────

  async function createDept() {
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/admin/org/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error?.message ?? "Failed."); return; }
      setAddingNew(false); setNewCode(""); setNewName("");
      await fetchData();
    } finally { setSaving(false); }
  }

  async function updateDept(id: string, data: { name?: string; code?: string; active?: boolean }) {
    await fetch(`/api/admin/org/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingId(null);
    await fetchData();
  }

  async function toggleDeptCompanyLink(deptId: string, companyId: string, active: boolean) {
    await fetch(`/api/admin/org/departments/${deptId}/links`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, active }),
    });
    await fetchData();
  }

  // ── Designation actions ────────────────────────────────────────────────────

  async function createDesig() {
    if (!newName.trim()) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/admin/org/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error?.message ?? "Failed."); return; }
      setAddingNew(false); setNewName("");
      await fetchData();
    } finally { setSaving(false); }
  }

  async function updateDesig(id: string, data: { name?: string; active?: boolean; isCompanyHead?: boolean; isDepartmentHead?: boolean }) {
    await fetch(`/api/admin/org/designations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingId(null);
    await fetchData();
  }

  async function toggleDesigCompanyLink(desigId: string, companyId: string, active: boolean) {
    await fetch(`/api/admin/org/designations/${desigId}/links`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, active }),
    });
    await fetchData();
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  function requestDelete(id: string, name: string) {
    setConfirmDelete({ id, name });
    setDeleteError(null);
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const urlMap: Record<Tab, string> = {
      companies:    `/api/admin/org/companies/${confirmDelete.id}`,
      departments:  `/api/admin/org/departments/${confirmDelete.id}`,
      designations: `/api/admin/org/designations/${confirmDelete.id}`,
    };
    try {
      const r = await fetch(urlMap[tab], { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) { setDeleteError(d.error?.message ?? "Delete failed."); return; }
      setConfirmDelete(null);
      await fetchData();
    } finally { setDeleting(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "companies",    label: "Companies",    icon: Building2 },
    { key: "departments",  label: "Departments",  icon: Users },
    { key: "designations", label: "Designations", icon: Briefcase },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Organisation Management</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage companies, departments and designations. Departments and designations are global by default — link or unlink per company as needed.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-black/5 dark:bg-card border border-black/8 dark:border-border w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150 ${
              tab === key
                ? "bg-white dark:bg-muted shadow-sm text-orange-600 dark:text-orange-400 dark:shadow-none"
                : "text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-muted/60"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content card */}
      <div className="bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl overflow-hidden shadow-card dark:shadow-none">

        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/6 dark:border-border">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 capitalize">{tab}</p>
          <button
            onClick={() => { setAddingNew(true); setError(null); setNewCode(""); setNewName(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add {tab === "companies" ? "Company" : tab === "departments" ? "Department" : "Designation"}
          </button>
        </div>

        {/* Add new row */}
        {addingNew && (
          <div className="px-6 py-4 bg-orange-50/50 dark:bg-orange-500/10 border-b border-orange-100 dark:border-orange-500/20 flex items-center gap-3 flex-wrap">
            {tab !== "designations" && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">Code</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. IT"
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-secondary text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400/30 w-24"
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={tab === "companies" ? "Company name" : tab === "departments" ? "Department name" : "Designation title"}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-secondary text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400/30 w-56"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (tab === "companies") createCompany();
                    else if (tab === "departments") createDept();
                    else createDesig();
                  }
                  if (e.key === "Escape") { setAddingNew(false); }
                }}
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <button
                onClick={tab === "companies" ? createCompany : tab === "departments" ? createDept : createDesig}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button onClick={() => setAddingNew(false)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-muted/60 transition-colors">
                Cancel
              </button>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 w-full mt-1">{error}</p>}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : (

          <>
            {/* ── Companies tab ── */}
            {tab === "companies" && (
              <div className="divide-y divide-black/5 dark:divide-white/6">
                {companies.length === 0 && (
                  <p className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No companies yet.</p>
                )}
                {companies.map((co) => (
                  <div key={co.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 dark:hover:bg-muted/30 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "white" }}>
                      {co.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === `name-${co.id}` ? (
                        <InlineEdit value={co.name} label="Company name"
                          onSave={(v) => updateCompany(co.id, { name: v })}
                          onCancel={() => setEditingId(null)} />
                      ) : (
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{co.name}</p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{co.code} · {co._count.users} users</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${co.active ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-muted/60 text-slate-400"}`}>
                      {co.active ? "Active" : "Inactive"}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingId(`name-${co.id}`)} title="Edit name" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleCompanyActive(co.id, !co.active)} title={co.active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        {co.active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => requestDelete(co.id, co.name)} title="Delete company" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Departments tab ── */}
            {tab === "departments" && (
              <div className="divide-y divide-black/5 dark:divide-white/6">
                {departments.length === 0 && (
                  <p className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No departments yet.</p>
                )}
                {departments.map((dept) => (
                  <div key={dept.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50/60 dark:hover:bg-muted/30 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 bg-slate-100 dark:bg-muted/60 text-slate-500 dark:text-slate-400 mt-0.5">
                      {dept.code.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === `name-${dept.id}` ? (
                        <InlineEdit value={dept.name} label="Department name"
                          onSave={(v) => updateDept(dept.id, { name: v })}
                          onCancel={() => setEditingId(null)} />
                      ) : (
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{dept.name}</p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{dept.code} · {dept._count.users} users · {dept._count.forms} forms</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {dept.companies.map((link) => (
                          <CompanyPill
                            key={link.company.id}
                            link={link}
                            onToggle={(cid, active) => toggleDeptCompanyLink(dept.id, cid, active)}
                          />
                        ))}
                        {dept.companies.length === 0 && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 italic">No company links</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1">
                      <button onClick={() => setEditingId(`name-${dept.id}`)} title="Edit name" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => updateDept(dept.id, { active: !dept.active })} title={dept.active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        {dept.active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => requestDelete(dept.id, dept.name)} title="Delete department" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Designations tab ── */}
            {tab === "designations" && (
              <div className="divide-y divide-black/5 dark:divide-white/6">
                {designations.length === 0 && (
                  <p className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No designations yet.</p>
                )}
                {designations.map((desig) => (
                  <div key={desig.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50/60 dark:hover:bg-muted/30 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 dark:bg-muted/60 mt-0.5">
                      <Briefcase className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === `name-${desig.id}` ? (
                        <InlineEdit value={desig.name} label="Designation name"
                          onSave={(v) => updateDesig(desig.id, { name: v })}
                          onCancel={() => setEditingId(null)} />
                      ) : (
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{desig.name}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <button
                          onClick={() => updateDesig(desig.id, { isCompanyHead: !desig.isCompanyHead })}
                          title={desig.isCompanyHead ? "Click to unmark as Company Head" : "Mark as Company Head — skips department selection at onboarding and grants company-wide form visibility"}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            desig.isCompanyHead
                              ? "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-400"
                              : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-muted/40 dark:border-border dark:text-slate-500"
                          }`}
                        >
                          Company Head
                        </button>
                        <button
                          onClick={() => updateDesig(desig.id, { isDepartmentHead: !desig.isDepartmentHead })}
                          title={desig.isDepartmentHead ? "Click to unmark as Department Head" : "Mark as Department Head (label only — not yet wired into workflow assignment)"}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            desig.isDepartmentHead
                              ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-400"
                              : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-muted/40 dark:border-border dark:text-slate-500"
                          }`}
                        >
                          Department Head
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {desig.companies.map((link) => (
                          <CompanyPill
                            key={link.company.id}
                            link={link}
                            onToggle={(cid, active) => toggleDesigCompanyLink(desig.id, cid, active)}
                          />
                        ))}
                        {desig.companies.length === 0 && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 italic">No company links</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1">
                      <button onClick={() => setEditingId(`name-${desig.id}`)} title="Edit name" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => updateDesig(desig.id, { active: !desig.active })} title={desig.active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        {desig.active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => requestDelete(desig.id, desig.name)} title="Delete designation" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Legend */}
        {(tab === "departments" || tab === "designations") && !loading && (
          <div className="px-6 py-3 border-t border-black/6 dark:border-border bg-slate-50/60 dark:bg-muted/30 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-1"><Link2 className="w-3 h-3 text-emerald-500" /> Green pill = linked to company (click to unlink)</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Grey pill = unlinked (click to link)</span>
          </div>
        )}
      </div>

      {/* ── Delete confirm overlay ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!deleting) { setConfirmDelete(null); setDeleteError(null); } }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-card border border-black/8 dark:border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Delete {tab === "companies" ? "Company" : tab === "departments" ? "Department" : "Designation"}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-700 dark:text-slate-300">{confirmDelete.name}</span>? This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setConfirmDelete(null); setDeleteError(null); }}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-muted/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAction}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
