import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
  isCompanyHead: z.boolean().optional(),
  isDepartmentHead: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
    }

    const before = await prisma.designation.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Designation not found." } }, { status: 404 });
    }

    if (parsed.data.name && parsed.data.name !== before.name) {
      const dup = await prisma.designation.findUnique({ where: { name: parsed.data.name } });
      if (dup) {
        return NextResponse.json({ ok: false, error: { code: "DUPLICATE", message: `Designation "${parsed.data.name}" already exists.` } }, { status: 409 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.designation.update({ where: { id: params.id }, data: parsed.data });
      await writeAudit({ actorId: user.id, action: "DESIGNATION_UPDATED", entityType: "Designation", entityId: params.id, before, after: parsed.data });
      return d;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("SUPER_ADMIN");

    const desig = await prisma.designation.findUnique({ where: { id: params.id } });
    if (!desig) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Designation not found." } }, { status: 404 });
    }

    // Check if any users currently have this designation string
    const userCount = await prisma.user.count({ where: { designation: desig.name } });
    if (userCount > 0) {
      return NextResponse.json(
        { ok: false, error: { code: "HAS_USERS", message: `Cannot delete — ${userCount} user(s) currently hold this designation.` } },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyDesignation.deleteMany({ where: { designationId: params.id } });
      await tx.designation.delete({ where: { id: params.id } });
      await writeAudit({ actorId: user.id, action: "DESIGNATION_DELETED", entityType: "Designation", entityId: params.id, before: desig });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
