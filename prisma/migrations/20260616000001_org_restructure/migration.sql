-- Phase 16: Organization restructure
-- Departments become global (no companyId); linked to companies via CompanyDepartment.
-- New Designation table linked to companies via CompanyDesignation.
-- User gains profileComplete flag.

-- Step 0: Deduplicate departments by name.
-- For each group of departments sharing the same name, keep the one with the
-- smallest id and redirect all User/Form FK references to that canonical id.

CREATE TEMP TABLE _dept_dedup AS
SELECT
  id                                                        AS old_id,
  MIN(id) OVER (PARTITION BY LOWER(TRIM(name)))             AS canonical_id
FROM "Department";

UPDATE "User" u
SET "departmentId" = m.canonical_id
FROM _dept_dedup m
WHERE u."departmentId" = m.old_id AND m.old_id != m.canonical_id;

UPDATE "Form" f
SET "departmentId" = m.canonical_id
FROM _dept_dedup m
WHERE f."departmentId" = m.old_id AND m.old_id != m.canonical_id;

DELETE FROM "Department"
WHERE id IN (
  SELECT old_id FROM _dept_dedup WHERE old_id != canonical_id
);

DROP TABLE _dept_dedup;

-- Step 1: Create CompanyDepartment join table (before dropping companyId)
CREATE TABLE "CompanyDepartment" (
  "companyId"    TEXT    NOT NULL,
  "departmentId" TEXT    NOT NULL,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CompanyDepartment_pkey" PRIMARY KEY ("companyId", "departmentId")
);

-- Step 2: Seed join table — link every department to every company (default = all)
INSERT INTO "CompanyDepartment" ("companyId", "departmentId", "active")
SELECT c.id, d.id, true
FROM "Company" c
CROSS JOIN "Department" d
ON CONFLICT DO NOTHING;

-- Step 3: FK constraints for CompanyDepartment
ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: Remove companyId from Department
DROP INDEX IF EXISTS "Department_companyId_code_key";
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_companyId_fkey";
ALTER TABLE "Department" DROP COLUMN IF EXISTS "companyId";

-- Step 5: Create Designation table
CREATE TABLE "Designation" (
  "id"        TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "active"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Designation_name_key" ON "Designation"("name");

-- Step 6: Create CompanyDesignation join table
CREATE TABLE "CompanyDesignation" (
  "companyId"     TEXT    NOT NULL,
  "designationId" TEXT    NOT NULL,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CompanyDesignation_pkey" PRIMARY KEY ("companyId", "designationId")
);

ALTER TABLE "CompanyDesignation"
  ADD CONSTRAINT "CompanyDesignation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanyDesignation"
  ADD CONSTRAINT "CompanyDesignation_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 7: Add profileComplete to User (default false; seed will set to true for known users)
ALTER TABLE "User" ADD COLUMN "profileComplete" BOOLEAN NOT NULL DEFAULT false;
