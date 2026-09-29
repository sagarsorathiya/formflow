"use client";

import { useState } from "react";
import type { FieldDefinition, FormSchema } from "@/lib/types/schema";
import { hasOptions, hasLengthValidation, hasNumericValidation, hasSelectionLimits, isLayoutField, getSelectableFields } from "@/lib/builder-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { VisibilityConfig } from "./visibility-config";

interface PropertiesPanelProps {
  field: FieldDefinition;
  schema: FormSchema;
  onChange: (updated: FieldDefinition) => void;
}

export function PropertiesPanel({ field, schema, onChange }: PropertiesPanelProps) {
  const [optionInput, setOptionInput] = useState("");

  function set<K extends keyof FieldDefinition>(key: K, value: FieldDefinition[K]) {
    onChange({ ...field, [key]: value });
  }

  function setValidation(k: string, v: unknown) {
    onChange({ ...field, validation: { ...field.validation, [k]: v } });
  }

  const isLayout = isLayoutField(field.type);
  const sourceFields = getSelectableFields(schema).filter((f) => f.key !== field.key);

  return (
    <aside className="w-72 shrink-0 bg-white border-l border-slate-200 overflow-y-auto flex flex-col dark:bg-[#0f1628] dark:border-border">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-border">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Field Properties
        </p>
        <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5 capitalize">
          {field.type.replace(/-/g, " ")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* â"€â"€ Basic Properties â"€â"€ */}
        <Section title="Basic">
          <Field label="Label" required>
            <Input
              value={field.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Field label"
            />
          </Field>

          {!isLayout && (
            <>
              <Field label="Field Key">
                <Input
                  value={field.key}
                  readOnly
                  className="font-mono text-xs bg-slate-50 text-slate-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Auto-generated, used in conditions</p>
              </Field>

              <Field label="Placeholder">
                <Input
                  value={field.placeholder ?? ""}
                  onChange={(e) => set("placeholder", e.target.value || undefined)}
                  placeholder="Hint text..."
                />
              </Field>

              <Field label="Help Text">
                <Input
                  value={field.helpText ?? ""}
                  onChange={(e) => set("helpText", e.target.value || undefined)}
                  placeholder="Additional guidance..."
                />
              </Field>

              <div className="flex items-center gap-2">
                <input
                  id={`req-${field.key}`}
                  type="checkbox"
                  checked={field.required ?? false}
                  onChange={(e) => set("required", e.target.checked)}
                  className="accent-primary"
                />
                <label htmlFor={`req-${field.key}`} className="text-sm text-slate-700">
                  Required field
                </label>
              </div>

              <Field label="Width">
                <Select
                  value={field.width ?? "full"}
                  onChange={(e) => set("width", e.target.value as FieldDefinition["width"])}
                >
                  <option value="full">Full width</option>
                  <option value="half">Half width</option>
                  <option value="third">One third</option>
                </Select>
              </Field>
            </>
          )}

          {field.type === "rich-text" && (
            <Field label="Content (HTML)">
              <Textarea
                value={String(field.defaultValue ?? "")}
                onChange={(e) => set("defaultValue", e.target.value)}
                rows={5}
                className="font-mono text-xs"
                placeholder="<p>Your instructions here...</p>"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Basic HTML allowed. Will be sanitized.
              </p>
            </Field>
          )}

          {field.type === "section-header" && (
            <Field label="Help Text">
              <Input
                value={field.helpText ?? ""}
                onChange={(e) => set("helpText", e.target.value || undefined)}
                placeholder="Optional subtitle..."
              />
            </Field>
          )}
        </Section>

        {/* â"€â"€ Options â"€â"€ */}
        {hasOptions(field.type) && (
          <Section title="Options">
            <div className="space-y-1.5">
              {(field.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const opts = [...(field.options ?? [])];
                      opts[i] = e.target.value;
                      set("options", opts);
                    }}
                    className="h-7 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const opts = (field.options ?? []).filter((_, idx) => idx !== i);
                      set("options", opts);
                    }}
                    className="text-slate-400 hover:text-red-500 text-xs px-1"
                    aria-label="Remove option"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5 mt-2">
              <Input
                value={optionInput}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && optionInput.trim()) {
                    set("options", [...(field.options ?? []), optionInput.trim()]);
                    setOptionInput("");
                  }
                }}
                placeholder="New option..."
                className="h-7 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (optionInput.trim()) {
                    set("options", [...(field.options ?? []), optionInput.trim()]);
                    setOptionInput("");
                  }
                }}
                className="h-7 text-xs px-2"
              >
                Add
              </Button>
            </div>
          </Section>
        )}

        {/* â"€â"€ Selection limits (multi-select / checkbox group) â"€â"€ */}
        {hasSelectionLimits(field.type) && (
          <Section title="Selection limits">
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 mb-2">
              How many options a user may tick. Leave blank for no limit. Enforced while filling
              and again on submit.
            </p>
            <Field label="Minimum selections">
              <Input
                type="number"
                min={0}
                placeholder="No minimum"
                value={field.validation?.minSelections ?? ""}
                onChange={(e) =>
                  setValidation("minSelections", e.target.value ? Number(e.target.value) : undefined)
                }
                className="h-7 text-xs"
              />
            </Field>
            <Field label="Maximum selections">
              <Input
                type="number"
                min={1}
                placeholder="No maximum"
                value={field.validation?.maxSelections ?? ""}
                onChange={(e) =>
                  setValidation("maxSelections", e.target.value ? Number(e.target.value) : undefined)
                }
                className="h-7 text-xs"
              />
            </Field>
          </Section>
        )}

        {/* â"€â"€ Validation â"€â"€ */}
        {(hasLengthValidation(field.type) || hasNumericValidation(field.type)) && (
          <Section title="Validation">
            {hasNumericValidation(field.type) && (
              <>
                <Field label="Min value">
                  <Input
                    type="number"
                    value={field.validation?.min ?? ""}
                    onChange={(e) => setValidation("min", e.target.value ? Number(e.target.value) : undefined)}
                    className="h-7 text-xs"
                  />
                </Field>
                <Field label="Max value">
                  <Input
                    type="number"
                    value={field.validation?.max ?? ""}
                    onChange={(e) => setValidation("max", e.target.value ? Number(e.target.value) : undefined)}
                    className="h-7 text-xs"
                  />
                </Field>
              </>
            )}
            {hasLengthValidation(field.type) && (
              <>
                <Field label="Min length">
                  <Input
                    type="number"
                    value={field.validation?.minLength ?? ""}
                    onChange={(e) => setValidation("minLength", e.target.value ? Number(e.target.value) : undefined)}
                    className="h-7 text-xs"
                  />
                </Field>
                <Field label="Max length">
                  <Input
                    type="number"
                    value={field.validation?.maxLength ?? ""}
                    onChange={(e) => setValidation("maxLength", e.target.value ? Number(e.target.value) : undefined)}
                    className="h-7 text-xs"
                  />
                </Field>
              </>
            )}
            <Field label="Pattern (regex)">
              <Input
                value={field.validation?.pattern ?? ""}
                onChange={(e) => setValidation("pattern", e.target.value || undefined)}
                className="h-7 text-xs font-mono"
                placeholder="e.g. ^[A-Z]+"
              />
            </Field>
            <Field label="Pattern error message">
              <Input
                value={field.validation?.patternMessage ?? ""}
                onChange={(e) => setValidation("patternMessage", e.target.value || undefined)}
                className="h-7 text-xs"
                placeholder="Invalid format"
              />
            </Field>
          </Section>
        )}

        {/* â"€â"€ File Upload Config â"€â"€ */}
        {field.type === "file-upload" && (
          <Section title="File Upload">
            <Field label="Allowed extensions">
              <Input
                value={(field.allowedExtensions ?? []).join(", ")}
                onChange={(e) =>
                  set(
                    "allowedExtensions",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder=".pdf, .jpg, .docx"
                className="h-7 text-xs"
              />
            </Field>
            <Field label="Max file size (MB)">
              <Input
                type="number"
                min={1}
                max={100}
                value={field.maxFileSizeMb ?? 10}
                onChange={(e) => set("maxFileSizeMb", Number(e.target.value))}
                className="h-7 text-xs"
              />
            </Field>
          </Section>
        )}

        {/* â"€â"€ Conditional Visibility â"€â"€ */}
        {!isLayout && (
          <Section title="Conditional Visibility">
            <VisibilityConfig
              condition={field.visibleIf}
              onChange={(cond) => set("visibleIf", cond)}
              sourceFields={sourceFields}
            />
          </Section>
        )}

        {/* â"€â"€ Advanced â"€â"€ */}
        {!isLayout && (
          <Section title="Advanced">
            <Field label="Step-editable at">
              <Input
                value={field.stepEditable ?? ""}
                onChange={(e) => set("stepEditable", e.target.value || null)}
                placeholder="stepKey (e.g. step_2)"
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                If set, only the assigned approver at this step can edit this field.
              </p>
            </Field>
          </Section>
        )}
      </div>
    </aside>
  );
}

// â"€â"€ Internal helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-slate-100 dark:border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition"
      >
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{title}</span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-600 dark:text-slate-400">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
