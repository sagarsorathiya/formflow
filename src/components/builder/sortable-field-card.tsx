"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { fieldTypeLabel } from "@/lib/builder-utils";
import type { FieldDefinition } from "@/lib/types/schema";

interface SortableFieldCardProps {
  field: FieldDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isDragOverlay?: boolean;
}

export const SortableFieldCard = memo(function SortableFieldCard({
  field,
  isSelected,
  onSelect,
  onDelete,
  isDragOverlay = false,
}: SortableFieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
    data: { fromCanvas: true, fieldKey: field.key },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        "group relative rounded-lg border bg-white transition-shadow dark:bg-card",
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-sm dark:border-orange-500/60 dark:ring-orange-500/15"
          : "border-slate-200 hover:border-slate-300 dark:border-border dark:hover:border-white/20",
        isDragging && !isDragOverlay && "opacity-40",
        isDragOverlay && "shadow-lg rotate-1 opacity-95"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        className={cn(
          "absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded",
          "text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isSelected && "opacity-100"
        )}
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>

      {/* Field body — click to select */}
      <button
        type="button"
        className="w-full text-left pl-8 pr-8 py-3 focus:outline-none"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {fieldTypeLabel(field.type)}
          </span>
          {field.required && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 px-1 rounded">
              Required
            </span>
          )}
          {field.visibleIf && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1 rounded">
              Conditional
            </span>
          )}
          {field.stepEditable && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-1 rounded">
              Step-editable
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5 truncate">{field.label}</p>
        {field.helpText && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{field.helpText}</p>
        )}
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded",
          "text-slate-300 hover:text-red-500 transition-colors",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isSelected && "opacity-100"
        )}
        aria-label={`Delete ${field.label}`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}, (prev, next) =>
  prev.field.key === next.field.key &&
  prev.field.label === next.field.label &&
  prev.field.required === next.field.required &&
  prev.isSelected === next.isSelected
);

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3.5" r="1.2" />
      <circle cx="10" cy="3.5" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="10.5" r="1.2" />
      <circle cx="10" cy="10.5" r="1.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
