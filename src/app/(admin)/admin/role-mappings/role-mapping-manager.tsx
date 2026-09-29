"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";

interface Mapping {
  id: string;
  adGroup: string;
  appRole: string;
  deptAdminOf: string | null;
}

interface Dept {
  id: string;
  name: string;
  code: string;
}

interface Props {
  initialMappings: Mapping[];
  departments: Dept[];
}

const ROLE_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  SUPER_ADMIN: "success",
  DEPT_ADMIN:  "warning",
  USER:        "secondary",
};

const inputCls = `w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition
  border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400
  dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-500`;

const selectCls = `rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition
  border border-slate-200 bg-white text-slate-900
  dark:border-border dark:bg-[#0f1628] dark:text-slate-200`;

export function RoleMappingManager({ initialMappings, departments }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings);
  const [adGroup, setAdGroup] = useState("");
  const [role, setRole] = useState("DEPT_ADMIN");
  const [deptId, setDeptId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addMapping(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!adGroup.trim()) { setError("AD Group name is required."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/role-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adGroup: adGroup.trim(), appRole: role, deptAdminOf: deptId || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? "Failed to add mapping."); return; }
      setMappings((prev) => [...prev, json.data]);
      setAdGroup("");
      setDeptId("");
    } finally {
      setAdding(false);
    }
  }

  async function removeMapping(id: string) {
    setRemoving(id);
    const res = await fetch(`/api/admin/role-mappings/${id}`, { method: "DELETE" });
    if (res.ok) setMappings((prev) => prev.filter((m) => m.id !== id));
    setRemoving(null);
  }

  return (
    <div className="space-y-5">
      {/* Existing mappings table */}
      <div className="rounded-2xl border border-black/8 dark:border-border overflow-hidden bg-white dark:bg-card">
        <div className="px-5 py-4 border-b border-black/6 dark:border-border">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Active Mappings
            {mappings.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">({mappings.length})</span>
            )}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/6 dark:border-border bg-slate-50 dark:bg-muted/30">
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">AD Group</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">App Role</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Dept Admin Of</th>
                <th scope="col" className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/4 dark:divide-white/6">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No role mappings configured yet.
                  </td>
                </tr>
              ) : mappings.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors group">
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {m.adGroup}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={ROLE_VARIANT[m.appRole] ?? "secondary"}>
                      {m.appRole.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                    {m.deptAdminOf
                      ? departments.find((d) => d.id === m.deptAdminOf)?.name ?? m.deptAdminOf
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => removeMapping(m.id)}
                      disabled={removing === m.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300
                                 disabled:opacity-40 transition-colors"
                      aria-label={`Remove ${m.adGroup}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {removing === m.id ? "Removing..." : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add mapping form */}
      <div className="rounded-2xl border border-black/8 dark:border-border bg-white dark:bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Add Mapping</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Map an AD group to a FormFlow role. Applied on login and nightly sync.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3
                          text-red-700 bg-red-50 border border-red-200
                          dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20">
            <svg className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0V9.25a.75.75 0 00-1.5 0v4zm0-7a.75.75 0 001.5 0 .75.75 0 00-1.5 0z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={addMapping} className="space-y-4">
          {/* Row 1: AD Group + App Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">AD Group Name</label>
              <input
                value={adGroup}
                onChange={(e) => setAdGroup(e.target.value)}
                placeholder="e.g. FormFlow-IT-Admins"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">App Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={`${selectCls} w-full`}>
                <option value="USER">User</option>
                <option value="DEPT_ADMIN">Dept Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </div>

          {/* Row 2: Dept Admin Of (conditional) */}
          {role === "DEPT_ADMIN" && (
            <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Dept Admin Of</label>
              <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className={`${selectCls} w-full`}>
                <option value="">— any department —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            </div>
          )}

          {/* Row 3: Submit */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl
                         hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-150"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              {adding ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Mapping
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Existing users are not retroactively updated — changes take effect on their next login or AD sync.
        </p>
      </div>
    </div>
  );
}
