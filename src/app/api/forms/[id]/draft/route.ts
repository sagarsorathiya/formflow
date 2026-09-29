/**
 * Autosave draft — saves schemaJson and/or workflowJson to the current DRAFT version.
 * Creates a new draft version if current version is already published.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

const draftSchema = z.object({
  schemaJson: z.record(z.unknown()).optional(),
  workflowJson: z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();
    const body = draftSchema.parse(await req.json());

    if (!body.schemaJson && !body.workflowJson) {
      throw new AppError("BAD_REQUEST", 400, "Provide schemaJson or workflowJson to save.");
    }

    const form = await prisma.form.findUnique({
      where: { id: params.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "You are not authorized to edit this form.");

    const latestVersion = form.versions[0];

    const version = await prisma.$transaction(async (tx) => {
      // If the latest version is published, create a new draft version
      if (latestVersion?.publishedAt) {
        const newVersion = await tx.formVersion.create({
          data: {
            formId: form.id,
            version: (latestVersion.version ?? 0) + 1,
            schemaJson: (body.schemaJson ?? latestVersion.schemaJson) as object,
            workflowJson: (body.workflowJson ?? latestVersion.workflowJson) as object,
          },
        });

        await tx.form.update({
          where: { id: form.id },
          data: { currentVersionId: newVersion.id, status: "DRAFT" },
        });

        await writeAudit({
          actorId: user.id,
          action: "FORM_VERSION_CREATED",
          entityType: "FormVersion",
          entityId: newVersion.id,
          tx,
        });

        return newVersion;
      }

      // Update existing draft version
      const updated = await tx.formVersion.update({
        where: { id: latestVersion!.id },
        data: {
          ...(body.schemaJson && { schemaJson: body.schemaJson as object }),
          ...(body.workflowJson && { workflowJson: body.workflowJson as object }),
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, data: { versionId: version.id } });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
