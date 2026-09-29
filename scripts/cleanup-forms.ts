/**
 * One-off cleanup: delete all forms except "I-Card Data Collection".
 * Run: npx tsx scripts/cleanup-forms.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEEP_TITLES = ["I-Card Data Collection"];

async function main() {
  const toDelete = await prisma.form.findMany({
    where: { title: { notIn: KEEP_TITLES } },
    select: { id: true, title: true },
  });

  console.log(`Deleting ${toDelete.length} form(s):`);
  toDelete.forEach((f) => console.log(`  - ${f.title}`));

  const ids = toDelete.map((f) => f.id);
  if (ids.length === 0) { console.log("Nothing to delete."); return; }

  await prisma.$transaction(async (tx) => {
    // Find all versions of these forms
    const versions = await tx.formVersion.findMany({
      where: { formId: { in: ids } },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    // Cascade: workflow tasks → submission files → submissions → form versions → audience → form
    if (versionIds.length > 0) {
      const submissions = await tx.submission.findMany({
        where: { formVersionId: { in: versionIds } },
        select: { id: true },
      });
      const subIds = submissions.map((s) => s.id);

      if (subIds.length > 0) {
        await tx.workflowTask.deleteMany({ where: { submissionId: { in: subIds } } });
        await tx.submissionFile.deleteMany({ where: { submissionId: { in: subIds } } });
        await tx.submission.deleteMany({ where: { id: { in: subIds } } });
      }

      await tx.formVersion.deleteMany({ where: { id: { in: versionIds } } });
    }

    await tx.formAudience.deleteMany({ where: { formId: { in: ids } } });
    await tx.form.deleteMany({ where: { id: { in: ids } } });
  });

  const kept = await prisma.form.findMany({ select: { title: true } });
  console.log(`\nKept ${kept.length} form(s): ${kept.map((f) => f.title).join(", ")}`);
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
