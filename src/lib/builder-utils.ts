import type { FieldDefinition, FieldType, FormSchema } from "./types/schema";
import { generateFieldKey } from "./utils";

/** Default properties for a newly created field of a given type */
export function createField(type: FieldType, schema: FormSchema): FieldDefinition {
  const existingKeys = schema.pages.flatMap((p) => p.fields.map((f) => f.key));
  const labelMap: Record<FieldType, string> = {
    text: "Text Field",
    textarea: "Long Text",
    number: "Number",
    email: "Email Address",
    phone: "Phone Number",
    date: "Date",
    time: "Time",
    datetime: "Date & Time",
    dropdown: "Dropdown",
    "multi-select": "Multi Select",
    radio: "Radio Group",
    "checkbox-group": "Checkbox Group",
    "yes-no": "Yes / No",
    "file-upload": "File Upload",
    "section-header": "Section Header",
    divider: "Divider",
    "rich-text": "Instructions",
    "table-grid": "Table",
    "user-picker": "User",
    "dept-picker": "Department",
    "signature-pad": "Signature",
    "auto-name": "Submitter Name",
    "auto-company": "Submitter Company",
    "auto-dept": "Submitter Department",
    "auto-designation": "Submitter Designation",
    "auto-date": "Submission Date",
  };

  const label = labelMap[type] ?? "Field";
  const key = generateFieldKey(label, existingKeys);

  const base: FieldDefinition = {
    key,
    type,
    label,
    width: "full",
    required: false,
    visibleIf: null,
    stepEditable: null,
  };

  // Type-specific defaults
  switch (type) {
    case "dropdown":
    case "radio":
    case "multi-select":
    case "checkbox-group":
      return { ...base, options: ["Option 1", "Option 2", "Option 3"] };

    case "file-upload":
      return { ...base, allowedExtensions: [".pdf", ".doc", ".docx", ".jpg", ".png"], maxFileSizeMb: 10 };

    case "table-grid":
      return {
        ...base,
        columns: [
          { key: "item", label: "Item", type: "text", required: true },
          { key: "quantity", label: "Quantity", type: "number" },
          { key: "remarks", label: "Remarks", type: "text" },
        ],
      };

    case "rich-text":
      return { ...base, defaultValue: "<p>Enter instructions here...</p>" };

    default:
      return base;
  }
}

/** All field keys in a schema (for uniqueness checks) */
export function getAllFieldKeys(schema: FormSchema): string[] {
  return schema.pages.flatMap((p) => p.fields.map((f) => f.key));
}

/** Fields that are potential sources for conditional visibility rules */
export function getSelectableFields(schema: FormSchema): FieldDefinition[] {
  const inputTypes: FieldType[] = [
    "text", "number", "email", "phone", "dropdown", "radio",
    "multi-select", "checkbox-group", "yes-no",
  ];
  return schema.pages
    .flatMap((p) => p.fields)
    .filter((f) => inputTypes.includes(f.type));
}

/** Human-readable label for a field type */
export function fieldTypeLabel(type: FieldType): string {
  const labels: Partial<Record<FieldType, string>> = {
    text: "Text",
    textarea: "Long Text",
    number: "Number",
    email: "Email",
    phone: "Phone",
    date: "Date",
    time: "Time",
    datetime: "Date & Time",
    dropdown: "Dropdown",
    "multi-select": "Multi-Select",
    radio: "Radio",
    "checkbox-group": "Checkbox Group",
    "yes-no": "Yes/No",
    "file-upload": "File Upload",
    "section-header": "Section Header",
    divider: "Divider",
    "rich-text": "Instructions",
    "table-grid": "Table",
    "user-picker": "User Picker",
    "dept-picker": "Department Picker",
    "signature-pad": "Signature Pad",
    "auto-name": "Auto: Name",
    "auto-company": "Auto: Company",
    "auto-dept": "Auto: Department",
    "auto-designation": "Auto: Designation",
    "auto-date": "Auto: Date",
  };
  return labels[type] ?? type;
}

/** Types that are purely layout/display (no user input) */
export function isLayoutField(type: FieldType): boolean {
  return ["section-header", "divider", "rich-text"].includes(type);
}

/** Types that have options arrays */
export function hasOptions(type: FieldType): boolean {
  return ["dropdown", "multi-select", "radio", "checkbox-group"].includes(type);
}

/** Types where "how many options may be picked" is meaningful */
export function hasSelectionLimits(type: FieldType): boolean {
  return ["multi-select", "checkbox-group"].includes(type);
}

/** Types that support numeric min/max validation */
export function hasNumericValidation(type: FieldType): boolean {
  return type === "number";
}

/** Types that support string length validation */
export function hasLengthValidation(type: FieldType): boolean {
  return ["text", "textarea", "email", "phone"].includes(type);
}
