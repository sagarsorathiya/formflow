"use client";

import { useState, useEffect } from "react";
import type { ApprovalNodeConfig, AssigneeStrategy, FormSchema } from "@/lib/types/schema";

interface Props {
  nodeId: string;
  label: string;
  config: ApprovalNodeConfig;
  schema: FormSchema;
  onChange: (label: string, config: ApprovalNodeConfig) => void;
}

const STRATEGIES: {
  value: AssigneeStrategy;
  label: string;
  hint: string;
}[] = [
  {
    value: "submitter-manager",
    label: "Submitter's Direct Manager",
    hint: "Automatically routes to the person's reporting manager from Active Directory.",
  },
  {
    value: "dept-head",
    label: "Department Head",
    hint: "Routes to the head of the submitter's department.",
  },
  {
    value: "specific-users",
    label: "Named Person(s)",
    hint: "Always assigns to specific people by their username.",
  },
  {
    value: "designation",
    label: "By Job Title / Designation",
    hint: "Routes to anyone in the department with a matching job title (e.g. DGM-IT).",
  },
  {
    value: "app-role",
    label: "By App Role",
    hint: "Routes to users with a specific role in FormFlow (e.g. DEPT_ADMIN).",
  },
  {
    value: "ad-group",
    label: "AD Group",
    hint: "Routes to members of an Active Directory group.",
  },
  {
    value: "dynamic-field",
    label: "From Form Field (User Picker)",
    hint: "The approver is whoever the submitter selected in a User Picker field on the form.",
  },
];

const NEEDS_VALUE: AssigneeStrategy[] = [
  "specific-users",
  "designation",
  "app-role",
  "ad-group",
  "dynamic-field",
];

const VALUE_CONFIG: Record<
  string,
  { label: string; placeholder: string; isFieldPicker?: boolean }
> = {
  "specific-users": {
    label: "Usernames",
    placeholder: "e.g. jdoe, asmith (comma-separated)",
  },
  designation: {
    label: "Job Title / Designation",
    placeholder: "e.g. DGM-IT",
  },
  "app-role": {
    label: "App Role",
    placeholder: "e.g. DEPT_ADMIN, SUPER_ADMIN",
  },
  "ad-group": {
    label: "AD Group Name",
    placeholder: "e.g. FormFlow-IT-Admins",
  },
  "dynamic-field": {
    label: "User Picker field on this form",
    placeholder: "Select a field",
    isFieldPicker: true,
  },
};

export function ApprovalConfigPanel({ nodeId: _nodeId, label, config, schema, onChange }: Props) {
  const [localLabel, setLocalLabel] = useState(label);
  const [localConfig, setLocalConfig] = useState<ApprovalNodeConfig>(config);

  useEffect(() => {
    setLocalLabel(label);
    setLocalConfig(config);
  }, [label, config]);

  function update(partial: Partial<ApprovalNodeConfig>) {
    const next = { ...localConfig, ...partial };
    setLocalConfig(next);
    onChange(localLabel, next);
  }

  function updateLabel(val: string) {
    setLocalLabel(val);
    onChange(val, localConfig);
  }

  const strategy = localConfig.assigneeStrategy ?? "submitter-manager";
  const strategyMeta = STRATEGIES.find((s) => s.value === strategy);
  const needsValue = NEEDS_VALUE.includes(strategy);
  const valueConfig = VALUE_CONFIG[strategy];

  // User-picker fields from form schema
  const userPickerFields = schema.pages.flatMap((p) =>
    p.fields.filter((f) => f.type === "user-picker").map((f) => ({ key: f.key, label: f.label }))
  );

  const inputBase =
    "w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200";

  return (
    <div className="space-y-4">
      {/* Step name */}
      <div>
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          Step Name
        </label>
        <input
          className={inputBase}
          value={localLabel}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="e.g. Manager Approval"
        />
        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
          This name appears on the approval trail so everyone knows what stage the request is at.
        </p>
      </div>

      {/* Who approves */}
      <div>
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          Who approves this step?
        </label>
        <select
          className={inputBase}
          value={strategy}
          onChange={(e) =>
            update({ assigneeStrategy: e.target.value as AssigneeStrategy, assigneeValue: undefined })
          }
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {strategyMeta && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
            {strategyMeta.hint}
          </p>
        )}
      </div>

      {/* Strategy-specific value */}
      {needsValue && valueConfig && (
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
            {valueConfig.label}
          </label>
          {valueConfig.isFieldPicker ? (
            userPickerFields.length > 0 ? (
              <select
                className={inputBase}
                value={(localConfig.assigneeValue as string) ?? ""}
                onChange={(e) => update({ assigneeValue: e.target.value })}
              >
                <option value="">— select a field —</option>
                {userPickerFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
                Add a <strong>User Picker</strong> field to your form first, then return here to select it.
              </p>
            )
          ) : (
            <input
              className={inputBase}
              value={
                Array.isArray(localConfig.assigneeValue)
                  ? localConfig.assigneeValue.join(", ")
                  : (localConfig.assigneeValue as string) ?? ""
              }
              onChange={(e) => {
                const raw = e.target.value;
                const val =
                  strategy === "specific-users"
                    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
                    : raw;
                update({ assigneeValue: val });
              }}
              placeholder={valueConfig.placeholder}
            />
          )}
        </div>
      )}

      {/* Options */}
      <div className="pt-1 border-t border-slate-100 dark:border-border space-y-2.5">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Options</p>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-0.5 rounded accent-orange-500"
            checked={localConfig.anyOneApproves !== false}
            onChange={(e) => update({ anyOneApproves: e.target.checked })}
          />
          <div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Any one approval is enough
            </span>
            <p className="text-[11px] text-slate-400 leading-snug">
              If off, all assigned approvers must approve.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-0.5 rounded accent-orange-500"
            checked={localConfig.allowReturn ?? false}
            onChange={(e) => update({ allowReturn: e.target.checked })}
          />
          <div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Allow &quot;Send back&quot; to submitter
            </span>
            <p className="text-[11px] text-slate-400 leading-snug">
              Approver can return the form to the submitter for corrections.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-0.5 rounded accent-orange-500"
            checked={localConfig.allowDelegate ?? false}
            onChange={(e) => update({ allowDelegate: e.target.checked })}
          />
          <div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Allow delegation
            </span>
            <p className="text-[11px] text-slate-400 leading-snug">
              Approver can forward the task to someone else.
            </p>
          </div>
        </label>
      </div>

      {/* SLA */}
      <div className="pt-1 border-t border-slate-100 dark:border-border">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          Deadline (working days)
        </label>
        <input
          type="number"
          min={0}
          className={inputBase}
          value={localConfig.slaDays ?? ""}
          onChange={(e) =>
            update({ slaDays: e.target.value ? Number(e.target.value) : undefined })
          }
          placeholder="Leave blank for no deadline"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Approver will be reminded by email when the deadline approaches.
        </p>
      </div>
    </div>
  );
}
