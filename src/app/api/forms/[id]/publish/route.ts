/**
 * Publish the current draft version.
 * After publish the FormVersion is immutable — new edits create a new version.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { validateWorkflow } from "@/lib/workflow/validate";
import type { WorkflowDefinition } from "@/lib/types/schema";

const publishSchema = z.object({
  audience: z
    .object({
      companies: z.array(z.string()).default([]),
      departments: z.array(z.string()).default([]),
      designations: z.array(z.string()).default([]),
      adGroups: z.array(z.string()).default([]),
    })
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();
    const body = publishSchema.parse(await req.json());

    const form = await prisma.form.findUnique({
      where: { id: params.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "You are not authorized to publish this form.");

    const draft = form.versions[0];
    if (!draft) throw new AppError("NO_DRAFT", 400, "No version to publish.");
    if (draft.publishedAt) throw new AppError("ALREADY_PUBLISHED", 400, "This version is already published.");

    // Validate schema has at least one field
    const schemaJson = draft.schemaJson as { pages?: { fields?: unknown[] }[] };
    const hasFields = schemaJson?.pages?.some((p) => (p.fields?.length ?? 0) > 0);
    if (!hasFields) {
      throw new AppError("EMPTY_FORM", 400, "Add at least one field before publishing.");
    }

    // Validate workflow structure
    const workflowJson = draft.workflowJson as WorkflowDefinition | null;
    if (workflowJson) {
      const wfResult = validateWorkflow(workflowJson);
      if (!wfResult.valid) {
        throw new AppError(
          "INVALID_WORKFLOW",
          400,
          `Workflow is invalid: ${wfResult.errors.join("; ")}`
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const publishedVersion = await tx.formVersion.update({
        where: { id: draft.id },
        data: {
          publishedAt: new Date(),
          publishedById: user.id,
        },
      });

      const updatedForm = await tx.form.update({
        where: { id: form.id },
        data: {
          status: "PUBLISHED",
          currentVersionId: publishedVersion.id,
        },
      });

      // Upsert audience
      if (body.audience) {
        await tx.formAudience.upsert({
          where: { formId: form.id },
          create: { formId: form.id, ...body.audience },
          update: body.audience,
        });
      }

      await writeAudit({
        actorId: user.id,
        action: "FORM_PUBLISHED",
        entityType: "Form",
        entityId: form.id,
        after: { versionId: publishedVersion.id },
        tx,
      });

      return updatedForm;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
