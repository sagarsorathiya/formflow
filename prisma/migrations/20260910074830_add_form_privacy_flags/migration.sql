-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oneTimeOnly" BOOLEAN NOT NULL DEFAULT false;
