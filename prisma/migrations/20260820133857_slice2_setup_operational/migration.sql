-- CreateEnum
CREATE TYPE "OperationalPhaseStatus" AS ENUM ('BUILDING', 'RUNNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OperationalActionStatus" AS ENUM ('PENDING', 'WAITING_FOR_PLAYER', 'WAITING_FOR_STORYTELLER', 'RESOLVING', 'RESOLVED', 'SKIPPED');

-- CreateTable
CREATE TABLE "player_secrets" (
    "playerId" TEXT NOT NULL,
    "trueCharacterId" TEXT,
    "perceivedCharacterId" TEXT,
    "trueAlignment" TEXT,
    "abilityStateJson" JSONB,
    "roleAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_secrets_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "setup_drafts" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "generatorVersion" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "candidateJson" JSONB NOT NULL,
    "regenerationIndex" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3),
    "setupHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_phases" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "status" "OperationalPhaseStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "operational_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_actions" (
    "id" TEXT NOT NULL,
    "operationalPhaseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actorPlayerId" TEXT,
    "status" "OperationalActionStatus" NOT NULL DEFAULT 'PENDING',
    "publicJson" JSONB,
    "secretJson" JSONB,
    "resolutionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_drafts_gameId_key" ON "setup_drafts"("gameId");

-- CreateIndex
CREATE INDEX "operational_phases_gameId_cycleNumber_idx" ON "operational_phases"("gameId", "cycleNumber");

-- CreateIndex
CREATE INDEX "operational_actions_operationalPhaseId_orderIndex_idx" ON "operational_actions"("operationalPhaseId", "orderIndex");

-- AddForeignKey
ALTER TABLE "player_secrets" ADD CONSTRAINT "player_secrets_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_drafts" ADD CONSTRAINT "setup_drafts_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_phases" ADD CONSTRAINT "operational_phases_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_actions" ADD CONSTRAINT "operational_actions_operationalPhaseId_fkey" FOREIGN KEY ("operationalPhaseId") REFERENCES "operational_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
