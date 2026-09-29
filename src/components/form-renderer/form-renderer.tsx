"use client";

import { useCallback } from "react";
import type { FormSchema, FieldDefinition, VisibilityCondition } from "@/lib/types/schema";
import { FieldRenderer, type UploadedFileMeta } from "./field-renderer";

export type RenderMode = "fill" | "review" | "readonly";

interface FormRendererProps {
  schema: FormSchema;
  data: Record<string, unknown>;
  mode: RenderMode;
  /** Current workflow step key — controls stepEditable fields */
  stepKey?: string;
  onChange?: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
  /** User context for auto-fields */
  userContext?: {
    name?: string;
    company?: string;
    department?: string;
    designation?: string;
  };
  /** Metadata for already-uploaded SubmissionFile IDs, keyed by id — used to show real filenames + download links. */
  fileMeta?: Record<string, UploadedFileMeta>;
  /** Uploads newly-selected files for a file-upload field. */
  onFileUpload?: (field: FieldDefinition, files: File[]) => Promise<void>;
}

export function FormRenderer({
  schema,
  data,
  mode,
  stepKey,
  onChange,
  errors = {},
  userContext,
  fileMeta,
  onFileUpload,
}: FormRendererProps) {
  const isFieldVisible = useCallback(
    (field: FieldDefinition): boolean => {
      if (!field.visibleIf) return true;
      return evaluateCondition(field.visibleIf, data);
    },
    [data]
  );

  const isFieldEditable = useCallback(
    (field: FieldDefinition): boolean => {
      if (mode === "readonly") return false;
      if (mode === "review") {
        // In review mode, only fields with stepEditable matching current step are editable
        if (!field.stepEditable) return false;
        return field.stepEditable === stepKey;
      }
      // Fill mode: everything editable
      return true;
    },
    [mode, stepKey]
  );

  return (
    <div className="space-y-6">
      {schema.pages.map((page, pageIndex) => (
        <div key={pageIndex}>
          {schema.pages.length > 1 && (
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{page.title}</h2>
              {page.description && (
                <p className="text-sm text-slate-500 mt-0.5">{page.description}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-12 gap-4">
            {page.fields.map((field) => {
              if (!isFieldVisible(field)) return null;

              const colSpan =
                field.width === "half"
                  ? "col-span-12 sm:col-span-6"
                  : field.width === "third"
                    ? "col-span-12 sm:col-span-4"
                    : "col-span-12";

              return (
                <div key={field.key} className={colSpan}>
                  <FieldRenderer
                    field={field}
                    value={resolveValue(field, data, userContext)}
                    onChange={onChange}
                    editable={isFieldEditable(field)}
                    mode={mode}
                    error={errors[field.key]}
                    userContext={userContext}
                    fileMeta={fileMeta}
                    onFileUpload={onFileUpload}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const AUTO_NAME_TYPES = new Set(["auto-name", "auto_submitter_name"]);
const AUTO_COMPANY_TYPES = new Set(["auto-company", "auto_submitter_company"]);
const AUTO_DEPT_TYPES = new Set(["auto-dept", "auto_submitter_department"]);
const AUTO_DESIG_TYPES = new Set(["auto-designation", "auto_submitter_designation"]);
const AUTO_DATE_TYPES = new Set(["auto-date", "auto_submitter_date"]);

function resolveValue(
  field: FieldDefinition,
  data: Record<string, unknown>,
  userContext?: FormRendererProps["userContext"]
): unknown {
  const t = field.type;
  if (AUTO_NAME_TYPES.has(t)) return data[field.key] ?? userContext?.name ?? "";
  if (AUTO_COMPANY_TYPES.has(t)) return data[field.key] ?? userContext?.company ?? "";
  if (AUTO_DEPT_TYPES.has(t)) return data[field.key] ?? userContext?.department ?? "";
  if (AUTO_DESIG_TYPES.has(t)) return data[field.key] ?? userContext?.designation ?? "";
  if (AUTO_DATE_TYPES.has(t)) {
    return (
      data[field.key] ??
      new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    );
  }
  return data[field.key] ?? field.defaultValue ?? "";
}

function evaluateCondition(condition: VisibilityCondition, data: Record<string, unknown>): boolean {
  const results = condition.rules.map((rule) => {
    const val = data[rule.fieldKey];
    switch (rule.operator) {
      case "==":
        return String(val) === String(rule.value);
      case "!=":
        return String(val) !== String(rule.value);
      case ">":
        return Number(val) > Number(rule.value);
      case "<":
        return Number(val) < Number(rule.value);
      case ">=":
        return Number(val) >= Number(rule.value);
      case "<=":
        return Number(val) <= Number(rule.value);
      case "contains":
        if (Array.isArray(val)) return val.includes(rule.value);
        return String(val).includes(String(rule.value ?? ""));
      case "is_empty":
        return !val || (Array.isArray(val) ? val.length === 0 : String(val).trim() === "");
      case "is_not_empty":
        return !!val && (Array.isArray(val) ? val.length > 0 : String(val).trim() !== "");
      default:
        return true;
    }
  });

  return condition.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}
