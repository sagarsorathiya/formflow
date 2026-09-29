import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { writeAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole("SUPER_ADMIN");
  } catch {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 });
  }

  const form = await prisma.form.findUnique({ where: { id: params.id } });
  if (!form) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Form not found" } }, { status: 404 });
  }
  if (form.status !== "ARCHIVED") {
    return NextResponse.json({ ok: false, error: { code: "BAD_REQUEST", message: "Form is not archived" } }, { status: 400 });
  }

  const restored = await prisma.$transaction(async (tx) => {
    const updated = await tx.form.update({
      where: { id: params.id },
      data: { status: "DRAFT" },
    });
    await writeAudit({
      actorId: actor.id,
      action: "FORM_RESTORED",
      entityType: "Form",
      entityId: params.id,
      before: { status: "ARCHIVED" },
      after: { status: "DRAFT" },
      tx,
    });
    return updated;
  });

  return NextResponse.json({ ok: true, data: { id: restored.id, status: restored.status } });
}
