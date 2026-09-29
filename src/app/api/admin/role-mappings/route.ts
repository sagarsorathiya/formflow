import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  adGroup: z.string().min(1).max(200),
  appRole: z.enum(["USER", "DEPT_ADMIN", "SUPER_ADMIN"]),
  deptAdminOf: z.string().nullable().optional(),
});

export async function GET() {
  try {
    await requireSuperAdmin();
    const mappings = await prisma.roleMapping.findMany({ orderBy: { adGroup: "asc" } });
    return NextResponse.json({ ok: true, data: mappings });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = schema.parse(await req.json());

    const existing = await prisma.roleMapping.findUnique({ where: { adGroup: body.adGroup } });
    if (existing) throw new AppError("DUPLICATE", 409, `Mapping for "${body.adGroup}" already exists.`);

    const mapping = await prisma.roleMapping.create({
      data: { adGroup: body.adGroup, appRole: body.appRole, deptAdminOf: body.deptAdminOf ?? null },
    });

    return NextResponse.json({ ok: true, data: mapping }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
