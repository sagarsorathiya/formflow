"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  allowReturn: boolean;
  mobile?: boolean;
}

type ActionType = "APPROVE" | "REJECT" | "RETURN";

const ACTION_CONFIG: Record<ActionType, { label: string; btnClass: string; idleClass: string; requiresComment: boolean }> = {
  APPROVE: {
    label: "Approve",
    btnClass: "bg-green-500 hover:bg-green-600 text-white border-transparent",
    idleClass: "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-muted/60 dark:text-slate-300 dark:border-border dark:hover:bg-muted dark:hover:border-border",
    requiresComment: false,
  },
  REJECT: {
    label: "Reject",
    btnClass: "bg-red-500 hover:bg-red-600 text-white border-transparent",
    idleClass: "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-muted/60 dark:text-slate-300 dark:border-border dark:hover:bg-muted dark:hover:border-border",
    requiresComment: true,
  },
  RETURN: {
    label: "Return to Submitter",
    btnClass: "bg-violet-600 hover:bg-violet-700 text-white border-transparent",
    idleClass: "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-muted/60 dark:text-slate-300 dark:border-border dark:hover:bg-muted dark:hover:border-border",
    requiresComment: false,
  },
};

const textareaCls =
  "w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none " +
  "border border-slate-300 bg-white text-slate-800 placeholder-slate-400 " +
  "dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder-slate-500";

export function TaskActionForm({ taskId, allowReturn, mobile = false }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions: ActionType[] = ["APPROVE", "REJECT", ...(allowReturn ? ["RETURN" as ActionType] : [])];

  async function handleSubmit() {
    if (!selectedAction) return;
    const cfg = ACTION_CONFIG[selectedAction];
    if (cfg.requiresComment && !comment.trim()) {
      setError("A comment is required to reject a request.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selectedAction, comment: comment.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error?.message ?? "Action failed. Please try again.";
        setError(msg);
        toast({ title: "Action failed", description: msg, variant: "error" });
        return;
      }
      toast({ title: `Request ${selectedAction.toLowerCase()}d`, variant: "success" });
      router.push("/approvals?actioned=true");
      router.refresh();
    } catch {
      const msg = "Network error. Please try again.";
      setError(msg);
      toast({ title: "Network error", description: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (mobile) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-semibold mb-2">Your Decision</p>
        <div className="flex gap-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className={cn(
                "flex-1 text-xs border-2 rounded-xl transition-all min-h-[44px] font-semibold",
                selectedAction === action
                  ? ACTION_CONFIG[action].btnClass
                  : ACTION_CONFIG[action].idleClass
              )}
              onClick={() => setSelectedAction(action === selectedAction ? null : action)}
            >
              {ACTION_CONFIG[action].label}
            </button>
          ))}
        </div>
        {selectedAction && (
          <div className="mt-2 flex gap-2">
            <textarea
              className={cn(textareaCls, "flex-1")}
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={ACTION_CONFIG[selectedAction].requiresComment ? "Comment (required)…" : "Comment (optional)…"}
              aria-label="Comment"
              aria-required={ACTION_CONFIG[selectedAction].requiresComment}
            />
            <Button
              size="sm"
              loading={submitting}
              className={cn("shrink-0 min-h-[44px] border-transparent", ACTION_CONFIG[selectedAction].btnClass)}
              onClick={handleSubmit}
            >
              Confirm
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Your Decision</h2>

      <div className="flex flex-wrap gap-2 mb-4">
        {actions.map((action) => (
          <button
            key={action}
            onClick={() => setSelectedAction(action === selectedAction ? null : action)}
            className={cn(
              "min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2",
              selectedAction === action
                ? ACTION_CONFIG[action].btnClass
                : ACTION_CONFIG[action].idleClass
            )}
          >
            {ACTION_CONFIG[action].label}
          </button>
        ))}
      </div>

      {selectedAction && (
        <div className="space-y-3">
          <div>
            <label htmlFor="task-comment" className="text-xs font-semibold text-slate-400 block mb-1.5">
              Comment
              {ACTION_CONFIG[selectedAction].requiresComment && (
                <span className="text-red-400 ml-1" aria-hidden="true">*required</span>
              )}
            </label>
            <textarea
              id="task-comment"
              className={textareaCls}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                selectedAction === "REJECT"
                  ? "Provide a reason for rejection (required)…"
                  : selectedAction === "RETURN"
                    ? "Explain what needs to be corrected…"
                    : "Add a comment (optional)…"
              }
              aria-label="Comment"
              aria-required={ACTION_CONFIG[selectedAction].requiresComment}
              maxLength={2000}
            />
            <p className="text-[10px] text-slate-500 text-right mt-0.5">{comment.length}/2000</p>
          </div>

          {error && (
            <div role="alert" className="text-sm rounded-xl px-3 py-2 border text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/25">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              loading={submitting}
              className={cn("border-transparent", ACTION_CONFIG[selectedAction].btnClass)}
              onClick={handleSubmit}
            >
              Confirm {ACTION_CONFIG[selectedAction].label}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSelectedAction(null); setComment(""); setError(null); }}
              disabled={submitting}
              className="border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-border dark:text-slate-300 dark:hover:bg-muted/60"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!selectedAction && (
        <p className="text-xs text-slate-500">Select an action above to proceed.</p>
      )}
    </div>
  );
}
