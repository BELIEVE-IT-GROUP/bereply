-- BeFeed: tableros de MAAS2, asignación de piezas, generación de semanas y versión de los skills.
ALTER TABLE "InstagramAccount" ADD COLUMN "maas2ProjectId" TEXT;
ALTER TABLE "FeedWeek" ADD COLUMN "maasBoardId" TEXT;
ALTER TABLE "FeedPiece"
  ADD COLUMN "producedBy" TEXT,
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "assigneeName" TEXT,
  ADD COLUMN "maasAssetId" TEXT,
  ADD COLUMN "maasStage" TEXT,
  ADD COLUMN "maasSyncedAt" TIMESTAMP(3);

CREATE TABLE "FeedPieceComment" (
  "id" TEXT NOT NULL,
  "pieceId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedPieceComment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedPieceComment_externalId_key" ON "FeedPieceComment"("externalId");
CREATE INDEX "FeedPieceComment_pieceId_createdAt_idx" ON "FeedPieceComment"("pieceId", "createdAt");
ALTER TABLE "FeedPieceComment" ADD CONSTRAINT "FeedPieceComment_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "FeedPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedWeekRequest" (
  "id" TEXT NOT NULL,
  "instagramAccountId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "measurableAction" TEXT NOT NULL,
  "rawMaterial" TEXT,
  "requestedBy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EN_COLA',
  "log" TEXT,
  "weekId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedWeekRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedWeekRequest_status_createdAt_idx" ON "FeedWeekRequest"("status", "createdAt");
ALTER TABLE "FeedWeekRequest" ADD CONSTRAINT "FeedWeekRequest_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedSkillVersion" (
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "sha" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedSkillVersion_pkey" PRIMARY KEY ("name")
);
