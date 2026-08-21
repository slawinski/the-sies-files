-- AlterTable
ALTER TABLE "checkpoints" ADD COLUMN "boundaryKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_gameId_boundaryKey_key" ON "checkpoints"("gameId", "boundaryKey");

-- CreateTable
CREATE TABLE "presence" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presence_gameId_viewerId_key" ON "presence"("gameId", "viewerId");

-- CreateIndex
CREATE INDEX "presence_gameId_lastSeenAt_idx" ON "presence"("gameId", "lastSeenAt");
