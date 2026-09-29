import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDeptAdminOrAbove, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { EMPTY_SCHEMA, EMPTY_WORKFLOW } from "@/lib/types/schema";
import { generateUniqueSlug } from "@/lib/form-slug";

const createFormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  departmentId: z.string().cuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireDeptAdminOrAbove();
    const body = createFormSchema.parse(await req.json());

    const form = await prisma.$transaction(async (tx) => {
      const slug = await generateUniqueSlug(body.title);

      const f = await tx.form.create({
        data: {
          title: body.title,
          slug,
          description: body.description ?? null,
          departmentId: body.departmentId ?? user.departmentId ?? null,
          companyId: user.companyId ?? null,
          status: "DRAFT",
          createdById: user.id,
        },
      });

      // Create initial draft version
      const version = await tx.formVersion.create({
        data: {
          formId: f.id,
          version: 1,
          schemaJson: EMPTY_SCHEMA as object,
          workflowJson: EMPTY_WORKFLOW as object,
        },
      });

      const updated = await tx.form.update({
        where: { id: f.id },
        data: { currentVersionId: version.id },
      });

      await writeAudit({
        actorId: user.id,
        action: "FORM_CREATED",
        entityType: "Form",
        entityId: f.id,
        after: { title: body.title },
        tx,
      });

      return { ...updated, currentVersion: version };
    });

    return NextResponse.json({ ok: true, data: form }, { status: 201 });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireDeptAdminOrAbove();
    const { searchParams } = new URL(req.url);
    const deptId = searchParams.get("departmentId");

    const where =
      user.role === "SUPER_ADMIN"
        ? deptId ? { departmentId: deptId } : {}
        : { departmentId: user.departmentId ?? "__none__" };

    const forms = await prisma.form.findMany({
      where,
      include: {
        department: { select: { name: true, code: true } },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: forms });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
