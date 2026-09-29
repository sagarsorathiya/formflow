import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isSubmitterHidden, canSeeSubmissionValues, ANONYMOUS_LABEL, REDACTED_LABEL } from "@/lib/form-privacy";

const SKIP_TYPES = new Set([
  "section-header", "section_header",
  "divider",
  "rich-text", "rich_text",
  "static-text",
]);

type FieldDef = { key: string; label: string; type: string };

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

function formatValue(value: unknown, type: string, fileNameById?: Map<string, string>): string {
  if (value == null || value === "") return "";
  if (type === "file-upload" || type === "file") {
    if (!Array.isArray(value) || value.length === 0) return "";
    return value.map((v) => (typeof v === "string" ? fileNameById?.get(v) ?? v : String(v))).join("; ");
  }
  if (type === "signature-pad" || type === "signature") return "[signature]";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(v: unknown): string {
  const str = v == null ? "" : String(v);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
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
      select: { title: true, departmentId: true, currentVersionId: true, anonymous: true, confidential: true },
    });

    if (!form) {
      return NextResponse.json({ error: { message: "Form not found." } }, { status: 404 });
    }

    if (user.role === "DEPT_ADMIN" && user.departmentId !== form.departmentId) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }
    if (user.role === "USER") {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    const currentVersion = form.currentVersionId
      ? await prisma.formVersion.findUnique({
          where: { id: form.currentVersionId },
          select: { schemaJson: true },
        })
      : null;

    const submissions = await prisma.submission.findMany({
      where: {
        formVersion: { formId },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      include: {
        formVersion: { select: { schemaJson: true } },
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

    const schemaFields = flattenSchema(
      currentVersion?.schemaJson ?? submissions[0]?.formVersion.schemaJson ?? {}
    );

    const metaHeaders = [
      "Serial No", "Status", "Submitter", "Submitter Email",
      "Department", "Designation", "Submitted At", "Completed At",
    ];
    const fieldHeaders = schemaFields.map((f) => f.label || f.key);

    const lines: string[] = [
      row([...metaHeaders, ...fieldHeaders]),
      ...submissions.map((s) => {
        const data = (s.dataJson ?? {}) as Record<string, unknown>;
        const fileNameById = new Map(s.files.map((f) => [f.id, f.originalName]));
        // Anonymous: the exporter is never the submitter in practice, but check
        // anyway so a submitter exporting their own dept's data still sees itself.
        const hideIdentity = isSubmitterHidden(form, s.submittedById, user.id);
        const showValues = canSeeSubmissionValues(
          form,
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
          showValues ? formatValue(data[f.key], f.type, fileNameById) : REDACTED_LABEL
        );
        return row([...meta, ...fieldValues]);
      }),
    ];

    const csv = lines.join("\r\n");
    const filename = `${form.title.replace(/[^a-z0-9]+/gi, "_")}_submissions.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
