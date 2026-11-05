-- BeFeed: piezas de pauta. Destino, datos del anuncio y su validación con BeAds.
ALTER TABLE "FeedPiece"
  ADD COLUMN "destination" TEXT NOT NULL DEFAULT 'ORGANICO',
  ADD COLUMN "ad" JSONB,
  ADD COLUMN "adCheck" JSONB;
