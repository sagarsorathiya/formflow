import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRole("SUPER_ADMIN");

    if (actor.id === params.id) {
      return NextResponse.json(
        { ok: false, error: { code: "SELF_DELETE", message: "You cannot delete your own account." } },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, displayName: true, role: true, _count: { select: { submissions: true } } },
    });
    if (!target) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "User not found." } },
        { status: 404 }
      );
    }

    if (target._count.submissions > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "HAS_SUBMISSIONS",
            message: `Cannot delete — this user has ${target._count.submissions} submission(s). Deactivate the account instead.`,
          },
        },
        { status: 409 }
      );
    }

    // Guard: cannot remove the last SUPER_ADMIN
    if (target.role === "SUPER_ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { ok: false, error: { code: "LAST_ADMIN", message: "Cannot delete the last Super Admin account." } },
          { status: 409 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // Write audit log BEFORE deleting so actorId is still valid
      await writeAudit({
        actorId: actor.id,
        action: "USER_DELETED",
        entityType: "User",
        entityId: params.id,
        before: { displayName: target.displayName, role: target.role },
        tx,
      });

      // Nullify audit log actor references (keep records, just detach actor)
      await tx.auditLog.updateMany({ where: { actorId: params.id }, data: { actorId: null } });

      // Nullify acted-by on workflow tasks
      await tx.workflowTask.updateMany({ where: { actedById: params.id }, data: { actedById: null } });

      // Remove own-data: notifications, delegations
      await tx.notification.deleteMany({ where: { userId: params.id } });
      await tx.delegation.deleteMany({
        where: { OR: [{ delegatorId: params.id }, { delegateId: params.id }] },
      });

      await tx.user.delete({ where: { id: params.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
