"use client";

import { useEffect, useState } from "react";

interface Delegation {
  id: string;
  startDate: string;
  endDate: string;
  active: boolean;
  delegate: {
    id: string;
    displayName: string;
    email: string;
    designation?: string | null;
  };
}

interface User {
  id: string;
  displayName: string;
  email: string;
  designation?: string | null;
}

interface DelegationManagerProps {
  currentUserId: string;
}

export function DelegationManager({ currentUserId }: DelegationManagerProps) {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDelegate, setSelectedDelegate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  async function loadDelegations() {
    const res = await fetch("/api/delegations");
    if (res.ok) {
      const json = await res.json();
      setDelegations(json.data ?? []);
    }
  }

  async function loadUsers() {
    const res = await fetch("/api/users?active=true&limit=200");
    if (res.ok) {
      const json = await res.json();
      setUsers((json.data ?? []).filter((u: User) => u.id !== currentUserId));
    }
  }

  useEffect(() => {
    loadDelegations();
    loadUsers();
  }, []);

  async function createDelegation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedDelegate || !startDate || !endDate) {
      setError("All fields are required.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delegateId: selectedDelegate,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + "T23:59:59").toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to create delegation.");
        return;
      }
      setSelectedDelegate("");
      setStartDate("");
      setEndDate("");
      setUserSearch("");
      await loadDelegations();
    } finally {
      setCreating(false);
    }
  }

  async function removeDelegation(id: string) {
    await fetch(`/api/delegations/${id}`, { method: "DELETE" });
    await loadDelegations();
  }

  const today = new Date().toISOString().split("T")[0];
  const filteredUsers = userSearch.trim()
    ? users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const activeDelegations = delegations.filter((d) => {
    const now = new Date();
    return d.active && new Date(d.endDate) >= now;
  });

  const pastDelegations = delegations.filter((d) => {
    const now = new Date();
    return !d.active || new Date(d.endDate) < now;
  });

  const inputCls =
    "w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 " +
    "border border-slate-300 bg-white text-slate-800 placeholder-slate-400 " +
    "dark:border-border dark:bg-muted/70 dark:text-slate-200 dark:placeholder-slate-500";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-slate-400 leading-relaxed">
          While delegated, the chosen user can act on approval tasks assigned to you during your absence.
        </p>
      </div>

      {/* Active delegations */}
      {activeDelegations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active</p>
          {activeDelegations.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm
                     border-emerald-200 bg-emerald-50 dark:border-green-500/30 dark:bg-green-500/10"
            >
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{d.delegate.displayName}</span>
                {d.delegate.designation && (
                  <span className="text-slate-500 dark:text-slate-400"> · {d.delegate.designation}</span>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {new Date(d.startDate).toLocaleDateString("en-IN")} —{" "}
                  {new Date(d.endDate).toLocaleDateString("en-IN")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeDelegation(d.id)}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                           bg-slate-100 border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200
                           dark:bg-muted/70 dark:border-border dark:text-slate-300 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:hover:border-red-500/30"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Past delegations */}
      {pastDelegations.length > 0 && (
        <details className="text-xs text-slate-500 dark:text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none">
            {pastDelegations.length} past delegation(s)
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l border-black/8 dark:border-border">
            {pastDelegations.map((d) => (
              <p key={d.id} className="text-slate-500">
                {d.delegate.displayName} —{" "}
                {new Date(d.startDate).toLocaleDateString("en-IN")} to{" "}
                {new Date(d.endDate).toLocaleDateString("en-IN")}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Create form */}
      <form onSubmit={createDelegation} className="space-y-4 pt-4 border-t border-black/8 dark:border-border">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Set new delegation
        </p>

        {error && (
          <p className="text-xs rounded-xl px-3 py-2
                       text-red-700 bg-red-50 border border-red-200
                       dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/25">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="userSearch" className="text-xs font-semibold text-slate-400">
            Delegate to
          </label>
          <input
            id="userSearch"
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setSelectedDelegate("");
            }}
            placeholder="Search by name or email..."
            className={inputCls}
          />
          {userSearch.trim() && filteredUsers.length > 0 && !selectedDelegate && (
            <div className="mt-1 rounded-xl border shadow-2xl max-h-40 overflow-y-auto divide-y
                            border-slate-200 bg-white divide-slate-100
                            dark:border-border dark:bg-[#0f1628] dark:divide-white/6">
              {filteredUsers.slice(0, 10).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm transition-colors
                             hover:bg-slate-50 dark:hover:bg-muted/70"
                  onClick={() => {
                    setSelectedDelegate(u.id);
                    setUserSearch(u.displayName);
                  }}
                >
                  <span className="font-semibold text-slate-900 dark:text-white">{u.displayName}</span>
                  {u.designation && (
                    <span className="text-slate-400 text-xs"> · {u.designation}</span>
                  )}
                  <span className="block text-xs text-slate-500">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {userSearch.trim() && filteredUsers.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">No users found.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="startDate" className="text-xs font-semibold text-slate-400">From</label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="endDate" className="text-xs font-semibold text-slate-400">Until</label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate || today}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating || !selectedDelegate || !startDate || !endDate}
          className="px-5 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
        >
          {creating ? "Setting up..." : "Set Delegation"}
        </button>
      </form>
    </div>
  );
}
