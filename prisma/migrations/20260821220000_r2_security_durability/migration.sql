-- AlterTable: game archive metadata
ALTER TABLE "game_sessions" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable: DB-backed rate limit buckets
CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_key_windowStart_key" ON "rate_limit_buckets"("key", "windowStart");

-- Audit retention: durable audit relations must not cascade on accidental hard delete.
ALTER TABLE "domain_events" DROP CONSTRAINT "domain_events_gameId_fkey";
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "command_receipts" DROP CONSTRAINT "command_receipts_gameId_fkey";
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "checkpoints" DROP CONSTRAINT "checkpoints_gameId_fkey";
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant: an ACTIVE game must have a phase (spec 22 §6).
ALTER TABLE "game_sessions"
ADD CONSTRAINT "game_sessions_active_requires_phase"
CHECK ("status" <> 'ACTIVE' OR "phase" IS NOT NULL);
