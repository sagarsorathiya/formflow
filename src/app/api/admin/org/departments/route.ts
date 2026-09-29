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
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        companies: {
          include: { company: { select: { id: true, code: true, name: true } } },
        },
        _count: { select: { users: true, forms: true } },
      },
    });
    return NextResponse.json({ ok: true, data: departments });
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

    const dept = await prisma.$transaction(async (tx) => {
      const d = await tx.department.create({ data: { code, name, active: true } });

      // Auto-link to all active companies
      const allCompanies = await tx.company.findMany({ where: { active: true }, select: { id: true } });
      if (allCompanies.length > 0) {
        await tx.companyDepartment.createMany({
          data: allCompanies.map((co) => ({ companyId: co.id, departmentId: d.id, active: true })),
          skipDuplicates: true,
        });
      }

      await writeAudit({ actorId: user.id, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: d.id, after: { code, name } });
      return d;
    });

    return NextResponse.json({ ok: true, data: dept }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
