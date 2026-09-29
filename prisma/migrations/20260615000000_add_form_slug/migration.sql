-- AddColumn: Form.slug (nullable, unique)
ALTER TABLE "Form" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");
