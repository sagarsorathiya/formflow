import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

interface AuditParams {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  tx?: Prisma.TransactionClient;
}

/**
 * Write an append-only audit log entry.
 * Pass `tx` when calling inside a prisma.$transaction to ensure atomicity.
 * Never throw on audit failure — log the error but don't break the main flow.
 */
export async function writeAudit(params: AuditParams): Promise<void> {
  const db = params.tx ?? prisma;
  try {
    await db.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeJson: params.before !== undefined ? (params.before as Prisma.InputJsonValue) : undefined,
        afterJson: params.after !== undefined ? (params.after as Prisma.InputJsonValue) : undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit failure must never break the business operation
    console.error("[audit] Failed to write audit log:", err);
  }
}
