import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  try {
    const actor = await requireSuperAdmin();

    const assignment = await prisma.userOrgAssignment.findUnique({ where: { id: params.assignmentId } });
    if (!assignment || assignment.userId !== params.id) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Mapping not found." } }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userOrgAssignment.delete({ where: { id: params.assignmentId } });
      await writeAudit({
        actorId: actor.id,
        action: "USER_ORG_ASSIGNMENT_REMOVED",
        entityType: "User",
        entityId: params.id,
        before: { companyId: assignment.companyId, departmentId: assignment.departmentId, designation: assignment.designation },
        tx,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
