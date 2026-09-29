/**
 * One-off cleanup: delete all companies, departments, and designations.
 * Forms are preserved — their departmentId/companyId are nulled out.
 * Run: npx tsx scripts/cleanup-org.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1. Join tables first (FK references companies/departments/designations)
    const cd = await tx.companyDesignation.deleteMany({});
    console.log(`Deleted ${cd.count} CompanyDesignation link(s).`);

    const cdept = await tx.companyDepartment.deleteMany({});
    console.log(`Deleted ${cdept.count} CompanyDepartment link(s).`);

    // 2. Null out FK refs on Forms (departmentId and companyId are nullable)
    const forms = await tx.form.updateMany({
      data: { departmentId: null, companyId: null },
    });
    console.log(`Cleared departmentId/companyId on ${forms.count} form(s).`);

    // 3. Delete leaf entities
    const desigs = await tx.designation.deleteMany({});
    console.log(`Deleted ${desigs.count} designation(s).`);

    const depts = await tx.department.deleteMany({});
    console.log(`Deleted ${depts.count} department(s).`);

    const companies = await tx.company.deleteMany({});
    console.log(`Deleted ${companies.count} company(s).`);
  });

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
