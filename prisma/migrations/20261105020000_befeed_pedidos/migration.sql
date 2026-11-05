-- BeFeed: pedidos de piezas que hace BeAds.
ALTER TABLE "FeedPiece" ADD COLUMN "adRequestKey" TEXT;
CREATE INDEX "FeedPiece_adRequestKey_idx" ON "FeedPiece"("adRequestKey");

CREATE TABLE "FeedAdRequest" (
  "id" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "instagramAccountId" TEXT NOT NULL,
  "canal" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "campanaId" TEXT,
  "conjuntoId" TEXT,
  "objetivo" TEXT,
  "brief" TEXT NOT NULL,
  "formatos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "versiones" INTEGER NOT NULL DEFAULT 1,
  "para" TIMESTAMP(3),
  "pedidoPor" TEXT NOT NULL,
  "cerrado" TEXT,
  "motivoRechazo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedAdRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedAdRequest_clave_key" ON "FeedAdRequest"("clave");
CREATE INDEX "FeedAdRequest_workspaceId_createdAt_idx" ON "FeedAdRequest"("workspaceId", "createdAt");
ALTER TABLE "FeedAdRequest" ADD CONSTRAINT "FeedAdRequest_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
