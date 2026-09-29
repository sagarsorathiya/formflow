import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isSubmitterHidden, canSeeSubmissionValues, ANONYMOUS_LABEL, REDACTED_LABEL } from "@/lib/form-privacy";
import * as XLSX from "xlsx";

type FieldDef = {
  key: string;
  label: string;
  type: string;
};

const SKIP_TYPES = new Set([
  "section-header", "section_header",
  "divider",
  "rich-text", "rich_text",
  "static-text",
]);

function flattenSchema(schemaJson: unknown): FieldDef[] {
  const schema = schemaJson as { pages?: { fields?: FieldDef[] }[] };
  const fields: FieldDef[] = [];
  for (const page of schema?.pages ?? []) {
    for (const field of page?.fields ?? []) {
      if (SKIP_TYPES.has(field.type)) continue;
      fields.push({ key: field.key, label: field.label, type: field.type });
    }
  }
  return fields;
}

function formatFieldValue(value: unknown, type: string, fileNameById?: Map<string, string>): string {
  if (value == null || value === "") return "";
  if (type === "file-upload" || type === "file") {
    if (!Array.isArray(value) || value.length === 0) return "";
    return value.map((v) => (typeof v === "string" ? fileNameById?.get(v) ?? v : String(v))).join(", ");
  }
  if (type === "signature-pad" || type === "signature") return "[signature]";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const formId = searchParams.get("formId");

    if (!formId) {
      return NextResponse.json({ error: { message: "formId is required." } }, { status: 400 });
    }

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: {
        title: true,
        departmentId: true,
        status: true,
        currentVersionId: true,
        anonymous: true,
        confidential: true,
      },
    });
    const currentVersion = form?.currentVersionId
      ? await prisma.formVersion.findUnique({
          where: { id: form.currentVersionId },
          select: { schemaJson: true },
        })
      : null;

    if (!form) {
      return NextResponse.json({ error: { message: "Form not found." } }, { status: 404 });
    }

    if (user.role === "DEPT_ADMIN" && user.departmentId !== form.departmentId) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }
    if (user.role === "USER") {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    const submissions = await prisma.submission.findMany({
      where: {
        formVersion: { formId },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      include: {
        formVersion: { select: { version: true, schemaJson: true } },
        submittedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
            designation: true,
            department: { select: { name: true } },
          },
        },
        files: { select: { id: true, originalName: true } },
        tasks: { select: { resolvedAssigneeIds: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Use the current form schema for column headers; fall back to each submission's own schema
    const schemaFields = flattenSchema(currentVersion?.schemaJson ?? submissions[0]?.formVersion.schemaJson ?? {});

    const metaHeaders = [
      "Serial No",
      "Status",
      "Submitter",
      "Submitter Email",
      "Department",
      "Designation",
      "Submitted At",
      "Completed At",
    ];

    const fieldHeaders = schemaFields.map((f) => f.label || f.key);

    // `form` is nullable in this route's flow; privacy defaults to "no restriction"
    // only when the form genuinely doesn't exist (in which case there are no rows).
    const privacyForm = {
      anonymous: form?.anonymous ?? false,
      confidential: form?.confidential ?? false,
      departmentId: form?.departmentId ?? null,
    };

    const rows = submissions.map((s) => {
      const data = (s.dataJson ?? {}) as Record<string, unknown>;
      const fileNameById = new Map(s.files.map((f) => [f.id, f.originalName]));
      const hideIdentity = isSubmitterHidden(privacyForm, s.submittedById, user.id);
      const showValues = canSeeSubmissionValues(
        privacyForm,
        { submittedById: s.submittedById, approverIds: s.tasks.flatMap((t) => t.resolvedAssigneeIds) },
        { id: user.id, role: user.role, departmentId: user.departmentId }
      );
      const meta = [
        s.serialNo ?? "",
        s.status,
        hideIdentity ? ANONYMOUS_LABEL : s.submittedBy.displayName ?? "",
        hideIdentity ? "" : s.submittedBy.email ?? "",
        hideIdentity ? "" : s.submittedBy.department?.name ?? "",
        hideIdentity ? "" : s.submittedBy.designation ?? "",
        s.createdAt.toLocaleString("en-IN"),
        s.completedAt?.toLocaleString("en-IN") ?? "",
      ];
      const fieldValues = schemaFields.map((f) =>
        showValues ? formatFieldValue(data[f.key], f.type, fileNameById) : REDACTED_LABEL
      );
      return [...meta, ...fieldValues];
    });

    const wsData = [[...metaHeaders, ...fieldHeaders], ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = [
      { wch: 18 }, // Serial No
      { wch: 22 }, // Submitter Name
      { wch: 28 }, // Email
      { wch: 20 }, // Department
      { wch: 20 }, // Designation
      { wch: 14 }, // Status
      { wch: 20 }, // Submitted At
      { wch: 20 }, // Completed At
      ...schemaFields.map(() => ({ wch: 22 })),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Submissions");

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `${form.title.replace(/[^a-z0-9]+/gi, "_")}_submissions.xlsx`;

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
