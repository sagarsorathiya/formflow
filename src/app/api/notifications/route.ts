import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    ]);

    return NextResponse.json({ ok: true, data: { notifications, unreadCount } });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

// Mark all as read
export async function PATCH() {
  try {
    const user = await requireUser();

    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
