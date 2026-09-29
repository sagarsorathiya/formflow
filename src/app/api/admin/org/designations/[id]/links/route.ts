import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  companyId: z.string().min(1),
  active: z.boolean(), // true = link, false = unlink
});

// PATCH /api/admin/org/designations/[id]/links
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
    }

    const { companyId, active } = parsed.data;

    const link = await prisma.companyDesignation.upsert({
      where: { companyId_designationId: { companyId, designationId: params.id } },
      update: { active },
      create: { companyId, designationId: params.id, active },
    });

    await writeAudit({
      actorId: user.id,
      action: active ? "DESIG_LINKED_TO_COMPANY" : "DESIG_UNLINKED_FROM_COMPANY",
      entityType: "CompanyDesignation",
      entityId: `${companyId}:${params.id}`,
      after: { companyId, designationId: params.id, active },
    });

    return NextResponse.json({ ok: true, data: link });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
