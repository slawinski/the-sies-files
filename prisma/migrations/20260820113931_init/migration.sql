-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LOBBY', 'SETUP', 'ROLE_REVEAL', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('OPERATIONAL', 'INVESTIGATION');

-- CreateEnum
CREATE TYPE "ParticipantKind" AS ENUM ('NORMAL', 'TRAVELLER');

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'LOBBY',
    "phase" "GamePhase",
    "cycleNumber" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "eventSequence" INTEGER NOT NULL DEFAULT 0,
    "scriptId" TEXT,
    "scriptVersion" INTEGER,
    "scenarioId" TEXT,
    "scenarioVersion" INTEGER,
    "winner" TEXT,
    "winReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "virtualSeat" INTEGER NOT NULL,
    "participantKind" "ParticipantKind" NOT NULL DEFAULT 'NORMAL',
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "ghostVoteAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_claims" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "storytellerGameId" TEXT,
    "sessionTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "gameVersion" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT,
    "commandId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_receipts" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "resultingVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_gameId_virtualSeat_key" ON "players"("gameId", "virtualSeat");

-- CreateIndex
CREATE UNIQUE INDEX "players_gameId_displayName_key" ON "players"("gameId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "player_claims_playerId_key" ON "player_claims"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_claims_tokenHash_key" ON "player_claims"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "browser_sessions_sessionTokenHash_key" ON "browser_sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "browser_sessions_playerId_idx" ON "browser_sessions"("playerId");

-- CreateIndex
CREATE INDEX "browser_sessions_storytellerGameId_idx" ON "browser_sessions"("storytellerGameId");

-- CreateIndex
CREATE INDEX "domain_events_gameId_createdAt_idx" ON "domain_events"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "domain_events_commandId_idx" ON "domain_events"("commandId");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_gameId_sequence_key" ON "domain_events"("gameId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "command_receipts_gameId_commandId_key" ON "command_receipts"("gameId", "commandId");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_claims" ADD CONSTRAINT "player_claims_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_storytellerGameId_fkey" FOREIGN KEY ("storytellerGameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
