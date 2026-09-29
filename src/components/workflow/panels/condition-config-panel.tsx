"use client";

import { useState, useEffect } from "react";
import type { ConditionNodeConfig, ConditionBranch, FormSchema, VisibilityOperator } from "@/lib/types/schema";

interface WorkflowNodeRef {
  id: string;
  type: string;
  label: string;
}

interface Props {
  nodeId: string;
  label: string;
  config: ConditionNodeConfig;
  schema: FormSchema;
  nodes: WorkflowNodeRef[];
  onChange: (label: string, config: ConditionNodeConfig) => void;
}

const OPERATORS: { value: string; label: string }[] = [
  { value: "==",           label: "equals" },
  { value: "!=",           label: "does not equal" },
  { value: ">",            label: "is greater than" },
  { value: "<",            label: "is less than" },
  { value: ">=",           label: "is at least" },
  { value: "<=",           label: "is at most" },
  { value: "contains",     label: "contains" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "has a value" },
];

const NO_VALUE_OPS = ["is_empty", "is_not_empty"];

function newBranch(): ConditionBranch {
  return {
    id: Math.random().toString(36).slice(2, 9),
    label: "Branch",
    targetNodeId: "",
    rules: [{ fieldKey: "", operator: "==", value: "" }],
    logic: "AND",
  };
}

export function ConditionConfigPanel({
  nodeId,
  label,
  config,
  schema,
  nodes,
  onChange,
}: Props) {
  const [localLabel, setLocalLabel] = useState(label);
  const [localConfig, setLocalConfig] = useState<ConditionNodeConfig>(config);

  useEffect(() => {
    setLocalLabel(label);
    setLocalConfig(config);
  }, [label, config]);

  // Form fields available for condition rules
  const fieldOptions = schema.pages.flatMap((p) =>
    p.fields
      .filter((f) => !["section-header", "divider", "rich-text"].includes(f.type))
      .map((f) => ({ key: f.key, label: f.label || f.key }))
  );

  // Other nodes in the workflow (excluding this condition node itself)
  const targetableNodes = nodes.filter((n) => n.id !== nodeId);

  function nodeLabel(id: string) {
    const n = nodes.find((x) => x.id === id);
    return n ? n.label || n.id : id;
  }

  function push(updated: ConditionNodeConfig) {
    setLocalConfig(updated);
    onChange(localLabel, updated);
  }

  function updateLabel(val: string) {
    setLocalLabel(val);
    onChange(val, localConfig);
  }

  function addBranch() {
    push({ ...localConfig, branches: [...(localConfig.branches ?? []), newBranch()] });
  }

  function removeBranch(idx: number) {
    const branches = [...(localConfig.branches ?? [])];
    branches.splice(idx, 1);
    push({ ...localConfig, branches });
  }

  function updateBranch(idx: number, partial: Partial<ConditionBranch>) {
    const branches = (localConfig.branches ?? []).map((b, i) =>
      i === idx ? { ...b, ...partial } : b
    );
    push({ ...localConfig, branches });
  }

  function updateRule(
    branchIdx: number,
    ruleIdx: number,
    partial: Partial<ConditionBranch["rules"][number]>
  ) {
    const branches = (localConfig.branches ?? []).map((b, i) => {
      if (i !== branchIdx) return b;
      const rules = b.rules.map((r, j) => (j === ruleIdx ? { ...r, ...partial } : r));
      return { ...b, rules };
    });
    push({ ...localConfig, branches });
  }

  const inputBase =
    "w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200";

  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-500/8 border border-blue-200 dark:border-blue-500/20 px-3 py-2.5">
        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug font-medium mb-1">
          How a Decision Point works
        </p>
        <p className="text-[11px] text-blue-600/80 dark:text-blue-400/70 leading-snug">
          Add one or more <strong>routes</strong> below. Each route checks a condition — if it matches, the form goes to the step you choose. The <strong>Otherwise</strong> path is used when nothing matches.
        </p>
      </div>

      {/* Step name */}
      <div>
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          Step Name
        </label>
        <input
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200"
          value={localLabel}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="e.g. Budget Check"
        />
      </div>

      {/* Branches */}
      <div className="pt-1 border-t border-slate-100 dark:border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Routes (if / else-if)
          </p>
          <button
            onClick={addBranch}
            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            + Add Route
          </button>
        </div>

        {(localConfig.branches ?? []).length === 0 && (
          <div className="text-center py-4 rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-white/2">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5 font-medium">No routes added yet</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 leading-snug px-4">
              Each route says: <em>&ldquo;If [field] equals [value], go to [step]&rdquo;</em>
            </p>
            <button
              onClick={addBranch}
              className="mt-2.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              + Add your first route
            </button>
          </div>
        )}

        <div className="space-y-3">
          {(localConfig.branches ?? []).map((branch, idx) => (
            <div
              key={branch.id ?? idx}
              className="border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 space-y-2.5 bg-blue-50/40 dark:bg-blue-500/5"
            >
              {/* Branch header */}
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 text-xs font-medium border border-slate-200 dark:border-border rounded-lg px-2 py-1 bg-white dark:bg-muted/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  value={branch.label}
                  onChange={(e) => updateBranch(idx, { label: e.target.value })}
                  placeholder="Branch name"
                />
                <button
                  onClick={() => removeBranch(idx)}
                  className="shrink-0 text-slate-400 hover:text-red-500 dark:hover:text-red-400 text-xs px-1 transition"
                  title="Remove branch"
                >
                  ✕
                </button>
              </div>

              {/* Rules */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  When this is true
                </p>
                {(branch.rules ?? []).map((rule, rIdx) => (
                  <div key={rIdx} className="space-y-1">
                    {/* Field picker */}
                    <select
                      className={inputBase}
                      value={rule.fieldKey}
                      onChange={(e) => updateRule(idx, rIdx, { fieldKey: e.target.value })}
                    >
                      <option value="">— select a field —</option>
                      {fieldOptions.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    {/* Operator + value row */}
                    <div className="flex gap-1.5">
                      <select
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        value={rule.operator}
                        onChange={(e) =>
                          updateRule(idx, rIdx, { operator: e.target.value as VisibilityOperator, value: "" })
                        }
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {!NO_VALUE_OPS.includes(rule.operator) && (
                        <input
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                          value={String(rule.value ?? "")}
                          onChange={(e) => updateRule(idx, rIdx, { value: e.target.value })}
                          placeholder="value"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Go to */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  → Then go to this step
                </p>
                <select
                  className={inputBase}
                  value={branch.targetNodeId}
                  onChange={(e) => updateBranch(idx, { targetNodeId: e.target.value })}
                >
                  <option value="">— select next step —</option>
                  {targetableNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label || n.type}
                    </option>
                  ))}
                </select>
                {branch.targetNodeId && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    → {nodeLabel(branch.targetNodeId)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Else / fallback */}
      <div className="pt-1 border-t border-slate-100 dark:border-border">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
          Otherwise (if nothing above matched)
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 leading-snug">
          This is the fallback path when none of the routes above apply.
        </p>
        <select
          className={inputBase}
          value={localConfig.elseBranchTarget ?? ""}
          onChange={(e) =>
            push({ ...localConfig, elseBranchTarget: e.target.value || undefined })
          }
        >
          <option value="">— no fallback (stop here) —</option>
          {targetableNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label || n.type}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
