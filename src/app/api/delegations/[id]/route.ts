import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const delegation = await prisma.delegation.findUnique({
      where: { id: params.id },
    });

    if (!delegation) throw new AppError("NOT_FOUND", 404, "Delegation not found.");
    if (delegation.delegatorId !== user.id) {
      throw new AppError("FORBIDDEN", 403, "You can only remove your own delegations.");
    }

    await prisma.delegation.update({
      where: { id: params.id },
      data: { active: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
