import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
    });

    if (!notification) throw new AppError("NOT_FOUND", 404, "Notification not found.");
    if (notification.userId !== user.id) {
      throw new AppError("FORBIDDEN", 403, "Not your notification.");
    }

    await prisma.notification.update({
      where: { id: params.id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
