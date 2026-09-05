-- AlterTable
ALTER TABLE "LinkClick" ADD COLUMN     "contactId" TEXT;

-- CreateIndex
CREATE INDEX "LinkClick_contactId_idx" ON "LinkClick"("contactId");

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
