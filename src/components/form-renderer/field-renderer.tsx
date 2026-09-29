"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { FieldDefinition, FieldType } from "@/lib/types/schema";
import { cn } from "@/lib/utils";
import { AttachmentItem } from "@/components/ui/document-viewer";

export interface UploadedFileMeta {
  id: string;
  originalName: string;
  mime: string;
  size: number;
}

// Normalize legacy seed field type names to canonical schema types.
// The seed (and any pre-Phase-12 data in the DB) may use old names.
const LEGACY_TYPE_MAP: Record<string, FieldType> = {
  file:                      "file-upload",
  signature:                 "signature-pad",
  checkbox_group:            "checkbox-group",
  auto_submitter_name:       "auto-name",
  auto_submitter_company:    "auto-company",
  auto_submitter_department: "auto-dept",
  auto_submitter_designation:"auto-designation",
  auto_submitter_date:       "auto-date",
};

function normalizeType(type: string): FieldType {
  return (LEGACY_TYPE_MAP[type] ?? type) as FieldType;
}

interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  editable: boolean;
  mode?: "fill" | "review" | "readonly";
  onChange?: (key: string, value: unknown) => void;
  error?: string;
  userContext?: { name?: string; company?: string; department?: string; designation?: string };
  /** Metadata for already-uploaded SubmissionFile IDs, keyed by id — used to show real filenames + download links. */
  fileMeta?: Record<string, UploadedFileMeta>;
  /** Uploads newly-selected files for a file-upload field; resolves once the field's value (array of file IDs) has been updated. */
  onFileUpload?: (field: FieldDefinition, files: File[]) => Promise<void>;
}

export function FieldRenderer({ field: rawField, value, editable, mode, onChange, error, fileMeta, onFileUpload }: FieldRendererProps) {
  const field: FieldDefinition = { ...rawField, type: normalizeType(rawField.type) };
  const inputId = `field-${field.key}`;

  function handleChange(newValue: unknown) {
    onChange?.(field.key, newValue);
  }

  // â"€â"€â"€ Layout / Display fields â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "section-header") {
    return (
      <div className="pt-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{field.label}</h3>
        {field.helpText && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{field.helpText}</p>}
        <div className="mt-2 border-b border-slate-200 dark:border-border" />
      </div>
    );
  }

  if (field.type === "divider") {
    return <div className="border-t border-slate-200 my-1" />;
  }

  if (field.type === "rich-text") {
    return (
      <div
        className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-secondary rounded-lg p-3 border border-slate-200 dark:border-border"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(value || field.defaultValue || "")) }}
      />
    );
  }

  // â"€â"€â"€ Clean read-only display (request detail / view pages) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Shows label + value as a clean key-value pair instead of disabled form inputs.
  if (mode === "readonly") {
    let display: React.ReactNode;

    if (field.type === "yes-no") {
      const checked = Boolean(value);
      display = (
        <span className={cn("text-sm font-medium", checked ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}>
          {checked ? "Yes" : "No"}
        </span>
      );
    } else if (field.type === "file-upload") {
      const files = Array.isArray(value) ? value : [];
      display = files.length === 0
        ? <span className="text-sm text-slate-400 dark:text-slate-500">No files attached</span>
        : (
          <div className="space-y-0.5">
            {files.map((f, i) => {
              const meta = typeof f === "string" ? fileMeta?.[f] : undefined;
              return meta ? (
                <AttachmentItem key={i} file={meta} />
              ) : (
                <div key={i} className="text-sm text-orange-600 dark:text-orange-400">📎 {String(typeof f === "object" && f && "originalName" in (f as object) ? (f as { originalName: string }).originalName : f)}</div>
              );
            })}
          </div>
        );
    } else if (field.type === "signature-pad") {
      display = value
        ? <img src={String(value)} alt="Signature" className="max-h-16 border border-slate-200 dark:border-border rounded" />
        : <span className="text-sm text-slate-400 dark:text-slate-500">No signature</span>;
    } else if (field.type === "table-grid") {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const cols = field.columns ?? [];
      if (rows.length === 0) {
        display = <span className="text-sm text-slate-400 dark:text-slate-500">—</span>;
      } else {
        display = (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 dark:border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50 dark:bg-card">
                  {cols.map((col) => (
                    <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-border">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100 dark:border-border last:border-0">
                    {cols.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{String(row[col.key] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    } else {
      const raw = Array.isArray(value) ? value.join(", ") : value !== null && value !== undefined && value !== "" ? String(value) : null;
      display = <span className={cn("text-sm", raw ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500")}>{raw ?? "—"}</span>;
    }

    return (
      <div className="space-y-1">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="pb-2 border-b border-slate-100 dark:border-border">
          {display}
        </div>
        {field.helpText && <p className="text-xs text-slate-400">{field.helpText}</p>}
      </div>
    );
  }

  // â"€â"€â"€ Auto fields â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (
    field.type === "auto-name" ||
    field.type === "auto-company" ||
    field.type === "auto-dept" ||
    field.type === "auto-designation" ||
    field.type === "auto-date"
  ) {
    if (editable) {
      return (
        <FieldWrapper field={field} id={inputId} error={error}>
          <input
            id={inputId}
            type="text"
            value={String(value ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              "flex h-9 w-full rounded-lg border px-3 py-2 text-sm transition-colors",
              "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "dark:border-border dark:bg-secondary dark:text-slate-200",
              error && "border-red-400 focus:ring-red-400/30"
            )}
          />
        </FieldWrapper>
      );
    }
    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <div className="flex h-9 w-full rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-card px-3 items-center text-sm text-slate-600 dark:text-slate-300">
          {String(value || "—")}
        </div>
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Yes/No â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "yes-no") {
    const checked = Boolean(value);
    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            id={inputId}
            disabled={!editable}
            onClick={() => editable && handleChange(!checked)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
              "transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              checked ? "bg-primary" : "bg-slate-200 dark:bg-white/15",
              !editable && "cursor-not-allowed opacity-60"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm",
                "transform transition duration-200 ease-in-out",
                checked ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
          <span className="text-sm text-slate-700 dark:text-slate-200">{checked ? "Yes" : "No"}</span>
        </div>
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Radio group â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "radio") {
    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <div className="space-y-2" role="radiogroup" aria-labelledby={`${inputId}-label`}>
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.key}
                value={opt}
                checked={value === opt}
                onChange={() => editable && handleChange(opt)}
                disabled={!editable}
                className="accent-primary"
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">{opt}</span>
            </label>
          ))}
        </div>
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Checkbox group â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "checkbox-group" || field.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    const maxSel = field.validation?.maxSelections;
    const minSel = field.validation?.minSelections;
    // At the cap, unchecked options are disabled — deselect first. Enforced again
    // server-side in schema-validator.ts; this is only the affordance.
    const atLimit = typeof maxSel === "number" && maxSel > 0 && selected.length >= maxSel;

    const toggle = (opt: string) => {
      if (!editable) return;
      const isSelected = selected.includes(opt);
      if (!isSelected && atLimit) return;
      const next = isSelected
        ? selected.filter((v) => v !== opt)
        : [...selected, opt];
      handleChange(next);
    };

    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => {
            const isSelected = selected.includes(opt);
            const blocked = !isSelected && atLimit;
            return (
              <label
                key={opt}
                className={cn(
                  "flex items-center gap-2",
                  blocked || !editable ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                )}
              >
                <input
                  type="checkbox"
                  value={opt}
                  checked={isSelected}
                  onChange={() => toggle(opt)}
                  disabled={!editable || blocked}
                  className="accent-primary rounded"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">{opt}</span>
              </label>
            );
          })}
        </div>
        {editable && (typeof maxSel === "number" || typeof minSel === "number") && (
          <p
            className={cn(
              "mt-2 text-xs",
              atLimit ? "font-medium text-orange-600 dark:text-orange-400" : "text-slate-400 dark:text-slate-500"
            )}
            aria-live="polite"
          >
            {typeof maxSel === "number" && maxSel > 0
              ? atLimit
                ? `Maximum ${maxSel} selected — deselect one to change your answer`
                : `${selected.length} of ${maxSel} selected`
              : `Select at least ${minSel}`}
          </p>
        )}
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Dropdown â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "dropdown") {
    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <select
          id={inputId}
          value={String(value ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!editable}
          className={cn(
            "flex h-9 w-full rounded-lg border bg-white dark:bg-muted/60 px-3 py-1 text-sm text-slate-800 dark:text-slate-200 transition",
            "focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-transparent",
            error ? "border-red-400" : "border-slate-300 dark:border-border",
            !editable && "bg-slate-50 dark:bg-muted/40 cursor-not-allowed opacity-60"
          )}
        >
          <option value="">
            {field.placeholder ?? `Select ${field.label}...`}
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Textarea â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "textarea") {
    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <textarea
          id={inputId}
          value={String(value ?? "")}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!editable}
          placeholder={field.placeholder ?? ""}
          rows={4}
          className={cn(
            "flex w-full rounded-lg border bg-white dark:bg-muted/60 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 resize-y",
            "placeholder:text-slate-400 dark:placeholder:text-slate-500 transition",
            "focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-transparent",
            error ? "border-red-400" : "border-slate-300 dark:border-border",
            !editable && "bg-slate-50 dark:bg-muted/40 cursor-not-allowed opacity-60"
          )}
        />
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ File upload â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "file-upload") {
    return (
      <FileUploadField
        field={field}
        value={value}
        editable={editable}
        error={error}
        fileMeta={fileMeta}
        onFileUpload={onFileUpload}
        onChange={handleChange}
        inputId={inputId}
      />
    );
  }

  // â"€â"€â"€ Signature pad â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "signature-pad") {
    return (
      <SignaturePad
        field={field}
        value={String(value ?? "")}
        editable={editable}
        error={error}
        onChange={handleChange}
      />
    );
  }

  // â"€â"€â"€ Table/grid â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (field.type === "table-grid") {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [{}];
    const cols = field.columns ?? [];

    const updateCell = (rowIdx: number, colKey: string, cellVal: string) => {
      const newRows = rows.map((r, i) =>
        i === rowIdx ? { ...r, [colKey]: cellVal } : r
      );
      handleChange(newRows);
    };

    const addRow = () => {
      handleChange([...rows, {}]);
    };

    const removeRow = (rowIdx: number) => {
      handleChange(rows.filter((_, i) => i !== rowIdx));
    };

    return (
      <FieldWrapper field={field} id={inputId} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200 dark:border-border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-slate-50 dark:bg-card border-b border-slate-200 dark:border-border">
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide"
                  >
                    {col.label}
                    {col.required && <span className="text-red-500 ml-0.5">*</span>}
                  </th>
                ))}
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-slate-100 dark:border-border last:border-0">
                  {cols.map((col) => (
                    <td key={col.key} className="px-3 py-1.5">
                      {editable ? (
                        <input
                          type={col.type === "number" ? "number" : "text"}
                          value={String(row[col.key] ?? "")}
                          onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                          className="w-full border border-slate-200 dark:border-border rounded px-2 py-1 text-sm bg-white dark:bg-muted/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
                        />
                      ) : (
                        <span className="text-slate-700 dark:text-slate-200">{String(row[col.key] ?? "—")}</span>
                      )}
                    </td>
                  ))}
                  {editable && (
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        className="text-slate-400 hover:text-red-500 transition text-xs"
                        aria-label="Remove row"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <button
              type="button"
              onClick={addRow}
              className="mt-2 text-sm text-primary hover:underline"
            >
              + Add row
            </button>
          )}
        </div>
      </FieldWrapper>
    );
  }

  // â"€â"€â"€ Generic text inputs (text, number, email, phone, date, time, datetime, user-picker, dept-picker) â"€â"€
  const inputTypeMap: Record<string, string> = {
    text: "text",
    number: "number",
    email: "email",
    phone: "tel",
    date: "date",
    time: "time",
    datetime: "datetime-local",
    "user-picker": "text",
    "dept-picker": "text",
  };

  const htmlType = inputTypeMap[field.type] ?? "text";

  return (
    <FieldWrapper field={field} id={inputId} error={error}>
      <input
        id={inputId}
        type={htmlType}
        value={String(value ?? "")}
        onChange={(e) =>
          handleChange(field.type === "number" ? e.target.valueAsNumber : e.target.value)
        }
        disabled={!editable}
        placeholder={field.placeholder ?? ""}
        className={cn(
          "flex h-9 w-full rounded-lg border bg-white dark:bg-muted/60 px-3 py-1 text-sm text-slate-800 dark:text-slate-200",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500 transition",
          "focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-transparent",
          error ? "border-red-400" : "border-slate-300 dark:border-border",
          !editable && "bg-slate-50 dark:bg-muted/40 cursor-not-allowed opacity-60"
        )}
      />
    </FieldWrapper>
  );
}

// ─── File upload field ──────────────────────────────────────────────────────

function FileUploadField({
  field,
  value,
  editable,
  error,
  fileMeta,
  onFileUpload,
  onChange,
  inputId,
}: {
  field: FieldDefinition;
  value: unknown;
  editable: boolean;
  error?: string;
  fileMeta?: Record<string, UploadedFileMeta>;
  onFileUpload?: (field: FieldDefinition, files: File[]) => Promise<void>;
  onChange: (v: unknown) => void;
  inputId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const files: unknown[] = Array.isArray(value) ? value : [];
  // Normalize field names — seed uses fileTypes/maxFileSizeMB, schema uses allowedExtensions/maxFileSizeMb
  const fieldAny = field as unknown as Record<string, unknown>;
  const acceptTypes = (field.allowedExtensions ?? (fieldAny.fileTypes as string[]) ?? []) as string[];
  const maxMb = field.maxFileSizeMb ?? (fieldAny.maxFileSizeMB as number) ?? null;

  function fileLabel(f: unknown): { name: string; meta?: UploadedFileMeta } {
    if (typeof f === "string") {
      const meta = fileMeta?.[f];
      return meta ? { name: meta.originalName, meta } : { name: f };
    }
    return { name: String(f) };
  }

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    // Copy into a real array before clearing the input — e.target.files is a
    // live FileList tied to the input element, so resetting the input's value
    // empties it too and the upload below would see zero files.
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    setUploadError(null);

    if (!onFileUpload) {
      // No upload handler available (e.g. review step outside a real submission) — fall back to name-only.
      onChange([...files, ...selected.map((f) => f.name)]);
      return;
    }

    setUploading(true);
    try {
      await onFileUpload(field, selected);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removeFile(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <FieldWrapper field={field} id={inputId} error={error}>
      {editable ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition",
            uploading ? "cursor-wait opacity-70" : "cursor-pointer hover:border-primary/50",
            error ? "border-red-400" : "border-slate-300 dark:border-border"
          )}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            id={inputId}
            multiple
            accept={acceptTypes.join(",")}
            className="hidden"
            disabled={uploading}
            onChange={handleSelect}
          />
          <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {uploading ? "Uploading…" : "Click to upload"}
            {!uploading && acceptTypes.length > 0 && (
              <span className="text-slate-400 text-xs ml-1">({acceptTypes.join(", ")})</span>
            )}
          </p>
          {maxMb && !uploading && <p className="text-xs text-slate-400 mt-1">Max {maxMb} MB per file</p>}
          {files.length > 0 && (
            <div className="mt-3 space-y-1 text-left" onClick={(e) => e.stopPropagation()}>
              {files.map((f, i) => {
                const { name, meta } = fileLabel(f);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    {meta ? (
                      <AttachmentItem file={meta} className="flex-1 min-w-0" />
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex items-center gap-1.5">
                        <span className="text-slate-400">📎</span>
                        {name}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-slate-400 hover:text-red-500 transition ml-1"
                      aria-label={`Remove ${name}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {files.length === 0 ? (
            <span className="text-sm text-slate-400">No files attached</span>
          ) : (
            files.map((f, i) => {
              const { name, meta } = fileLabel(f);
              return meta ? (
                <AttachmentItem key={i} file={meta} />
              ) : (
                <div key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <span className="text-slate-400">📎</span>
                  {name}
                </div>
              );
            })
          )}
        </div>
      )}
      {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
    </FieldWrapper>
  );
}

// â"€â"€â"€ Signature pad canvas â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function SignaturePad({
  field,
  value,
  editable,
  error,
  onChange,
}: {
  field: FieldDefinition;
  value: string;
  editable: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Draw existing signature on mount / value change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = value;
  }, [value]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }, []);

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!editable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || !editable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <FieldWrapper field={field} id={`field-${field.key}`} error={error}>
      <div className="space-y-1.5">
        <div
          className={cn(
            "border rounded-lg overflow-hidden relative",
            error ? "border-red-400" : "border-slate-300 dark:border-border",
            editable ? "bg-white dark:bg-secondary" : "bg-slate-50 dark:bg-muted/30"
          )}
        >
          <canvas
            ref={canvasRef}
            width={600}
            height={150}
            className={cn("w-full h-36 block touch-none", editable && "cursor-crosshair")}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!value && editable && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300 dark:text-slate-600 select-none">
              Draw your signature here
            </span>
          )}
        </div>
        {editable && value && (
          <button
            type="button"
            onClick={clearCanvas}
            className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition"
          >
            Clear signature
          </button>
        )}
      </div>
    </FieldWrapper>
  );
}

// â"€â"€â"€ Field wrapper (label + help text + error) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function FieldWrapper({
  field,
  id,
  error,
  children,
}: {
  field: FieldDefinition;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  const isLayout =
    field.type === "section-header" || field.type === "divider" || field.type === "rich-text";
  if (isLayout) return <>{children}</>;

  return (
    <div className="space-y-1.5">
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {field.helpText && !error && (
        <p className="text-xs text-slate-400">{field.helpText}</p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
