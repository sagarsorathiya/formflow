"use client";

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import DOMPurify from "isomorphic-dompurify";
import { Paperclip, Download, X, Loader2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttachmentFile {
  id: string;
  originalName: string;
  mime?: string;
  size?: number;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif"]);

function extOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

/** Inline-clickable attachment row: filename opens the in-portal viewer, the icon downloads directly. */
export function AttachmentItem({ file, className }: { file: AttachmentFile; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 hover:underline truncate min-w-0"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{file.originalName}</span>
        </button>
        {typeof file.size === "number" && (
          <span className="shrink-0 text-slate-500 text-xs">({(file.size / 1024).toFixed(0)} KB)</span>
        )}
        <a
          href={`/api/files/${file.id}`}
          download={file.originalName}
          className="shrink-0 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
          aria-label={`Download ${file.originalName}`}
          title="Download"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
      {open && <DocumentViewerModal file={file} onClose={() => setOpen(false)} />}
    </>
  );
}

type ViewerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "image"; url: string }
  | { status: "pdf"; url: string }
  | { status: "html"; html: string }
  | { status: "unsupported" };

export function DocumentViewerModal({ file, onClose }: { file: AttachmentFile; onClose: () => void }) {
  const [state, setState] = useState<ViewerState>({ status: "loading" });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      const ext = extOf(file.originalName);
      try {
        if (ext === "doc") {
          // Legacy binary Word format has no reliable pure-JS in-browser renderer.
          if (!cancelled) setState({ status: "unsupported" });
          return;
        }

        const res = await fetch(`/api/files/${file.id}`);
        if (!res.ok) throw new Error("Failed to load file.");

        if (IMAGE_EXT.has(ext)) {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setState({ status: "image", url: objectUrl });
          return;
        }

        if (ext === "pdf") {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setState({ status: "pdf", url: objectUrl });
          return;
        }

        if (ext === "docx") {
          const mammoth = await import("mammoth/mammoth.browser");
          const arrayBuffer = await res.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!cancelled) setState({ status: "html", html: DOMPurify.sanitize(result.value) });
          return;
        }

        if (ext === "xls" || ext === "xlsx") {
          const XLSX = await import("xlsx");
          const arrayBuffer = await res.arrayBuffer();
          const wb = XLSX.read(arrayBuffer, { type: "array" });
          const sections = wb.SheetNames.map((name) => {
            const sheetHtml = XLSX.utils.sheet_to_html(wb.Sheets[name], { id: undefined });
            return `<h3 class="xlsx-sheet-name">${name}</h3>${sheetHtml}`;
          });
          if (!cancelled) setState({ status: "html", html: DOMPurify.sanitize(sections.join("")) });
          return;
        }

        if (ext === "eml") {
          const PostalMime = (await import("postal-mime")).default;
          const arrayBuffer = await res.arrayBuffer();
          const email = await PostalMime.parse(arrayBuffer);
          const headerHtml = `
            <div class="eml-headers">
              <div><strong>From:</strong> ${DOMPurify.sanitize(email.from?.address ?? email.from?.name ?? "(unknown)")}</div>
              <div><strong>To:</strong> ${DOMPurify.sanitize((email.to ?? []).map((t) => t.address ?? t.name).join(", "))}</div>
              <div><strong>Subject:</strong> ${DOMPurify.sanitize(email.subject ?? "(no subject)")}</div>
              <div><strong>Date:</strong> ${DOMPurify.sanitize(email.date ?? "")}</div>
            </div>
          `;
          const bodyHtml = email.html
            ? DOMPurify.sanitize(email.html)
            : `<pre class="eml-body-text">${DOMPurify.sanitize(email.text ?? "(empty message)")}</pre>`;
          const attachmentsHtml =
            email.attachments && email.attachments.length > 0
              ? `<div class="eml-attachments"><strong>Attachments:</strong> ${email.attachments
                  .map((a) => DOMPurify.sanitize(a.filename ?? "attachment"))
                  .join(", ")}</div>`
              : "";
          if (!cancelled) {
            setState({ status: "html", html: `${headerHtml}<hr class="eml-divider" />${attachmentsHtml}${bodyHtml}` });
          }
          return;
        }

        if (!cancelled) setState({ status: "unsupported" });
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : "Failed to preview this file." });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.originalName]);

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-[min(92vw,1000px)] h-[min(88vh,900px)] translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-white dark:bg-card border border-black/8 dark:border-border shadow-panel flex flex-col overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-black/8 dark:border-border shrink-0">
            <DialogPrimitive.Title className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-2 min-w-0">
              <Paperclip className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{file.originalName}</span>
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`/api/files/${file.id}`}
                download={file.originalName}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline px-2 py-1"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download
              </a>
              <DialogPrimitive.Close
                className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-muted transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-muted/40">
            {state.status === "loading" && (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
            )}
            {state.status === "error" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <FileWarning className="h-8 w-8 text-red-400" aria-hidden="true" />
                <p className="text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
              </div>
            )}
            {state.status === "unsupported" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <FileWarning className="h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Preview isn&apos;t available for this file type. Use Download to open it.
                </p>
              </div>
            )}
            {state.status === "image" && (
              <div className="h-full flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.url} alt={file.originalName} className="max-w-full max-h-full object-contain" />
              </div>
            )}
            {state.status === "pdf" && (
              <iframe src={state.url} title={file.originalName} className="w-full h-full border-0" />
            )}
            {state.status === "html" && (
              <div
                className="document-preview-html p-6 text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-card max-w-none"
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
