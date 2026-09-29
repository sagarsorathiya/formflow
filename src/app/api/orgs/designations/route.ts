import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// GET /api/orgs/designations?companyId=xxx
// Returns designations linked (active) to the given company.
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const companyId = req.nextUrl.searchParams.get("companyId");

    if (!companyId) {
      const designations = await prisma.designation.findMany({
        where: { active: true },
        select: { id: true, name: true, isCompanyHead: true, isDepartmentHead: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ ok: true, data: designations });
    }

    const links = await prisma.companyDesignation.findMany({
      where: { companyId, active: true, designation: { active: true } },
      include: { designation: { select: { id: true, name: true, isCompanyHead: true, isDepartmentHead: true } } },
      orderBy: { designation: { name: "asc" } },
    });

    const designations = links.map((l) => l.designation);
    return NextResponse.json({ ok: true, data: designations });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
