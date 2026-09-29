import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const createDelegationSchema = z.object({
  delegateId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function GET() {
  try {
    const user = await requireUser();

    const delegations = await prisma.delegation.findMany({
      where: { delegatorId: user.id, active: true },
      include: {
        delegate: { select: { id: true, displayName: true, email: true, designation: true } },
      },
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json({ ok: true, data: delegations });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = createDelegationSchema.parse(await req.json());

    if (body.delegateId === user.id) {
      throw new AppError("INVALID_DELEGATE", 400, "You cannot delegate to yourself.");
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (endDate <= startDate) {
      throw new AppError("INVALID_DATES", 400, "End date must be after start date.");
    }

    const delegate = await prisma.user.findUnique({
      where: { id: body.delegateId, active: true },
      select: { id: true },
    });
    if (!delegate) throw new AppError("NOT_FOUND", 404, "Delegate user not found.");

    // Deactivate any overlapping delegations
    await prisma.delegation.updateMany({
      where: {
        delegatorId: user.id,
        active: true,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      data: { active: false },
    });

    const delegation = await prisma.delegation.create({
      data: {
        delegatorId: user.id,
        delegateId: body.delegateId,
        startDate,
        endDate,
        active: true,
      },
      include: {
        delegate: { select: { id: true, displayName: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, data: delegation });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
