"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { SortableFieldCard } from "./sortable-field-card";
import type { FieldDefinition } from "@/lib/types/schema";

export const CANVAS_ID = "builder-canvas";

interface BuilderCanvasProps {
  fields: FieldDefinition[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onDelete: (key: string) => void;
}

export function BuilderCanvas({ fields, selectedKey, onSelect, onDelete }: BuilderCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_ID });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 overflow-y-auto p-4 min-h-full transition-colors",
        isOver && fields.length === 0 && "bg-primary/5"
      )}
    >
      {fields.length === 0 ? (
        <div
          className={cn(
            "h-full min-h-[400px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3",
            isOver ? "border-primary bg-primary/5" : "border-slate-200 dark:border-border"
          )}
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-muted/80 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {isOver ? "Drop here" : "Drag fields here"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              or click a field in the palette to add it
            </p>
          </div>
        </div>
      ) : (
        <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 max-w-2xl mx-auto">
            {fields.map((field) => (
              <SortableFieldCard
                key={field.key}
                field={field}
                isSelected={selectedKey === field.key}
                onSelect={() => onSelect(field.key)}
                onDelete={() => onDelete(field.key)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
