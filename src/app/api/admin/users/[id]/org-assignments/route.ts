import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

// Additional company/department/designation mappings a user can hold beyond their single
// active companyId/departmentId/designation on User — reference/reporting metadata only,
// not wired into audience visibility, submissions, or workflow resolution.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin();
    const assignments = await prisma.userOrgAssignment.findMany({
      where: { userId: params.id },
      include: { company: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, data: assignments });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

const createSchema = z.object({
  companyId: z.string().min(1),
  departmentId: z.string().min(1).nullable().optional(),
  designation: z.string().min(1).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireSuperAdmin();
    const body = createSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
    }
    const company = await prisma.company.findUnique({ where: { id: body.companyId }, select: { active: true } });
    if (!company?.active) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_COMPANY", message: "Selected company is not available." } }, { status: 400 });
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.userOrgAssignment.create({
        data: {
          userId: params.id,
          companyId: body.companyId,
          departmentId: body.departmentId ?? null,
          designation: body.designation ?? null,
          note: body.note ?? null,
          createdById: actor.id,
        },
        include: { company: { select: { id: true, code: true, name: true } } },
      });
      await writeAudit({
        actorId: actor.id,
        action: "USER_ORG_ASSIGNMENT_ADDED",
        entityType: "User",
        entityId: params.id,
        after: { companyId: body.companyId, departmentId: body.departmentId, designation: body.designation },
        tx,
      });
      return created;
    });

    return NextResponse.json({ ok: true, data: assignment }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
