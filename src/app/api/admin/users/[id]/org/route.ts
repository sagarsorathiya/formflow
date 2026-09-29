import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

const orgSchema = z.object({
  companyId: z.string().min(1),
  departmentId: z.string().min(1).nullable(),
  designation: z.string().min(1),
});

// PATCH /api/admin/users/[id]/org — SUPER_ADMIN edits another user's company/department/
// designation directly. Mirrors the validation in POST /api/profile/setup (company active,
// department linked+active to company unless the designation is Company Head, designation
// linked+active to company) but updates an arbitrary target user instead of the caller.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSuperAdmin();
    const body = orgSchema.parse(await req.json());
    let { departmentId } = body;
    const { companyId, designation } = body;

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { companyId: true, departmentId: true, designation: true },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { active: true } });
    if (!company?.active) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_COMPANY", message: "Selected company is not available." } }, { status: 400 });
    }

    const designationRecord = await prisma.designation.findUnique({
      where: { name: designation },
      select: { id: true, active: true, isCompanyHead: true },
    });
    if (!designationRecord?.active) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_DESIGNATION", message: "Selected designation is not available." } }, { status: 400 });
    }
    const desigLink = await prisma.companyDesignation.findUnique({
      where: { companyId_designationId: { companyId, designationId: designationRecord.id } },
      select: { active: true },
    });
    if (!desigLink?.active) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_DESIGNATION", message: "Selected designation is not available for this company." } }, { status: 400 });
    }

    if (designationRecord.isCompanyHead) {
      departmentId = null;
    } else {
      if (!departmentId) {
        return NextResponse.json({ ok: false, error: { code: "INVALID_DEPARTMENT", message: "Department is required for this designation." } }, { status: 400 });
      }
      const deptLink = await prisma.companyDepartment.findUnique({
        where: { companyId_departmentId: { companyId, departmentId } },
        select: { active: true, department: { select: { active: true } } },
      });
      if (!deptLink?.active || !deptLink.department.active) {
        return NextResponse.json({ ok: false, error: { code: "INVALID_DEPARTMENT", message: "Selected department is not available for this company." } }, { status: 400 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: params.id },
        data: { companyId, departmentId, designation },
        select: { id: true, companyId: true, departmentId: true, designation: true },
      });
      await writeAudit({
        actorId: actor.id,
        action: "USER_ORG_UPDATED_BY_ADMIN",
        entityType: "User",
        entityId: params.id,
        before: { companyId: target.companyId, departmentId: target.departmentId, designation: target.designation },
        after: { companyId, departmentId, designation },
        tx,
      });
      return user;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
