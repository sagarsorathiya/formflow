// FormFlow schema types — shared between builder, renderer, validator, and worker

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "time"
  | "datetime"
  | "dropdown"
  | "multi-select"
  | "radio"
  | "checkbox-group"
  | "yes-no"
  | "file-upload"
  | "section-header"
  | "divider"
  | "rich-text"
  | "table-grid"
  | "user-picker"
  | "dept-picker"
  | "signature-pad"
  | "auto-name"
  | "auto-company"
  | "auto-dept"
  | "auto-designation"
  | "auto-date";

export type FieldWidth = "full" | "half" | "third";

export type VisibilityOperator =
  | "=="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains"
  | "is_empty"
  | "is_not_empty";

export interface VisibilityRule {
  fieldKey: string;
  operator: VisibilityOperator;
  value?: string | number | boolean;
}

export interface VisibilityCondition {
  logic: "AND" | "OR";
  rules: VisibilityRule[];
}

export interface FieldValidation {
  min?: number;
  max?: number;
  /**
   * Multi-select / checkbox-group only: how many options may be picked.
   * `maxSelections` is enforced BOTH in the renderer (unchecked boxes disable
   * once the cap is hit) and server-side in schema-validator.ts — a label that
   * says "select up to 2" is not a constraint.
   */
  minSelections?: number;
  maxSelections?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface GridColumn {
  key: string;
  label: string;
  type: "text" | "number" | "dropdown";
  options?: string[];
  required?: boolean;
  width?: number; // percentage
}

export interface FieldDefinition {
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  width?: FieldWidth;
  visibleIf?: VisibilityCondition | null;
  /** Which workflow stepKey makes this field editable (null = always). Admin-only field. */
  stepEditable?: string | null;

  // For dropdown, multi-select, radio, checkbox-group
  options?: string[];

  // Validation constraints
  validation?: FieldValidation;

  // File upload
  allowedExtensions?: string[];
  maxFileSizeMb?: number;

  // Table/grid
  columns?: GridColumn[];
}

export interface FormPage {
  title: string;
  description?: string;
  fields: FieldDefinition[];
}

export interface FormSchema {
  version: 1;
  pages: FormPage[];
}

// ─── Workflow types (stored in workflowJson) ──────────────────────────────────

export type WorkflowNodeType =
  | "start"
  | "approval"
  | "condition"
  | "parallel-split"
  | "parallel-join"
  | "notify"
  | "end-approved"
  | "end-rejected";

export type AssigneeStrategy =
  | "specific-users"
  | "submitter-manager"
  | "dept-head"
  | "designation"
  | "app-role"
  | "ad-group"
  | "dynamic-field"
  | "submitter"
  | "custom-email";

export interface ApprovalNodeConfig {
  assigneeStrategy: AssigneeStrategy;
  assigneeValue?: string | string[]; // user IDs, designation, role, AD group, or field key
  anyOneApproves?: boolean; // false = all must approve
  allowReturn?: boolean;
  allowDelegate?: boolean;
  slaDays?: number;
  escalateAfterReminders?: number;
}

export interface ConditionRule {
  fieldKey: string;
  operator: VisibilityOperator;
  value?: string | number | boolean;
}

export interface ConditionBranch {
  id?: string;
  label: string;
  targetNodeId: string;
  rules: ConditionRule[];
  logic?: "AND" | "OR";
}

export interface ConditionNodeConfig {
  branches: ConditionBranch[];
  elseBranchTarget?: string;
}

export interface NotifyNodeConfig {
  recipientStrategy: AssigneeStrategy;
  recipientValue?: string | string[];
  messageTemplate?: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: ApprovalNodeConfig | ConditionNodeConfig | NotifyNodeConfig | Record<string, never>;
  label?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  version: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Palette metadata (used only by builder) ─────────────────────────────────

export interface PaletteField {
  type: FieldType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  category: PaletteCategory;
}

export type PaletteCategory =
  | "text"
  | "selection"
  | "datetime"
  | "upload"
  | "layout"
  | "advanced";

export const PALETTE_FIELDS: PaletteField[] = [
  // Text
  { type: "text", label: "Text", description: "Single-line text", icon: "Type", category: "text" },
  { type: "textarea", label: "Long Text", description: "Multi-line text area", icon: "AlignLeft", category: "text" },
  { type: "number", label: "Number", description: "Numeric input", icon: "Hash", category: "text" },
  { type: "email", label: "Email", description: "Email address", icon: "Mail", category: "text" },
  { type: "phone", label: "Phone", description: "Phone number", icon: "Phone", category: "text" },
  // Date/Time
  { type: "date", label: "Date", description: "Date picker", icon: "Calendar", category: "datetime" },
  { type: "time", label: "Time", description: "Time picker", icon: "Clock", category: "datetime" },
  { type: "datetime", label: "Date & Time", description: "Date and time", icon: "CalendarClock", category: "datetime" },
  // Selection
  { type: "dropdown", label: "Dropdown", description: "Single select from list", icon: "ChevronDown", category: "selection" },
  { type: "multi-select", label: "Multi-Select", description: "Multiple checkboxes", icon: "CheckSquare", category: "selection" },
  { type: "radio", label: "Radio", description: "Single choice", icon: "Circle", category: "selection" },
  { type: "checkbox-group", label: "Checkbox Group", description: "Multiple choices", icon: "CheckSquare2", category: "selection" },
  { type: "yes-no", label: "Yes / No", description: "Boolean toggle", icon: "ToggleLeft", category: "selection" },
  // Upload
  { type: "file-upload", label: "File Upload", description: "Attach files", icon: "Paperclip", category: "upload" },
  // Layout
  { type: "section-header", label: "Section Header", description: "Group heading", icon: "Heading", category: "layout" },
  { type: "divider", label: "Divider", description: "Horizontal rule", icon: "Minus", category: "layout" },
  { type: "rich-text", label: "Instructions", description: "Static text/HTML", icon: "FileText", category: "layout" },
  // Advanced
  { type: "table-grid", label: "Table / Grid", description: "Repeatable rows", icon: "Table", category: "advanced" },
  { type: "user-picker", label: "User Picker", description: "Select a user from AD", icon: "User", category: "advanced" },
  { type: "dept-picker", label: "Department", description: "Select a department", icon: "Building2", category: "advanced" },
  { type: "signature-pad", label: "Signature", description: "Draw signature", icon: "PenLine", category: "advanced" },
  { type: "auto-name", label: "Auto: Name", description: "Submitter name (read-only)", icon: "UserCircle", category: "advanced" },
  { type: "auto-company", label: "Auto: Company", description: "Submitter company (read-only)", icon: "Building2", category: "advanced" },
  { type: "auto-dept", label: "Auto: Department", description: "Submitter dept (read-only)", icon: "Building", category: "advanced" },
  { type: "auto-designation", label: "Auto: Designation", description: "Submitter title (read-only)", icon: "Briefcase", category: "advanced" },
  { type: "auto-date", label: "Auto: Date", description: "Submission date (read-only)", icon: "CalendarCheck", category: "advanced" },
];

export const CATEGORY_LABELS: Record<PaletteCategory, string> = {
  text: "Text & Input",
  selection: "Selection",
  datetime: "Date & Time",
  upload: "File Upload",
  layout: "Layout",
  advanced: "Advanced",
};

// ─── Default empty schema ──────────────────────────────────────────────────────

export const EMPTY_SCHEMA: FormSchema = {
  version: 1,
  pages: [{ title: "Form Details", fields: [] }],
};

export const EMPTY_WORKFLOW: WorkflowDefinition = {
  version: 1,
  nodes: [
    { id: "start", type: "start", position: { x: 250, y: 50 }, data: {}, label: "Start" },
    { id: "end-approved", type: "end-approved", position: { x: 250, y: 350 }, data: {}, label: "Approved" },
  ],
  edges: [{ id: "e-start-end", source: "start", target: "end-approved" }],
};
