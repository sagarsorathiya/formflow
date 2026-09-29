import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperAdmin();
    const mapping = await prisma.roleMapping.findUnique({ where: { id: params.id } });
    if (!mapping) throw new AppError("NOT_FOUND", 404, "Mapping not found.");
    await prisma.roleMapping.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
