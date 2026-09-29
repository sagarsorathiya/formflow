"use client";

import { useState } from "react";
import { ANONYMOUS_LABEL } from "@/lib/form-privacy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  stepKey: string;
  status: string;
  dueAt: Date | null;
  submission: {
    id: string;
    serialNo: string | null;
    formVersion: { form: { title: string; anonymous: boolean } };
    submittedBy: { displayName: string };
  };
}

interface User {
  id: string;
  displayName: string;
  email: string;
  designation?: string | null;
}

interface Props {
  tasks: Task[];
  users: User[];
}

export function ReassignPanel({ tasks: initialTasks, users }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Record<string, { type: "ok" | "err"; text: string }>>({});

  async function reassign(taskId: string) {
    const userId = selectedUser[taskId];
    if (!userId) return;
    setReassigning(taskId);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUserId: userId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsgs((m) => ({ ...m, [taskId]: { type: "err", text: json.error?.message ?? "Failed." } }));
      } else {
        setMsgs((m) => ({ ...m, [taskId]: { type: "ok", text: "Reassigned." } }));
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } finally {
      setReassigning(null);
    }
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl border p-4 space-y-3
                                     bg-white border-slate-200 dark:bg-card dark:border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {task.submission.formVersion.form.title}
              </p>
              <p className="text-xs text-slate-500">
                {task.submission.serialNo ?? "—"} &bull; submitted by{" "}
                {task.submission.formVersion.form.anonymous
                  ? ANONYMOUS_LABEL
                  : task.submission.submittedBy.displayName}
              </p>
              <p className="text-xs text-slate-500">
                Step: <span className="font-mono">{task.stepKey}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={task.status === "ESCALATED" ? "destructive" : "warning"}>
                {task.status}
              </Badge>
              {task.dueAt && (
                <span className="text-xs text-amber-600">Due: {new Date(task.dueAt).toLocaleDateString("en-IN")}</span>
              )}
            </div>
          </div>

          {msgs[task.id] && (
            <p className={`text-xs px-3 py-1.5 rounded border ${msgs[task.id].type === "ok" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {msgs[task.id].text}
            </p>
          )}

          <div className="flex items-center gap-2">
            <select
              value={selectedUser[task.id] ?? ""}
              onChange={(e) => setSelectedUser((s) => ({ ...s, [task.id]: e.target.value }))}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
                         border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200"
            >
              <option value="">— select new assignee —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}{u.designation ? ` (${u.designation})` : ""} — {u.email}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => reassign(task.id)}
              disabled={!selectedUser[task.id] || reassigning === task.id}
            >
              {reassigning === task.id ? "Reassigning..." : "Reassign"}
            </Button>
          </div>
        </div>
      ))}

      {tasks.length === 0 && (
        <div className="rounded-xl border p-8 text-center
                        bg-white border-slate-200 dark:bg-card dark:border-border">
          <p className="text-slate-400 text-sm">All tasks have been reassigned.</p>
        </div>
      )}
    </div>
  );
}
