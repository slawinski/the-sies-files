-- CreateEnum
CREATE TYPE "NominationState" AS ENUM ('CLOSED', 'OPEN', 'VOTING', 'RESOLVING');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('CREATED', 'VOTING', 'LOCKED', 'RESOLVED');

-- CreateTable
CREATE TABLE "investigation_states" (
    "gameId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "nominationState" "NominationState" NOT NULL DEFAULT 'CLOSED',
    "currentExecutionCandidatePlayerId" TEXT,
    "currentHighEffectiveVotes" INTEGER,
    "executionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "investigation_states_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "nominations" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "nominatorId" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "status" "NominationStatus" NOT NULL DEFAULT 'CREATED',
    "sequence" INTEGER NOT NULL,
    "rawTotal" INTEGER NOT NULL DEFAULT 0,
    "effectiveTotal" INTEGER NOT NULL DEFAULT 0,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rawIntent" BOOLEAN NOT NULL DEFAULT false,
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "effectiveWeight" INTEGER NOT NULL DEFAULT 0,
    "ghostVoteConsumed" BOOLEAN NOT NULL DEFAULT false,
    "invalidReason" TEXT,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "death_records" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "causedByPlayerId" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "death_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nominations_gameId_cycleNumber_sequence_key" ON "nominations"("gameId", "cycleNumber", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "votes_nominationId_playerId_key" ON "votes"("nominationId", "playerId");

-- CreateIndex
CREATE INDEX "death_records_gameId_playerId_idx" ON "death_records"("gameId", "playerId");

-- AddForeignKey
ALTER TABLE "investigation_states" ADD CONSTRAINT "investigation_states_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "nominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "death_records" ADD CONSTRAINT "death_records_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
