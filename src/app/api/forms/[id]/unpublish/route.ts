import { NextRequest, NextResponse } from "next/server";
import { requireDeptAdminOrAbove, canManageForm, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireDeptAdminOrAbove();

    const form = await prisma.form.findUnique({ where: { id: params.id } });
    if (!form) throw new AppError("NOT_FOUND", 404, "Form not found.");

    const allowed = await canManageForm(user.id, user.role, form);
    if (!allowed) throw new AppError("FORBIDDEN", 403, "Not authorized.");

    if (form.status !== "PUBLISHED") {
      throw new AppError("BAD_REQUEST", 400, "Form is not currently published.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: params.id },
        data: { status: "DRAFT" },
      });
      await writeAudit({
        actorId: user.id,
        action: "FORM_UNPUBLISHED",
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
