import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// GET /api/orgs/departments?companyId=xxx
// Returns departments linked (active) to the given company.
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const companyId = req.nextUrl.searchParams.get("companyId");

    if (!companyId) {
      const departments = await prisma.department.findMany({
        where: { active: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ ok: true, data: departments });
    }

    const links = await prisma.companyDepartment.findMany({
      where: { companyId, active: true, department: { active: true } },
      include: { department: { select: { id: true, code: true, name: true } } },
      orderBy: { department: { name: "asc" } },
    });

    const departments = links.map((l) => l.department);
    return NextResponse.json({ ok: true, data: departments });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
