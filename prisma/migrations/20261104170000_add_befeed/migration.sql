-- CreateEnum
CREATE TYPE "FeedStage" AS ENUM ('GUION', 'FILTROS', 'CLIENTE', 'VIDEO', 'LISTA', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "FeedFormat" AS ENUM ('REEL', 'CARRUSEL', 'HISTORIAS', 'POST');

-- CreateEnum
CREATE TYPE "FeedJobStatus" AS ENUM ('EN_COLA', 'CORRIENDO', 'ESPERA_REVISION', 'LISTO', 'FALLO');

-- CreateTable
CREATE TABLE "FeedWeek" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "theme" TEXT NOT NULL,
    "measurableAction" TEXT NOT NULL,
    "baseline" TEXT,
    "loopSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPiece" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "publishOn" DATE NOT NULL,
    "format" "FeedFormat" NOT NULL,
    "drip" TEXT,
    "title" TEXT NOT NULL,
    "firstThree" TEXT,
    "hooks" JSONB NOT NULL DEFAULT '[]',
    "script" JSONB NOT NULL DEFAULT '[]',
    "caption" TEXT,
    "stories" TEXT,
    "measures" TEXT,
    "needsVideo" BOOLEAN NOT NULL DEFAULT false,
    "linterClean" BOOLEAN NOT NULL DEFAULT false,
    "stage" "FeedStage" NOT NULL DEFAULT 'GUION',
    "gatesPassed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedBy" TEXT,
    "blockedReason" TEXT,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "instagramMediaId" TEXT,
    "repeatDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pieceId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'ok',
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedMediaMetric" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "instagramMediaId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "reach" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "avgWatchMs" INTEGER,
    "skipRate" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedMediaMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedBrandProfile" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "clashes" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedBrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedWeekClosing" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "value" TEXT,
    "repeat" TEXT,
    "drop" TEXT,
    "pending" TEXT,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedWeekClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedReference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedAgentToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedAgentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedReelJob" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "ficha" JSONB NOT NULL DEFAULT '{}',
    "step" TEXT NOT NULL DEFAULT 'voz',
    "status" "FeedJobStatus" NOT NULL DEFAULT 'EN_COLA',
    "log" TEXT,
    "costUsd" DOUBLE PRECISION,
    "audio" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedReelJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedWeek_workspaceId_idx" ON "FeedWeek"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedWeek_instagramAccountId_startsOn_key" ON "FeedWeek"("instagramAccountId", "startsOn");

-- CreateIndex
CREATE INDEX "FeedPiece_weekId_position_idx" ON "FeedPiece"("weekId", "position");

-- CreateIndex
CREATE INDEX "FeedEvent_workspaceId_createdAt_idx" ON "FeedEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedEvent_pieceId_createdAt_idx" ON "FeedEvent"("pieceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedMediaMetric_instagramMediaId_key" ON "FeedMediaMetric"("instagramMediaId");

-- CreateIndex
CREATE INDEX "FeedMediaMetric_instagramAccountId_publishedAt_idx" ON "FeedMediaMetric"("instagramAccountId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedBrandProfile_instagramAccountId_key" ON "FeedBrandProfile"("instagramAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedWeekClosing_weekId_key" ON "FeedWeekClosing"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReference_instagramAccountId_username_key" ON "FeedReference"("instagramAccountId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "FeedAgentToken_tokenHash_key" ON "FeedAgentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "FeedAgentToken_workspaceId_idx" ON "FeedAgentToken"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReelJob_pieceId_key" ON "FeedReelJob"("pieceId");

-- AddForeignKey
ALTER TABLE "FeedWeek" ADD CONSTRAINT "FeedWeek_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedWeek" ADD CONSTRAINT "FeedWeek_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPiece" ADD CONSTRAINT "FeedPiece_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "FeedWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedEvent" ADD CONSTRAINT "FeedEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedEvent" ADD CONSTRAINT "FeedEvent_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "FeedPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMediaMetric" ADD CONSTRAINT "FeedMediaMetric_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBrandProfile" ADD CONSTRAINT "FeedBrandProfile_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedWeekClosing" ADD CONSTRAINT "FeedWeekClosing_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "FeedWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReference" ADD CONSTRAINT "FeedReference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReference" ADD CONSTRAINT "FeedReference_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAgentToken" ADD CONSTRAINT "FeedAgentToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReelJob" ADD CONSTRAINT "FeedReelJob_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "FeedPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

