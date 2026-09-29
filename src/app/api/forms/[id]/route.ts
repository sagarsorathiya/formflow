import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();

    const form = await prisma.form.findUnique({ where: { id: params.id } });
    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "Not authorized.");

    await prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: params.id },
        data: { status: "ARCHIVED" },
      });
      await writeAudit({
        actorId: user.id,
        action: "FORM_ARCHIVED",
        entityType: "Form",
        entityId: params.id,
        tx,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();

    const form = await prisma.form.findUnique({
      where: { id: params.id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 10,
          select: {
            id: true,
            version: true,
            publishedAt: true,
            publishedById: true,
            createdAt: true,
            schemaJson: true,
            workflowJson: true,
          },
        },
        audience: true,
      },
    });

    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "You are not authorized to view this form.");

    return NextResponse.json({ ok: true, data: form });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

const patchFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  departmentId: z.string().cuid().nullable().optional(),
  // Privacy / submission rules — Form metadata like title & description, so
  // they stay editable on a PUBLISHED form (see the IMMUTABLE guard below,
  // which deliberately only covers departmentId).
  anonymous: z.boolean().optional(),
  oneTimeOnly: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();
    const body = patchFormSchema.parse(await req.json());

    const form = await prisma.form.findUnique({ where: { id: params.id } });
    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "You are not authorized to edit this form.");

    // Title/description are Form metadata, not FormVersion content — editable regardless
    // of publish status. Reassigning departmentId on a live published form is riskier, so
    // that still requires moving the form back to draft first.
    if (form.status === "PUBLISHED" && body.departmentId !== undefined) {
      throw new AppError("IMMUTABLE", 400, "Published forms cannot be reassigned to a different department directly. Move to draft first.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const f = await tx.form.update({
        where: { id: params.id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.departmentId !== undefined && { departmentId: body.departmentId }),
          ...(body.anonymous !== undefined && { anonymous: body.anonymous }),
          ...(body.oneTimeOnly !== undefined && { oneTimeOnly: body.oneTimeOnly }),
          ...(body.confidential !== undefined && { confidential: body.confidential }),
        },
      });

      await writeAudit({
        actorId: user.id,
        action: "FORM_UPDATED",
        entityType: "Form",
        entityId: params.id,
        before: {
          title: form.title,
          anonymous: form.anonymous,
          oneTimeOnly: form.oneTimeOnly,
          confidential: form.confidential,
        },
        after: body,
        tx,
      });

      return f;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
