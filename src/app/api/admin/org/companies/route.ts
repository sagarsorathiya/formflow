import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1).max(100),
});

export async function GET() {
  try {
    const user = await requireRole("SUPER_ADMIN");
    void user;
    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
        departments: { where: { active: true }, select: { departmentId: true } },
        designations: { where: { active: true }, select: { designationId: true } },
      },
    });
    return NextResponse.json({ ok: true, data: companies });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
    }

    const { code, name } = parsed.data;

    const existing = await prisma.company.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ ok: false, error: { code: "DUPLICATE", message: `Company code "${code}" already exists.` } }, { status: 409 });
    }

    // Create company and auto-link all existing active departments and designations
    const company = await prisma.$transaction(async (tx) => {
      const co = await tx.company.create({ data: { code, name, active: true } });

      const [allDepts, allDesigs] = await Promise.all([
        tx.department.findMany({ where: { active: true }, select: { id: true } }),
        tx.designation.findMany({ where: { active: true }, select: { id: true } }),
      ]);

      if (allDepts.length > 0) {
        await tx.companyDepartment.createMany({
          data: allDepts.map((d) => ({ companyId: co.id, departmentId: d.id, active: true })),
          skipDuplicates: true,
        });
      }
      if (allDesigs.length > 0) {
        await tx.companyDesignation.createMany({
          data: allDesigs.map((d) => ({ companyId: co.id, designationId: d.id, active: true })),
          skipDuplicates: true,
        });
      }

      await writeAudit({ actorId: user.id, action: "COMPANY_CREATED", entityType: "Company", entityId: co.id, after: { code, name } });
      return co;
    });

    return NextResponse.json({ ok: true, data: company }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
