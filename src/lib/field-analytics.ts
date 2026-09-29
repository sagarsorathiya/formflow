/**
 * Per-field aggregation of a form's submissions — "what did people answer".
 *
 * Pure functions over already-fetched rows: no Prisma, no I/O, so this is
 * directly testable. At FormFlow's scale (hundreds of submissions per form)
 * aggregating in JS is simpler and fast enough; if a single form ever reaches
 * tens of thousands of rows this is the piece to move into Postgres JSONB
 * aggregation, since nothing else depends on how it's computed.
 *
 * Field types are normalised the same way `field-renderer.tsx` does, because
 * seeded and pre-Phase-12 rows still carry legacy type names.
 */

import type { FormSchema, FieldDefinition } from "@/lib/types/schema";

/** Choice fields: one bar per option. */
const CHOICE_TYPES = new Set([
  "dropdown",
  "radio",
  "multi-select",
  "checkbox-group",
  "checkbox_group",
  "yes-no",
  "toggle",
  "dept-picker",
]);

const NUMBER_TYPES = new Set(["number"]);
const DATE_TYPES = new Set(["date", "datetime", "time"]);

/** Types with no meaningful aggregate — free text, files, layout, signatures. */
const NON_AGGREGATABLE = new Set([
  "section-header",
  "section_header",
  "divider",
  "rich-text",
  "rich_text",
  "static-text",
  "signature-pad",
  "signature",
  "file-upload",
  "file",
  "table-grid",
]);

export interface OptionCount {
  label: string;
  count: number;
  percent: number;
}

export type FieldAnalytics =
  | {
      kind: "choice";
      key: string;
      label: string;
      type: string;
      answered: number;
      total: number;
      options: OptionCount[];
    }
  | {
      kind: "number";
      key: string;
      label: string;
      type: string;
      answered: number;
      total: number;
      sum: number;
      average: number;
      min: number;
      max: number;
    }
  | {
      kind: "date";
      key: string;
      label: string;
      type: string;
      answered: number;
      total: number;
      earliest: string;
      latest: string;
    }
  | {
      kind: "text";
      key: string;
      label: string;
      type: string;
      answered: number;
      total: number;
      distinct: number;
    };

const NO_ANSWER = "(no answer)";

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Flattens every page's fields, preserving builder order. */
export function flattenFields(schema: FormSchema | null | undefined): FieldDefinition[] {
  if (!schema?.pages) return [];
  return schema.pages.flatMap((p) => p.fields ?? []);
}

function toDisplay(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/**
 * Aggregates one field across all submissions. `rows` is each submission's
 * dataJson; a field missing from a row counts as unanswered, which is normal
 * for conditionally-visible fields and for rows filed before the field existed.
 */
export function analyseField(
  field: FieldDefinition,
  rows: Record<string, unknown>[]
): FieldAnalytics | null {
  const type = String(field.type);
  if (NON_AGGREGATABLE.has(type)) return null;

  const total = rows.length;
  const values = rows.map((r) => r[field.key]);
  const answered = values.filter((v) => !isBlank(v)).length;
  const base = { key: field.key, label: field.label || field.key, type, answered, total };

  if (CHOICE_TYPES.has(type)) {
    const counts = new Map<string, number>();
    // Seed declared options at zero so "nobody picked this" is visible, which is
    // often the point of the report.
    for (const opt of field.options ?? []) counts.set(toDisplay(opt), 0);

    for (const v of values) {
      if (isBlank(v)) {
        counts.set(NO_ANSWER, (counts.get(NO_ANSWER) ?? 0) + 1);
        continue;
      }
      // multi-select / checkbox-group store arrays — every selection counts.
      const picks = Array.isArray(v) ? v : [v];
      for (const pick of picks) {
        const label = toDisplay(pick);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }

    const options: OptionCount[] = Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        // Percentages are of submissions that answered, not of all rows —
        // otherwise a conditionally-hidden field looks artificially unpopular.
        percent: answered > 0 && label !== NO_ANSWER ? Math.round((count / answered) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        if (a.label === NO_ANSWER) return 1;
        if (b.label === NO_ANSWER) return -1;
        return b.count - a.count;
      });

    return { kind: "choice", ...base, options };
  }

  if (NUMBER_TYPES.has(type)) {
    const nums = values
      .filter((v) => !isBlank(v))
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return { kind: "number", ...base, sum: 0, average: 0, min: 0, max: 0 };
    const sum = nums.reduce((a, n) => a + n, 0);
    return {
      kind: "number",
      ...base,
      answered: nums.length,
      sum,
      average: Math.round((sum / nums.length) * 100) / 100,
      min: Math.min(...nums),
      max: Math.max(...nums),
    };
  }

  if (DATE_TYPES.has(type)) {
    const present = values.filter((v) => !isBlank(v)).map((v) => String(v)).sort();
    if (present.length === 0) return { kind: "date", ...base, earliest: "—", latest: "—" };
    return { kind: "date", ...base, earliest: present[0], latest: present[present.length - 1] };
  }

  // Free text, email, phone, user-picker and anything unrecognised: a count of
  // responses and how many were distinct is all that can honestly be said.
  const distinct = new Set(values.filter((v) => !isBlank(v)).map((v) => toDisplay(v))).size;
  return { kind: "text", ...base, distinct };
}

export function analyseSubmissions(
  schema: FormSchema | null | undefined,
  rows: Record<string, unknown>[]
): FieldAnalytics[] {
  return flattenFields(schema)
    .map((f) => analyseField(f, rows))
    .filter((a): a is FieldAnalytics => a !== null);
}
