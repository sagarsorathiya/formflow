import { NextRequest, NextResponse } from "next/server";
import { requireRole, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET() {
  try {
    const user = await requireRole("SUPER_ADMIN");
    void user;
    const designations = await prisma.designation.findMany({
      orderBy: { name: "asc" },
      include: {
        companies: {
          include: { company: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    return NextResponse.json({ ok: true, data: designations });
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

    const { name } = parsed.data;

    const existing = await prisma.designation.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ ok: false, error: { code: "DUPLICATE", message: `Designation "${name}" already exists.` } }, { status: 409 });
    }

    const desig = await prisma.$transaction(async (tx) => {
      const d = await tx.designation.create({ data: { name, active: true } });

      // Auto-link to all active companies
      const allCompanies = await tx.company.findMany({ where: { active: true }, select: { id: true } });
      if (allCompanies.length > 0) {
        await tx.companyDesignation.createMany({
          data: allCompanies.map((co) => ({ companyId: co.id, designationId: d.id, active: true })),
          skipDuplicates: true,
        });
      }

      await writeAudit({ actorId: user.id, action: "DESIGNATION_CREATED", entityType: "Designation", entityId: d.id, after: { name } });
      return d;
    });

    return NextResponse.json({ ok: true, data: desig }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
