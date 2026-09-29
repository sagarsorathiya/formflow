import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

// departmentId is intentionally absent: the user's department is owned solely by
// PATCH /api/admin/users/[id]/org, which validates the company/department link and
// enforces "Company Head has no department". Accepting it here let the Role & Status
// form overwrite a just-saved Organisation Profile with its stale page-load value.
const schema = z.object({
  role: z.enum(["USER", "DEPT_ADMIN", "SUPER_ADMIN"]),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSuperAdmin();
    const body = schema.parse(await req.json());

    const before = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true, active: true },
    });
    if (!before) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: params.id },
        data: {
          role: body.role,
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
      await writeAudit({
        actorId: actor.id,
        action: "USER_ROLE_CHANGED",
        entityType: "User",
        entityId: params.id,
        before: { role: before.role, active: before.active },
        after: { role: body.role, active: body.active },
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
