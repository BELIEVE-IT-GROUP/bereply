-- AlterEnum
ALTER TYPE "DmStatus" ADD VALUE 'SKIPPED_ESCALATED';

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "aiConfig" JSONB,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "edges" JSONB,
ADD COLUMN     "nodes" JSONB;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "aiTokensThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ecommerceStoreSlug" TEXT,
ADD COLUMN     "ecommerceWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_instagramAccountId_igUserId_key" ON "Contact"("instagramAccountId", "igUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ecommerceStoreSlug_key" ON "Workspace"("ecommerceStoreSlug");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

