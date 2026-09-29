-- AlterTable
ALTER TABLE "Designation" ADD COLUMN     "isCompanyHead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDepartmentHead" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserOrgAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "designation" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "UserOrgAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserOrgAssignment_userId_idx" ON "UserOrgAssignment"("userId");

-- AddForeignKey
ALTER TABLE "UserOrgAssignment" ADD CONSTRAINT "UserOrgAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrgAssignment" ADD CONSTRAINT "UserOrgAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
