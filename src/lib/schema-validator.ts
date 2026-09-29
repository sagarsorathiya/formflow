/**
 * Generates a Zod schema from a FormSchema at runtime.
 * Used for server-side validation of submission dataJson.
 */

import { z } from "zod";
import type { FormSchema, FieldDefinition, FieldType } from "./types/schema";

export function buildZodSchema(
  schema: FormSchema
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const page of schema.pages) {
    for (const field of page.fields) {
      shape[field.key] = buildFieldValidator(field);
    }
  }

  return z.object(shape);
}

function buildFieldValidator(field: FieldDefinition): z.ZodTypeAny {
  const base = buildBaseValidator(field.type, field);

  // Fields with conditional visibility may not be present → optional
  if (field.visibleIf) {
    return base.optional().nullable();
  }

  // Auto-fields and layout elements never submitted as required data
  const readOnlyTypes: FieldType[] = [
    "section-header",
    "divider",
    "rich-text",
    "auto-name",
    "auto-company",
    "auto-dept",
    "auto-designation",
    "auto-date",
  ];
  if (readOnlyTypes.includes(field.type)) {
    return base.optional().nullable();
  }

  if (field.required) {
    return base;
  }

  return base.optional().nullable();
}

function buildBaseValidator(type: FieldType, field: FieldDefinition): z.ZodTypeAny {
  switch (type) {
    case "text":
    case "textarea":
    case "phone":
    case "user-picker":
    case "dept-picker":
    case "signature-pad":
    case "auto-name":
    case "auto-company":
    case "auto-dept":
    case "auto-designation":
    case "auto-date":
    case "section-header":
    case "divider":
    case "rich-text": {
      let v: z.ZodString = z.string();
      if (field.required && !field.visibleIf) v = v.min(1, `${field.label} is required`);
      if (field.validation?.minLength) v = v.min(field.validation.minLength);
      if (field.validation?.maxLength) v = v.max(field.validation.maxLength);
      if (field.validation?.pattern) {
        v = v.regex(
          new RegExp(field.validation.pattern),
          field.validation.patternMessage ?? `${field.label} format is invalid`
        );
      }
      return v;
    }

    case "email": {
      let v: z.ZodString = z.string().email("Please enter a valid email address");
      if (field.required && !field.visibleIf) v = v.min(1, `${field.label} is required`);
      return v;
    }

    case "number": {
      let v = z.coerce.number({ invalid_type_error: `${field.label} must be a number` });
      if (field.validation?.min !== undefined) v = v.min(field.validation.min);
      if (field.validation?.max !== undefined) v = v.max(field.validation.max);
      return v;
    }

    case "date":
    case "time":
    case "datetime": {
      const v = z.string();
      if (field.required && !field.visibleIf)
        return v.min(1, `${field.label} is required`);
      return v;
    }

    case "dropdown":
    case "radio": {
      if (field.options && field.options.length > 0) {
        const opts = field.options as [string, ...string[]];
        const v = z.enum(opts);
        return v;
      }
      return z.string();
    }

    case "multi-select":
    case "checkbox-group": {
      let v = z.array(z.string());
      const minSel = field.validation?.minSelections;
      const maxSel = field.validation?.maxSelections;

      // A configured minimum implies the field is answered, so it supersedes the
      // plain required check rather than stacking a second "at least one" error.
      if (minSel && minSel > 0) {
        v = v.min(minSel, `Select at least ${minSel} option${minSel === 1 ? "" : "s"} for ${field.label}`);
      } else if (field.required && !field.visibleIf) {
        v = v.min(1, `Select at least one ${field.label}`);
      }

      if (maxSel && maxSel > 0) {
        v = v.max(maxSel, `Select up to ${maxSel} option${maxSel === 1 ? "" : "s"} for ${field.label}`);
      }
      return v;
    }

    case "yes-no":
      return z.boolean();

    case "file-upload":
      // Stored as array of SubmissionFile IDs; presence validated separately
      return z.array(z.string()).default([]);

    case "table-grid":
      return z.array(z.record(z.unknown())).default([]);

    default:
      return z.unknown();
  }
}

/** Validate submission data against a form schema. Returns {success, errors}. */
export function validateSubmission(
  schema: FormSchema,
  data: Record<string, unknown>
): { success: true } | { success: false; errors: Record<string, string> } {
  const zodSchema = buildZodSchema(schema);
  const result = zodSchema.safeParse(data);

  if (result.success) return { success: true };

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString() ?? "form";
    errors[key] = issue.message;
  }
  return { success: false, errors };
}
