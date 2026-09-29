import { NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// Returns companies + all departments (for audience panel in builder)
export async function GET() {
  try {
    await requireUser();

    const [companies, departments] = await Promise.all([
      prisma.company.findMany({
        where: { active: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({
        where: { active: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({ ok: true, data: { companies, departments } });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
