import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const audienceSchema = z.object({
  companies: z.array(z.string()).default([]),
  departments: z.array(z.string()).default([]),
  designations: z.array(z.string()).default([]),
  adGroups: z.array(z.string()).default([]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();

    const form = await prisma.form.findUnique({
      where: { id: params.id },
      include: { audience: true },
    });
    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "Not authorized.");

    return NextResponse.json({
      ok: true,
      data: form.audience ?? {
        companies: [],
        departments: [],
        designations: [],
        adGroups: [],
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();
    const body = audienceSchema.parse(await req.json());

    const form = await prisma.form.findUnique({ where: { id: params.id } });
    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "Not authorized.");

    const audience = await prisma.formAudience.upsert({
      where: { formId: params.id },
      create: { formId: params.id, ...body },
      update: body,
    });

    return NextResponse.json({ ok: true, data: audience });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
