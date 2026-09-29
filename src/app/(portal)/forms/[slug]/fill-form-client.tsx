"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { FormSchema, FieldDefinition } from "@/lib/types/schema";
import type { UploadedFileMeta } from "@/components/form-renderer/field-renderer";
import { useFormZoom, ZoomControls, zoomStyle, scaledWidth, FORM_BASE_WIDTH } from "@/components/ui/zoom-controls";

interface FillFormClientProps {
  formId: string;
  formTitle: string;
  formDescription: string | null;
  versionId: string;
  schema: FormSchema;
  draftSubmissionId: string | null;
  initialData: Record<string, unknown>;
  initialFileMeta?: Record<string, UploadedFileMeta>;
  user: { id: string; name: string; company: string; department: string; designation: string };
}

export function FillFormClient({
  formId: _formId,
  formTitle,
  formDescription,
  versionId,
  schema,
  draftSubmissionId,
  initialData,
  initialFileMeta,
  user,
}: FillFormClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submissionId, setSubmissionId] = useState<string | null>(draftSubmissionId);
  const [fileMeta, setFileMeta] = useState<Record<string, UploadedFileMeta>>(initialFileMeta ?? {});
  const [data, setData] = useState<Record<string, unknown>>(() => {
    // Auto-fill fields render with a pre-populated value the user never has
    // to type into — seed the actual submitted data with that value up
    // front, otherwise it's never written to state and gets lost on submit.
    const autoDefaults: Record<string, unknown> = {};
    for (const page of schema.pages) {
      for (const field of page.fields) {
        if (field.key in initialData) continue;
        if (field.type === "auto-name") autoDefaults[field.key] = user.name;
        else if (field.type === "auto-company") autoDefaults[field.key] = user.company;
        else if (field.type === "auto-dept") autoDefaults[field.key] = user.department;
        else if (field.type === "auto-designation") autoDefaults[field.key] = user.designation;
        else if (field.type === "auto-date") {
          autoDefaults[field.key] = new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
        }
      }
    }
    return { ...autoDefaults, ...initialData };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const zoomControls = useFormZoom();
  const [isSavingDraft, startSaveDraft] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const handleChange = useCallback((key: string, value: unknown) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  async function ensureSubmissionId(): Promise<string> {
    if (submissionId) return submissionId;
    const res = await fetch("/api/submissions/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId, dataJson: data, submissionId: null }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Could not save draft.");
    setSubmissionId(json.data.id);
    return json.data.id;
  }

  async function handleFileUpload(field: FieldDefinition, files: File[]) {
    const id = await ensureSubmissionId();
    const formData = new FormData();
    formData.append("fieldKey", field.key);
    files.forEach((f) => formData.append("files", f));

    const res = await fetch(`/api/submissions/${id}/files`, { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Upload failed.");

    const uploaded: UploadedFileMeta[] = json.data.files;
    setFileMeta((prev) => {
      const next = { ...prev };
      for (const f of uploaded) next[f.id] = f;
      return next;
    });
    setData((prev) => {
      const existing = Array.isArray(prev[field.key]) ? (prev[field.key] as string[]) : [];
      return { ...prev, [field.key]: [...existing, ...uploaded.map((f) => f.id)] };
    });
  }

  async function saveDraft() {
    startSaveDraft(async () => {
      const res = await fetch("/api/submissions/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, dataJson: data, submissionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Draft save failed", description: "Your draft could not be saved. Try again.", variant: "error" });
      } else {
        setSubmissionId(json.data.id);
        toast({ title: "Draft saved", variant: "success" });
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    startSubmit(async () => {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, dataJson: data, draftSubmissionId: submissionId }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.error?.code === "VALIDATION_ERROR") {
          setErrors(json.error.details ?? {});
          toast({ title: "Please fix the highlighted fields", variant: "error" });
        } else {
          toast({
            title: "Submission failed",
            description: json.error?.message ?? "Please try again.",
            variant: "error",
          });
        }
        return;
      }

      router.push(`/requests/${json.data.id}?submitted=true`);
    });
  }

  return (
    <div className="w-full overflow-x-auto px-4 md:px-6 space-y-6 py-8">
      {/* Header tracks the zoomed form's on-screen width so the two stay aligned. */}
      <div
        className="mx-auto flex items-start justify-between gap-4"
        style={{ maxWidth: scaledWidth(zoomControls.zoom) }}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{formTitle}</h1>
          {formDescription && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{formDescription}</p>
          )}
        </div>
        <ZoomControls {...zoomControls} className="shrink-0" />
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          ...zoomStyle(zoomControls.zoom),
          maxWidth: FORM_BASE_WIDTH,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
          <FormRenderer
            schema={schema}
            data={data}
            mode="fill"
            onChange={handleChange}
            errors={errors}
            userContext={{
              name: user.name,
              company: user.company,
              department: user.department,
              designation: user.designation,
            }}
            fileMeta={fileMeta}
            onFileUpload={handleFileUpload}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={saveDraft}
            loading={isSavingDraft}
          >
            Save as Draft
          </Button>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Submit Request
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
