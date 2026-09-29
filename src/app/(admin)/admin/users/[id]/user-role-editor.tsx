"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  userId: string;
  currentRole: string;
  currentActive: boolean;
}

/**
 * Role & status only. Department is deliberately NOT edited here — the
 * Organisation Profile editor above owns company/designation/department as one
 * validated unit (company-link checks, Company Head = no department). This form
 * used to send departmentId on every save, which silently reverted whatever the
 * Organisation Profile editor had just written.
 */
export function UserRoleEditor({ userId, currentRole, currentActive }: Props) {
  const [role, setRole] = useState(currentRole);
  const [active, setActive] = useState(currentActive);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, active }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: json.error?.message ?? "Save failed." });
      } else {
        setMsg({ type: "ok", text: "Changes saved successfully." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border p-5 space-y-4
                    bg-white border-slate-200 dark:bg-card dark:border-border">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Edit Role & Status</h2>

      {msg && (
        <p
          className={`text-xs px-3 py-2 rounded border ${
            msg.type === "ok"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Role</Label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
                     border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200"
        >
          <option value="USER">User</option>
          <option value="DEPT_ADMIN">Department Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
      </div>

      {role === "DEPT_ADMIN" && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This admin manages the department set in <span className="font-semibold">Organisation Profile</span> above.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="activeCheck"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="rounded border-slate-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="activeCheck" className="text-sm cursor-pointer">
          Account active (can log in)
        </Label>
      </div>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}
