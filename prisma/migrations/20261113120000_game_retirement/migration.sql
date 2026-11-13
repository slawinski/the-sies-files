-- Independent minimal retirement evidence; no game FK and no legacy backfill.
CREATE TABLE "game_retirements" (
    "gameId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "intentDigest" TEXT NOT NULL,
    "planDigest" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "game_retirements_pkey" PRIMARY KEY ("gameId")
);
CREATE UNIQUE INDEX "game_retirements_requestId_key" ON "game_retirements"("requestId");
