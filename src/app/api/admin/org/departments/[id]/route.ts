import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).toUpperCase().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
    }

    const before = await prisma.department.findUnique({ where: { id: params.id } });
    if (!before) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Department not found." } }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.department.update({ where: { id: params.id }, data: parsed.data });
      await writeAudit({ actorId: user.id, action: "DEPARTMENT_UPDATED", entityType: "Department", entityId: params.id, before, after: parsed.data });
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

    const dept = await prisma.department.findUnique({
      where: { id: params.id },
      include: { _count: { select: { users: true, forms: true } } },
    });
    if (!dept) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Department not found." } }, { status: 404 });
    }
    if (dept._count.users > 0) {
      return NextResponse.json(
        { ok: false, error: { code: "HAS_USERS", message: `Cannot delete — ${dept._count.users} user(s) are assigned to this department.` } },
        { status: 409 }
      );
    }
    if (dept._count.forms > 0) {
      return NextResponse.json(
        { ok: false, error: { code: "HAS_FORMS", message: `Cannot delete — ${dept._count.forms} form(s) belong to this department.` } },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyDepartment.deleteMany({ where: { departmentId: params.id } });
      await tx.department.delete({ where: { id: params.id } });
      await writeAudit({ actorId: user.id, action: "DEPARTMENT_DELETED", entityType: "Department", entityId: params.id, before: dept });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
