import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
  } catch {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
  }

  const forms = await prisma.form.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { updatedAt: "desc" },
    include: {
      department: { select: { name: true, code: true } },
    },
  });

  return NextResponse.json({ ok: true, data: forms });
}
