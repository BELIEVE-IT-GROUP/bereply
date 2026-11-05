-- BeFeed: lee toda la pauta de la marca. La pieza del tablero pasa a ser opcional.
ALTER TABLE "FeedAdResult"
  ALTER COLUMN "maasAssetId" DROP NOT NULL,
  ADD COLUMN "nombre" TEXT,
  ADD COLUMN "objetivo" TEXT,
  ADD COLUMN "titular" TEXT,
  ADD COLUMN "mensaje" TEXT;
