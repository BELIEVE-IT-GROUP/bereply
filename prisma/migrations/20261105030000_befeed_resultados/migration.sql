-- BeFeed: resultados de cada anuncio en BeAds, por pieza.
CREATE TABLE "FeedAdResult" (
  "anuncioId" TEXT NOT NULL,
  "instagramAccountId" TEXT NOT NULL,
  "maasAssetId" TEXT NOT NULL,
  "befeedPieceId" TEXT,
  "campana" TEXT,
  "formato" TEXT,
  "estado" TEXT,
  "moneda" TEXT NOT NULL,
  "gasto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impresiones" INTEGER NOT NULL DEFAULT 0,
  "resultados" INTEGER NOT NULL DEFAULT 0,
  "costoPorResultado" DOUBLE PRECISION,
  "frecuencia" DOUBLE PRECISION,
  "fatiga" BOOLEAN NOT NULL DEFAULT false,
  "ultimoDato" TEXT,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedAdResult_pkey" PRIMARY KEY ("anuncioId")
);
CREATE INDEX "FeedAdResult_instagramAccountId_idx" ON "FeedAdResult"("instagramAccountId");
CREATE INDEX "FeedAdResult_maasAssetId_idx" ON "FeedAdResult"("maasAssetId");
ALTER TABLE "FeedAdResult" ADD CONSTRAINT "FeedAdResult_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
