"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useState,
} from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { FieldPalette } from "./field-palette";
import { BuilderCanvas, CANVAS_ID } from "./builder-canvas";
import { PropertiesPanel } from "./properties-panel";
import { SortableFieldCard } from "./sortable-field-card";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { WorkflowDesigner } from "@/components/workflow/workflow-designer";
import { AudiencePanel } from "./audience-panel";
import { FormRulesPanel } from "./form-rules-panel";
import { createField } from "@/lib/builder-utils";
import type { FieldDefinition, FormSchema, FieldType, WorkflowDefinition } from "@/lib/types/schema";

// ── Page Tabs component ──────────────────────────────────────────────────────

interface PageTabsProps {
  pages: FormSchema["pages"];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
  onRename: (i: number, title: string) => void;
}

function PageTabs({ pages, activeIndex, onSelect, onAdd, onDelete, onRename }: PageTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(i: number) {
    setEditingIndex(i);
    setEditValue(pages[i].title);
  }

  function commitEdit() {
    if (editingIndex !== null && editValue.trim()) {
      onRename(editingIndex, editValue.trim());
    }
    setEditingIndex(null);
  }

  if (pages.length <= 1 && editingIndex === null) {
    return (
      <div className="flex items-center gap-1 px-4 pt-2 border-b border-slate-200 dark:border-border shrink-0">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 px-3 py-1.5 bg-white dark:bg-muted/60 border border-slate-200 dark:border-border rounded-t-md -mb-px border-b-white dark:border-b-[#0b1120]">
          {pages[0]?.title || "Page 1"}
        </span>
        <button
          onClick={onAdd}
          className="text-xs px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition rounded"
          title="Add page"
        >
          + Add page
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 px-4 pt-2 border-b border-slate-200 dark:border-border shrink-0 overflow-x-auto">
      {pages.map((page, i) => (
        <div key={i} className="flex items-center shrink-0">
          {editingIndex === i ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingIndex(null); }}
              className="text-xs px-2 py-1 border border-primary rounded outline-none bg-white dark:bg-muted text-slate-900 dark:text-white w-28"
            />
          ) : (
            <button
              onClick={() => onSelect(i)}
              onDoubleClick={() => startEdit(i)}
              title="Double-click to rename"
              className={`text-xs px-3 py-1.5 rounded-t-md border border-b-0 transition select-none ${
                activeIndex === i
                  ? "bg-white dark:bg-[#0b1120] border-slate-200 dark:border-border text-slate-900 dark:text-white font-medium -mb-px"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {page.title || `Page ${i + 1}`}
            </button>
          )}
          {pages.length > 1 && editingIndex !== i && (
            <button
              onClick={() => onDelete(i)}
              className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition text-xs px-0.5 -ml-1 mr-0.5"
              title="Remove page"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="text-xs px-2 py-1 text-slate-400 hover:text-primary dark:hover:text-orange-400 transition rounded shrink-0"
        title="Add page"
      >
        + Add page
      </button>
    </div>
  );
}

interface BuilderShellProps {
  formId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialDepartmentId: string | null;
  initialRules: { anonymous: boolean; oneTimeOnly: boolean; confidential: boolean };
  initialDepartmentName: string | null;
  initialStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  initialSchema: FormSchema;
  initialWorkflowJson: Record<string, unknown>;
}

// - Undo/redo history -

interface HistoryState {
  schema: FormSchema;
  past: FormSchema[];
  future: FormSchema[];
}

type HistoryAction =
  | { type: "SET"; schema: FormSchema }
  | { type: "UNDO" }
  | { type: "REDO" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET":
      return {
        schema: action.schema,
        past: [...state.past, state.schema].slice(-50),
        future: [],
      };
    case "UNDO":
      if (state.past.length === 0) return state;
      return {
        schema: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.schema, ...state.future],
      };
    case "REDO":
      if (state.future.length === 0) return state;
      return {
        schema: state.future[0],
        past: [...state.past, state.schema],
        future: state.future.slice(1),
      };
  }
}

export function BuilderShell({
  formId,
  initialTitle,
  initialDescription,
  initialDepartmentId,
  initialDepartmentName,
  initialRules,
  initialStatus,
  initialSchema,
  initialWorkflowJson,
}: BuilderShellProps) {
  const [history, dispatch] = useReducer(historyReducer, {
    schema: initialSchema,
    past: [],
    future: [],
  });

  const schema = history.schema;
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const activePage = Math.min(currentPageIndex, Math.max(0, schema.pages.length - 1));
  const fields = schema.pages[activePage]?.fields ?? [];

  const [workflowJson, setWorkflowJson] = useState<WorkflowDefinition>(
    initialWorkflowJson as unknown as WorkflowDefinition
  );

  const [currentTab, setCurrentTab] = useState<"design" | "workflow" | "audience" | "preview">("design");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [formStatus, setFormStatus] = useState(initialStatus);
  const [unpublishing, setUnpublishing] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [editingDetails, setEditingDetails] = useState(false);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? "");
  const [departmentName, setDepartmentName] = useState(initialDepartmentName);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string }[]>([]);
  const [detailsDraft, setDetailsDraft] = useState({
    title: initialTitle,
    description: initialDescription ?? "",
    departmentId: initialDepartmentId ?? "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  async function handleSaveDetails() {
    setSavingDetails(true);
    setDetailsError(null);
    try {
      // departmentId is only sent for a DRAFT: PATCH /api/forms/[id] rejects a
      // department change on a PUBLISHED form (it would move live submissions'
      // ownership and change the serial prefix mid-flight).
      const payload: Record<string, unknown> = {
        title: detailsDraft.title,
        description: detailsDraft.description || null,
      };
      if (formStatus !== "PUBLISHED" && detailsDraft.departmentId !== (departmentId ?? "")) {
        payload.departmentId = detailsDraft.departmentId || null;
      }

      const res = await fetch(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setDetailsError(json.error?.message ?? "Failed to save.");
        return;
      }
      setTitle(detailsDraft.title);
      setDescription(detailsDraft.description);
      if (payload.departmentId !== undefined) {
        setDepartmentId(detailsDraft.departmentId);
        setDepartmentName(departments.find((d) => d.id === detailsDraft.departmentId)?.name ?? null);
      }
      setEditingDetails(false);
    } catch {
      setDetailsError("Network error.");
    } finally {
      setSavingDetails(false);
    }
  }

  const selectedField = fields.find((f) => f.key === selectedKey) ?? null;

  // Clamp page index if schema changes (e.g. undo removes pages)
  useEffect(() => {
    if (currentPageIndex >= schema.pages.length) {
      setCurrentPageIndex(Math.max(0, schema.pages.length - 1));
    }
  }, [schema.pages.length, currentPageIndex]);

  // - Manual save -

  const handleSave = useCallback(
    async (schemaToSave: FormSchema, workflowToSave: WorkflowDefinition) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/forms/${formId}/draft`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemaJson: schemaToSave, workflowJson: workflowToSave }),
        });
        if (!res.ok) throw new Error("save failed");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [formId]
  );

  // - Move to Draft / Unpublish -

  async function handleUnpublish() {
    setUnpublishing(true);
    try {
      const res = await fetch(`/api/forms/${formId}/unpublish`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error?.message ?? "Failed to move to draft");
        return;
      }
      setFormStatus("DRAFT");
      setConfirmUnpublish(false);
    } finally {
      setUnpublishing(false);
    }
  }

  // - Delete form -

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/forms/${formId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error?.message ?? "Delete failed");
        setConfirmDelete(false);
        return;
      }
      window.location.href = "/builder";
    } finally {
      setDeleting(false);
    }
  }

  // - Schema mutations -

  function setSchema(newSchema: FormSchema) {
    dispatch({ type: "SET", schema: newSchema });
    setSaveState("unsaved");
  }

  function updateFields(updater: (prev: FieldDefinition[]) => FieldDefinition[]) {
    const newSchema: FormSchema = {
      ...schema,
      pages: schema.pages.map((p, i) =>
        i === activePage ? { ...p, fields: updater(p.fields) } : p
      ),
    };
    setSchema(newSchema);
  }

  function addPage() {
    const newSchema: FormSchema = {
      ...schema,
      pages: [
        ...schema.pages,
        { title: `Page ${schema.pages.length + 1}`, fields: [] },
      ],
    };
    setSchema(newSchema);
    setCurrentPageIndex(schema.pages.length);
    setSelectedKey(null);
  }

  function deletePage(index: number) {
    if (schema.pages.length <= 1) return;
    const newSchema: FormSchema = {
      ...schema,
      pages: schema.pages.filter((_, i) => i !== index),
    };
    setSchema(newSchema);
    setCurrentPageIndex(Math.max(0, index - 1));
    setSelectedKey(null);
  }

  function renamePage(index: number, title: string) {
    const newSchema: FormSchema = {
      ...schema,
      pages: schema.pages.map((p, i) => (i === index ? { ...p, title } : p)),
    };
    setSchema(newSchema);
  }

  function addField(type: FieldType, insertAt?: number) {
    const newField = createField(type, schema);
    updateFields((prev) => {
      if (insertAt !== undefined) {
        const arr = [...prev];
        arr.splice(insertAt, 0, newField);
        return arr;
      }
      return [...prev, newField];
    });
    setSelectedKey(newField.key);
  }

  function deleteField(key: string) {
    updateFields((prev) => prev.filter((f) => f.key !== key));
    setSelectedKey(null);
  }

  function updateField(updated: FieldDefinition) {
    updateFields((prev) => prev.map((f) => (f.key === updated.key ? updated : f)));
  }

  // - Workflow mutations -

  function handleWorkflowChange(newWorkflow: WorkflowDefinition) {
    setWorkflowJson(newWorkflow);
    setSaveState("unsaved");
  }

  // - Keyboard shortcuts -

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const inInput = ["input", "textarea", "select"].includes(tag);

      if (!inInput && (e.key === "Delete" || e.key === "Backspace") && selectedKey) {
        e.preventDefault();
        deleteField(selectedKey);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
        setSaveState("unsaved");
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: "REDO" });
        setSaveState("unsaved");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, history.past, history.future]);

  // Deselect when clicking canvas background
  function handleCanvasClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) setSelectedKey(null);
  }

  // - DnD -

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { fromPalette?: boolean; fieldType?: FieldType; fromCanvas?: boolean } | undefined;

    if (activeData?.fromPalette && activeData.fieldType) {
      // Drop from palette
      const overKey = String(over.id);
      const overIndex = fields.findIndex((f) => f.key === overKey);
      const insertAt = overKey === CANVAS_ID ? fields.length : (overIndex >= 0 ? overIndex : fields.length);
      addField(activeData.fieldType, insertAt);
      return;
    }

    if (activeData?.fromCanvas) {
      // Reorder within canvas
      const activeKey = String(active.id);
      const overKey = String(over.id);
      if (activeKey === overKey || overKey === CANVAS_ID) return;

      const oldIndex = fields.findIndex((f) => f.key === activeKey);
      const newIndex = fields.findIndex((f) => f.key === overKey);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        updateFields((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  }

  // Find active field for drag overlay
  const activeField = activeId?.startsWith("palette-")
    ? null
    : fields.find((f) => f.key === activeId);

  // - Publish -

  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    // Save any unsaved changes before publishing
    if (saveState === "unsaved") {
      await handleSave(schema, workflowJson);
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/forms/${formId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message ?? "Publish failed");
        return;
      }
      window.location.href = `/builder`;
    } finally {
      setPublishing(false);
    }
  }

  // - Render -

  const SaveIndicator = () => (
    <span className={`text-xs ${
      saveState === "saved"   ? "text-green-600 dark:text-green-400" :
      saveState === "saving"  ? "text-slate-400 animate-pulse" :
      saveState === "error"   ? "text-red-500" : "text-amber-500"
    }`}>
      {saveState === "saved"   && "✓ Saved"}
      {saveState === "saving"  && "Saving..."}
      {saveState === "unsaved" && "Unsaved changes"}
      {saveState === "error"   && "Save failed — retry"}
    </span>
  );

  return (
    <>
      {/* Desktop-only guard — hidden on large screens, shown on small */}
      <div className="lg:hidden flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="rounded-2xl border border-black/8 bg-white p-10 max-w-sm w-full shadow-card dark:bg-card dark:border-border">
          <p className="text-3xl mb-4" aria-hidden="true">🖥️</p>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Desktop Required</h2>
          <p className="text-sm text-slate-500">The Form Builder requires a desktop browser (1024px or wider). Please open this page on a laptop or desktop computer.</p>
          <a href="/builder" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
            ← Back to Forms
          </a>
        </div>
      </div>

    <div className="hidden lg:flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Builder header */}
      <div className="bg-white border-b border-slate-200 px-4 h-12 flex items-center justify-between gap-4 shrink-0 dark:bg-[#0f1628] dark:border-border">
        <div className="flex items-center gap-3 relative">
          <a href="/builder" className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition text-sm">
            ← Back
          </a>
          <span className="text-slate-300 dark:text-white/20">|</span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white max-w-[300px] truncate">
            {title}
          </span>
          <button
            onClick={async () => {
              setDetailsDraft({ title, description, departmentId: departmentId ?? "" });
              setDetailsError(null);
              setEditingDetails(true);
              if (departments.length === 0) {
                try {
                  const res = await fetch("/api/orgs/departments");
                  const json = await res.json();
                  if (json.ok) setDepartments(json.data);
                } catch {
                  /* dropdown just stays empty; title/description still editable */
                }
              }
            }}
            className="text-slate-400 hover:text-primary dark:hover:text-orange-400 transition text-xs"
            title="Edit title, description & owner department"
          >
            ✎
          </button>
          <SaveIndicator />

          {editingDetails && (
            <div className="absolute top-full left-0 mt-2 w-96 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-lg shadow-panel p-4 z-50 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Title</label>
                <input
                  type="text"
                  value={detailsDraft.title}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, title: e.target.value }))}
                  maxLength={200}
                  className="w-full text-sm rounded-md border border-slate-300 dark:border-border dark:bg-muted/60 px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Description</label>
                <textarea
                  value={detailsDraft.description}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, description: e.target.value }))}
                  maxLength={500}
                  rows={3}
                  className="w-full text-sm rounded-md border border-slate-300 dark:border-border dark:bg-muted/60 px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                  Owner Department
                </label>
                {formStatus === "PUBLISHED" ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 rounded-md bg-slate-50 dark:bg-muted/60 px-2.5 py-1.5">
                    {departmentName ?? "None"} — move the form to Draft to change this.
                  </p>
                ) : (
                  <select
                    value={detailsDraft.departmentId}
                    onChange={(e) => setDetailsDraft((d) => ({ ...d, departmentId: e.target.value }))}
                    className="w-full text-sm rounded-md border border-slate-300 dark:border-border dark:bg-muted/60 px-2.5 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">— None —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {detailsError && <p className="text-xs text-red-500">{detailsError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingDetails(false)}
                  className="text-xs px-3 py-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-muted/60 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={!detailsDraft.title.trim() || savingDetails}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-white disabled:opacity-50 transition"
                >
                  {savingDetails ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-muted/70 rounded-lg p-0.5 h-8 gap-0.5">
            {(["design", "workflow", "audience", "preview"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`text-xs px-3 h-7 rounded-md font-medium transition-colors capitalize ${
                  currentTab === tab
                    ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 border-l border-slate-200 dark:border-border pl-2">
            <button onClick={() => dispatch({ type: "UNDO" })} disabled={history.past.length === 0}
              className="px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-muted/80 disabled:opacity-40 transition" title="Undo (Ctrl+Z)">↩</button>
            <button onClick={() => dispatch({ type: "REDO" })} disabled={history.future.length === 0}
              className="px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-muted/80 disabled:opacity-40 transition" title="Redo (Ctrl+Y)">↪</button>
          </div>

          {/* Delete form */}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5 text-xs border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 rounded-lg px-3 py-1.5">
              <span className="text-red-700 dark:text-red-300">Delete form?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="font-semibold text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                -
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
            >
              Delete
            </button>
          )}

          {/* Move to Draft — only visible when form is published */}
          {formStatus === "PUBLISHED" && (
            confirmUnpublish ? (
              <div className="flex items-center gap-1.5 text-xs border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 rounded-lg px-3 py-1.5">
                <span className="text-amber-700 dark:text-amber-300">Move to Draft?</span>
                <button
                  onClick={handleUnpublish}
                  disabled={unpublishing}
                  className="font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 disabled:opacity-50"
                >
                  {unpublishing ? "Moving..." : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmUnpublish(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  -
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmUnpublish(true)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-muted/70 transition"
              >
                Move to Draft
              </button>
            )
          )}

          {/* Save */}
          <button
            onClick={() => handleSave(schema, workflowJson)}
            disabled={saveState === "saving" || saveState === "saved"}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-muted/70 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {saveState === "saving" ? "Saving..." : "Save"}
          </button>

          {/* Publish */}
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      {/* Body — conditional rendering by currentTab, no Radix Tabs wrapper */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* â"€â"€ Design tab â"€â"€ */}
        <div className={`flex h-full ${currentTab === "design" ? "" : "hidden"}`}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <FieldPalette onAdd={(type) => addField(type)} />

            <div className="flex-1 overflow-hidden flex flex-col" onClick={handleCanvasClick}>
              {/* Page tabs */}
              <PageTabs
                pages={schema.pages}
                activeIndex={activePage}
                onSelect={(i) => { setCurrentPageIndex(i); setSelectedKey(null); }}
                onAdd={addPage}
                onDelete={deletePage}
                onRename={renamePage}
              />
              <BuilderCanvas
                fields={fields}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                onDelete={deleteField}
              />
            </div>

            <DragOverlay>
              {activeField ? (
                <SortableFieldCard
                  field={activeField}
                  isSelected={false}
                  onSelect={() => {}}
                  onDelete={() => {}}
                  isDragOverlay
                />
              ) : activeId?.startsWith("palette-") ? (
                <div className="rounded-lg border border-primary bg-primary/5 px-3 py-2 text-sm font-medium text-primary shadow-md">
                  + {activeId.replace("palette-", "").replace(/-/g, " ")}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {selectedField ? (
            <PropertiesPanel
              field={selectedField}
              schema={schema}
              onChange={updateField}
            />
          ) : (
            <aside className="w-72 shrink-0 bg-white border-l border-slate-200 flex items-center justify-center dark:bg-[#0f1628] dark:border-border">
              <p className="text-xs text-slate-400 text-center px-4">
                Select a field to edit its properties
              </p>
            </aside>
          )}
        </div>

        {/* â"€â"€ Workflow tab â"€â"€ */}
        <div className={`h-full ${currentTab === "workflow" ? "" : "hidden"}`}>
          <WorkflowDesigner
            initialWorkflow={workflowJson}
            schema={schema}
            isVisible={currentTab === "workflow"}
            onChange={handleWorkflowChange}
          />
        </div>

        {/* â"€â"€ Audience tab â"€â"€ */}
        <div className={`h-full overflow-y-auto ${currentTab === "audience" ? "" : "hidden"}`}>
          <div className="p-6 pb-0">
            <FormRulesPanel formId={formId} initial={initialRules} />
          </div>
          <div className="flex">
            <AudiencePanel formId={formId} />
          </div>
        </div>

        {/* â"€â"€ Preview tab â"€â"€ */}
        <div className={`h-full overflow-y-auto p-6 bg-slate-50 dark:bg-[#0b1120] ${currentTab === "preview" ? "" : "hidden"}`}>
          <div className="max-w-2xl mx-auto bg-white rounded-xl border border-black/8 p-6 shadow-sm dark:bg-card dark:border-border">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h2>
            <p className="text-xs text-slate-400 mb-4">Preview — form as users will see it</p>
            {schema.pages.every((p) => p.fields.length === 0) ? (
              <p className="text-sm text-slate-400 text-center py-8">
                Add fields in the Design tab to see a preview
              </p>
            ) : (
              <FormRenderer
                schema={schema}
                data={{}}
                mode="fill"
                onChange={() => {}}
                userContext={{ name: "Preview User", department: "IT", designation: "Officer" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
