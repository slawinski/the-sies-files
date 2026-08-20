-- CreateTable
CREATE TABLE "effects" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "effectType" TEXT NOT NULL,
    "sourcePlayerId" TEXT,
    "targetPlayerId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "expiryBoundary" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "effects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "effects_gameId_active_idx" ON "effects"("gameId", "active");

-- CreateIndex
CREATE INDEX "effects_targetPlayerId_active_idx" ON "effects"("targetPlayerId", "active");

-- AddForeignKey
ALTER TABLE "effects" ADD CONSTRAINT "effects_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
