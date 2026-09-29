import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
    const search = url.searchParams.get("q")?.trim();

    const users = await prisma.user.findMany({
      where: {
        active: true,
        ...(search
          ? {
              OR: [
                { displayName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { samAccountName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        designation: true,
        department: { select: { name: true } },
      },
      orderBy: { displayName: "asc" },
      take: limit,
    });

    return NextResponse.json({ ok: true, data: users });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
