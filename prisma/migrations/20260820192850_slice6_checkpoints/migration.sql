-- CreateTable
CREATE TABLE "checkpoints" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameVersion" INTEGER NOT NULL,
    "lastEventSequence" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkpoints_gameId_createdAt_idx" ON "checkpoints"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
