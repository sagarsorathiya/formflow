"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  payloadJson: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: "Approval required",
  SUBMISSION_APPROVED: "Request approved",
  SUBMISSION_REJECTED: "Request rejected",
  SUBMISSION_RETURNED: "Request returned",
  SLA_REMINDER: "Action overdue",
  SLA_ESCALATED: "Escalation",
  SUBMISSION_RESUBMITTED: "Resubmitted",
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) {
        setNotifications(json.data.notifications);
        setUnreadCount(json.data.unreadCount);
      }
    } catch {
      // silently fail — non-critical UI
    }
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function markOneRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function getNotifLink(n: Notification): string {
    const payload = n.payloadJson as { submissionId?: string; taskId?: string };
    if (n.type === "TASK_ASSIGNED" && payload.taskId) return `/approvals/${payload.taskId}`;
    if (payload.submissionId) return `/requests/${payload.submissionId}`;
    return "/dashboard";
  }

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl
                   text-slate-500 hover:text-slate-900 hover:bg-black/6
                   dark:text-slate-400 dark:hover:text-white dark:hover:bg-muted/80
                   transition-colors duration-150"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-orange-500 text-white
                           text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          className="absolute right-0 top-11 w-80 rounded-2xl overflow-hidden z-50
                     bg-white border border-black/10 shadow-2xl shadow-black/15
                     dark:bg-[#0f1628] dark:border-border dark:shadow-black/40"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 dark:border-border">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-black/6 dark:divide-white/6">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={getNotifLink(n)}
                  onClick={() => {
                    if (!n.readAt) markOneRead(n.id);
                    setOpen(false);
                  }}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    !n.readAt
                      ? "bg-orange-50 hover:bg-orange-100/70 dark:bg-orange-500/8 dark:hover:bg-orange-500/12"
                      : "hover:bg-slate-50 dark:hover:bg-muted/60"
                  }`}
                >
                  <div
                    className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                      !n.readAt ? "bg-orange-500" : "bg-transparent"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </p>
                    {(n.payloadJson as { serialNo?: string }).serialNo && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {(n.payloadJson as { serialNo?: string; formTitle?: string }).formTitle ??
                          "Form"}{" "}
                        — {(n.payloadJson as { serialNo?: string }).serialNo}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{formatAge(n.createdAt)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
