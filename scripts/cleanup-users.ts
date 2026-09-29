/**
 * One-off cleanup: delete all non-SUPER_ADMIN users + clear org fields on superadmin.
 * Run: npx tsx scripts/cleanup-users.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Find all non-superadmin users ────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" } },
    select: { id: true, displayName: true, samAccountName: true },
  });

  console.log(`Found ${users.length} non-superadmin user(s) to delete.`);

  for (const u of users) {
    console.log(`  Deleting: ${u.displayName} (@${u.samAccountName})`);

    await prisma.$transaction(async (tx) => {
      // Delete notifications
      await tx.notification.deleteMany({ where: { userId: u.id } });

      // Delete delegations (as delegator or delegate)
      await tx.delegation.deleteMany({
        where: { OR: [{ delegatorId: u.id }, { delegateId: u.id }] },
      });

      // Nullify acted-by on workflow tasks
      await tx.workflowTask.updateMany({ where: { actedById: u.id }, data: { actedById: null } });

      // Nullify audit log actor references
      await tx.auditLog.updateMany({ where: { actorId: u.id }, data: { actorId: null } });

      // Get all submissions by this user
      const submissions = await tx.submission.findMany({
        where: { submittedById: u.id },
        select: { id: true },
      });
      const submissionIds = submissions.map((s) => s.id);

      if (submissionIds.length > 0) {
        // Delete workflow tasks on those submissions
        await tx.workflowTask.deleteMany({ where: { submissionId: { in: submissionIds } } });

        // Delete submission files
        await tx.submissionFile.deleteMany({ where: { submissionId: { in: submissionIds } } });

        // Delete submissions
        await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
      }

      // Finally delete the user
      await tx.user.delete({ where: { id: u.id } });
    });
  }

  // ── 2. Clear org fields on superadmin(s) ────────────────────────────────────
  const updated = await prisma.user.updateMany({
    where: { role: "SUPER_ADMIN" },
    data: {
      companyId: null,
      departmentId: null,
      designation: null,
    },
  });

  console.log(`\nCleared org fields on ${updated.count} superadmin account(s).`);
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
