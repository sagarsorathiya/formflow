"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { PALETTE_FIELDS, CATEGORY_LABELS, type PaletteCategory, type FieldType } from "@/lib/types/schema";

interface FieldPaletteProps {
  onAdd: (type: FieldType) => void;
}

const CATEGORY_ORDER: PaletteCategory[] = ["text", "selection", "datetime", "upload", "layout", "advanced"];

export function FieldPalette({ onAdd }: FieldPaletteProps) {
  const grouped = CATEGORY_ORDER.reduce<Record<PaletteCategory, typeof PALETTE_FIELDS>>(
    (acc, cat) => {
      acc[cat] = PALETTE_FIELDS.filter((f) => f.category === cat);
      return acc;
    },
    {} as Record<PaletteCategory, typeof PALETTE_FIELDS>
  );

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 overflow-y-auto flex flex-col dark:bg-[#0f1628] dark:border-border">
      <div className="px-3 py-3 border-b border-slate-200 dark:border-border">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fields</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-0.5">
              {grouped[cat].map((field) => (
                <PaletteItem
                  key={field.type}
                  type={field.type}
                  label={field.label}
                  description={field.description}
                  onAdd={onAdd}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PaletteItem({
  type,
  label,
  description,
  onAdd,
}: {
  type: FieldType;
  label: string;
  description: string;
  onAdd: (type: FieldType) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { fromPalette: true, fieldType: type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onAdd(type)}
      title={description}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-700 dark:text-slate-300",
        "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-muted/70 dark:hover:text-white transition-colors",
        "flex items-center gap-2 cursor-grab active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDragging && "opacity-40"
      )}
    >
      <FieldTypeIcon type={type} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function FieldTypeIcon({ type }: { type: FieldType }) {
  const icons: Partial<Record<FieldType, string>> = {
    text: "T",
    textarea: "¶",
    number: "#",
    email: "@",
    phone: "☎",
    date: "📅",
    time: "🕐",
    datetime: "📆",
    dropdown: "▾",
    "multi-select": "☑",
    radio: "◉",
    "checkbox-group": "☑",
    "yes-no": "⇌",
    "file-upload": "📎",
    "section-header": "H",
    divider: "—",
    "rich-text": "✎",
    "table-grid": "⊞",
    "user-picker": "👤",
    "dept-picker": "🏢",
    "signature-pad": "✒",
    "auto-name": "⚡",
    "auto-company": "⚡",
    "auto-dept": "⚡",
    "auto-designation": "⚡",
    "auto-date": "⚡",
  };

  return (
    <span
      className="w-5 h-5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 dark:bg-muted/80 dark:text-slate-400"
      aria-hidden
    >
      {icons[type] ?? "?"}
    </span>
  );
}
