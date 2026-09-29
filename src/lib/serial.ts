/**
 * Serial number generation.
 * Uses SELECT ... FOR UPDATE on the Counter row to ensure uniqueness under concurrency.
 * Must always be called inside a prisma.$transaction.
 */

import type { Prisma } from "@prisma/client";

export async function nextSerial(
  tx: Prisma.TransactionClient,
  deptCode: string,
  year?: number
): Promise<string> {
  const y = year ?? new Date().getFullYear();
  const scopeKey = `${deptCode.toUpperCase()}-${y}`;

  // Row-lock the counter for this scope
  const result = await tx.$queryRaw<{ last_serial: number }[]>`
    INSERT INTO "Counter" ("scopeKey", "lastSerial", "updatedAt")
    VALUES (${scopeKey}, 1, NOW())
    ON CONFLICT ("scopeKey")
    DO UPDATE SET "lastSerial" = "Counter"."lastSerial" + 1, "updatedAt" = NOW()
    RETURNING "lastSerial" as last_serial
  `;

  const serial = result[0]?.last_serial ?? 1;
  return `${deptCode.toUpperCase()}-${y}-${String(serial).padStart(5, "0")}`;
}
