import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const setupSchema = z.object({
  companyId: z.string().min(1),
  departmentId: z.string().min(1).nullable(),
  designation: z.string().min(1),
});

// POST /api/profile/setup
// Used both for first-time onboarding (sets profileComplete=true) and
// for subsequent updates from Settings. Validates that department and
// designation are linked (active) to the selected company.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Invalid input.", details: parsed.error.flatten() } },
        { status: 400 }
      );
    }

    const { companyId, designation } = parsed.data;
    let departmentId = parsed.data.departmentId;

    // Validate company exists and is active
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, active: true },
    });
    if (!company?.active) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_COMPANY", message: "Selected company is not available." } },
        { status: 400 }
      );
    }

    // Validate designation is linked to this company
    const designationRecord = await prisma.designation.findUnique({
      where: { name: designation },
      select: { id: true, active: true, isCompanyHead: true },
    });
    if (!designationRecord?.active) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DESIGNATION", message: "Selected designation is not available." } },
        { status: 400 }
      );
    }
    const desigLink = await prisma.companyDesignation.findUnique({
      where: { companyId_designationId: { companyId, designationId: designationRecord.id } },
      select: { active: true },
    });
    if (!desigLink?.active) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DESIGNATION", message: "Selected designation is not available for this company." } },
        { status: 400 }
      );
    }

    // Company Head designations have no single department — skip department validation entirely.
    if (designationRecord.isCompanyHead) {
      departmentId = null;
    } else {
      if (!departmentId) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_DEPARTMENT", message: "Department is required for this designation." } },
          { status: 400 }
        );
      }
      const deptLink = await prisma.companyDepartment.findUnique({
        where: { companyId_departmentId: { companyId, departmentId } },
        select: { active: true, department: { select: { active: true } } },
      });
      if (!deptLink?.active || !deptLink.department.active) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_DEPARTMENT", message: "Selected department is not available for this company." } },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { companyId: true, departmentId: true, designation: true, profileComplete: true } });

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { companyId, departmentId, designation, profileComplete: true },
        select: { id: true, companyId: true, departmentId: true, designation: true, profileComplete: true },
      });

      await writeAudit({
        actorId: user.id,
        action: existing?.profileComplete === false ? "USER_PROFILE_SETUP" : "USER_PROFILE_UPDATED",
        entityType: "User",
        entityId: user.id,
        before: { companyId: existing?.companyId, departmentId: existing?.departmentId, designation: existing?.designation },
        after: { companyId, departmentId, designation },
      });

      return u;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
