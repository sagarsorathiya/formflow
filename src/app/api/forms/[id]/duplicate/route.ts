import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { generateUniqueSlug } from "@/lib/form-slug";

/**
 * POST /api/forms/[id]/duplicate — copy a form's design into a new DRAFT form.
 *
 * Copies: title (prefixed), description, owner department/company, the privacy
 * flags, the audience row, and the source's current schemaJson + workflowJson as
 * version 1 of the new form.
 *
 * Deliberately does NOT copy: submissions, versions beyond the one being copied,
 * or PUBLISHED status. A duplicate always starts as a DRAFT so it cannot quietly
 * start collecting responses against an audience the copier never reviewed.
 */

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireDeptAdminOrAbove();

    // Body is optional — an empty POST duplicates with a generated title.
    const raw = await req.json().catch(() => ({}));
    const body = bodySchema.parse(raw ?? {});

    const source = await prisma.form.findUnique({
      where: { id: params.id },
      include: { audience: true },
    });
    if (!source) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, source);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "You are not authorized to copy this form.");

    // Copy the version the form currently points at; fall back to its newest if
    // `currentVersionId` was never set (possible on very old rows).
    const sourceVersion = source.currentVersionId
      ? await prisma.formVersion.findUnique({ where: { id: source.currentVersionId } })
      : await prisma.formVersion.findFirst({
          where: { formId: source.id },
          orderBy: { version: "desc" },
        });

    if (!sourceVersion) {
      throw new AppError("NO_VERSION", 400, "This form has no saved design to copy.");
    }

    const title = body.title?.trim() || `Copy of ${source.title}`;
    const slug = await generateUniqueSlug(title);

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          title,
          slug,
          description: source.description,
          departmentId: source.departmentId,
          companyId: source.companyId,
          // Privacy rules are part of the design, so they travel with the copy.
          anonymous: source.anonymous,
          oneTimeOnly: source.oneTimeOnly,
          confidential: source.confidential,
          status: "DRAFT",
          createdById: user.id,
        },
      });

      // Version 1 of the copy, unpublished — publishedAt/publishedById stay null.
      const version = await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          schemaJson: sourceVersion.schemaJson as object,
          workflowJson: sourceVersion.workflowJson as object,
        },
      });

      const updated = await tx.form.update({
        where: { id: form.id },
        data: { currentVersionId: version.id },
      });

      // Audience travels too, but only matters once the copy is published.
      if (source.audience) {
        await tx.formAudience.create({
          data: {
            formId: form.id,
            companies: source.audience.companies,
            departments: source.audience.departments,
            designations: source.audience.designations,
            adGroups: source.audience.adGroups,
          },
        });
      }

      await writeAudit({
        actorId: user.id,
        action: "FORM_DUPLICATED",
        entityType: "Form",
        entityId: form.id,
        after: {
          title,
          copiedFromFormId: source.id,
          copiedFromTitle: source.title,
          copiedFromVersion: sourceVersion.version,
        },
        tx,
      });

      return updated;
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
