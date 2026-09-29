import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  companyId: z.string().min(1),
  active: z.boolean(), // true = link, false = unlink
});

// PATCH /api/admin/org/departments/[id]/links
// Toggles whether a department is linked (active) for a specific company.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
    }

    const { companyId, active } = parsed.data;

    const link = await prisma.companyDepartment.upsert({
      where: { companyId_departmentId: { companyId, departmentId: params.id } },
      update: { active },
      create: { companyId, departmentId: params.id, active },
    });

    await writeAudit({
      actorId: user.id,
      action: active ? "DEPT_LINKED_TO_COMPANY" : "DEPT_UNLINKED_FROM_COMPANY",
      entityType: "CompanyDepartment",
      entityId: `${companyId}:${params.id}`,
      after: { companyId, departmentId: params.id, active },
    });

    return NextResponse.json({ ok: true, data: link });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
