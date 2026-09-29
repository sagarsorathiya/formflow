"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, Save } from "lucide-react";
import { FormRenderer } from "@/components/form-renderer/form-renderer";
import { Spinner } from "@/components/ui/spinner";
import type { FormSchema, FieldDefinition } from "@/lib/types/schema";
import type { UploadedFileMeta } from "@/components/form-renderer/field-renderer";

const GRACE_PERIOD_MS = 15 * 60 * 1000;

interface SubmissionData {
  id: string;
  serialNo: string | null;
  createdAt: string;
  status: string;
  dataJson: Record<string, unknown>;
  formVersion: {
    schemaJson: FormSchema;
    form: { title: string };
  };
  tasks: { status: string }[];
  files: UploadedFileMeta[];
}

export default function EditSubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [fileMeta, setFileMeta] = useState<Record<string, UploadedFileMeta>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(GRACE_PERIOD_MS);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch submission
  useEffect(() => {
    fetch(`/api/submissions/${id}/details`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setLoadError(json.error?.message ?? "Failed to load submission."); return; }
        setSubmission(json.data);
        setData(json.data.dataJson ?? {});
        setFileMeta(Object.fromEntries((json.data.files ?? []).map((f: UploadedFileMeta) => [f.id, f])));
      })
      .catch(() => setLoadError("Failed to load submission."));
  }, [id]);

  // Countdown timer
  useEffect(() => {
    if (!submission) return;
    function calc() {
      const age = Date.now() - new Date(submission!.createdAt).getTime();
      const rem = Math.max(0, GRACE_PERIOD_MS - age);
      setRemainingMs(rem);
      if (rem === 0) router.replace(`/requests/${id}`);
    }
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [submission, id, router]);

  const handleFileUpload = useCallback(async (field: FieldDefinition, files: File[]) => {
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
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!submission) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/submissions/${id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataJson: data }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.details) {
          setErrors(json.error.details as Record<string, string>);
        }
        setSaveError(json.error?.message ?? "Save failed.");
        return;
      }
      router.push(`/requests/${id}?edited=true`);
    } finally {
      setSaving(false);
    }
  }, [submission, id, data, router]);

  if (loadError) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center gap-2 text-slate-400">
        <Spinner className="w-4 h-4" /> Loading…
      </div>
    );
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const isUrgent = remainingMs < 3 * 60 * 1000;

  const schema = submission.formVersion.schemaJson;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <button
            onClick={() => router.push(`/requests/${id}`)}
            className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:opacity-80 transition text-sm"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Request
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Edit: {submission.formVersion.form.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {submission.serialNo} · Changes replace the original submission — no new request is created.
          </p>
        </div>

        {/* Countdown */}
        <span
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl border ${
            isUrgent
              ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30"
              : "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30"
          }`}
        >
          <Clock className="h-4 w-4" />
          {countdown} remaining
        </span>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700
                      dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
        You can edit this request within <strong>15 minutes</strong> of submission, as long as no approver has acted on it.
        Your edits update the existing request — no duplicate is created.
      </div>

      {/* Form */}
      <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card
                      dark:bg-card dark:border-border dark:shadow-none">
        <FormRenderer
          schema={schema}
          data={data}
          mode="fill"
          onChange={(key, value) => setData((prev) => ({ ...prev, [key]: value }))}
          errors={errors}
          fileMeta={fileMeta}
          onFileUpload={handleFileUpload}
        />
      </div>

      {/* Save error */}
      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3">
          {saveError}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => router.push(`/requests/${id}`)}
          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || remainingMs === 0}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
        >
          {saving ? <Spinner className="w-4 h-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
