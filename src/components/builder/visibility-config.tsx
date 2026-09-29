"use client";

import type { VisibilityCondition, VisibilityOperator, FieldDefinition } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface VisibilityConfigProps {
  condition: VisibilityCondition | null | undefined;
  onChange: (cond: VisibilityCondition | null) => void;
  /** All fields that can be used as condition sources */
  sourceFields: FieldDefinition[];
}

const OPERATORS: { value: VisibilityOperator; label: string }[] = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

export function VisibilityConfig({ condition, onChange, sourceFields }: VisibilityConfigProps) {
  const enabled = !!condition;

  function enable() {
    onChange({
      logic: "AND",
      rules: [{ fieldKey: sourceFields[0]?.key ?? "", operator: "==", value: "" }],
    });
  }

  function disable() {
    onChange(null);
  }

  function updateLogic(logic: "AND" | "OR") {
    if (!condition) return;
    onChange({ ...condition, logic });
  }

  function updateRule(index: number, partial: Partial<VisibilityCondition["rules"][number]>) {
    if (!condition) return;
    const rules = condition.rules.map((r, i) => (i === index ? { ...r, ...partial } : r));
    onChange({ ...condition, rules });
  }

  function addRule() {
    if (!condition) return;
    onChange({
      ...condition,
      rules: [
        ...condition.rules,
        { fieldKey: sourceFields[0]?.key ?? "", operator: "==" as VisibilityOperator, value: "" },
      ],
    });
  }

  function removeRule(index: number) {
    if (!condition) return;
    const rules = condition.rules.filter((_, i) => i !== index);
    onChange(rules.length === 0 ? null : { ...condition, rules });
  }

  if (sourceFields.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        Add other input fields to the form to use conditional visibility.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={enabled ? disable : enable}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition mt-0.5 ${
              enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-sm text-slate-700">Show this field conditionally</span>
      </div>

      {enabled && condition && (
        <div className="space-y-2 pl-2 border-l-2 border-primary/30">
          {condition.rules.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Match</span>
              <select
                value={condition.logic}
                onChange={(e) => updateLogic(e.target.value as "AND" | "OR")}
                className="border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none"
              >
                <option value="AND">ALL (AND)</option>
                <option value="OR">ANY (OR)</option>
              </select>
              <span>of these rules</span>
            </div>
          )}

          {condition.rules.map((rule, i) => {
            const noValueOps: VisibilityOperator[] = ["is_empty", "is_not_empty"];
            return (
              <div key={i} className="flex items-center gap-1.5 flex-wrap">
                <Select
                  value={rule.fieldKey}
                  onChange={(e) => updateRule(i, { fieldKey: e.target.value })}
                  className="h-7 text-xs flex-1 min-w-[100px]"
                >
                  {sourceFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>

                <Select
                  value={rule.operator}
                  onChange={(e) => updateRule(i, { operator: e.target.value as VisibilityOperator })}
                  className="h-7 text-xs w-32"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </Select>

                {!noValueOps.includes(rule.operator) && (
                  <Input
                    value={String(rule.value ?? "")}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                    placeholder="value"
                    className="h-7 text-xs flex-1 min-w-[80px]"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeRule(i)}
                  className="text-slate-400 hover:text-red-500 text-xs px-1"
                  aria-label="Remove rule"
                >
                  ×
                </button>
              </div>
            );
          })}

          <Button type="button" variant="ghost" size="sm" onClick={addRule} className="text-xs h-7">
            + Add rule
          </Button>
        </div>
      )}
    </div>
  );
}
