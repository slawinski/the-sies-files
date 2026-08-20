-- CreateTable
CREATE TABLE "scenario_states" (
    "gameId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "scenarioVersion" INTEGER,
    "stageId" TEXT,
    "mapVersionId" TEXT,
    "stateJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_states_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "qr_scans" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "qrTokenId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'CONSUMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_discoveries" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT,
    "objectId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "visibilityScope" TEXT NOT NULL,
    "contentJson" JSONB,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_states" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "playerId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_conditions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "playerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_scans_gameId_playerId_idx" ON "qr_scans"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_scans_gameId_playerId_commandId_key" ON "qr_scans"("gameId", "playerId", "commandId");

-- CreateIndex
CREATE INDEX "scenario_discoveries_gameId_playerId_idx" ON "scenario_discoveries"("gameId", "playerId");

-- CreateIndex
CREATE INDEX "task_states_gameId_taskId_idx" ON "task_states"("gameId", "taskId");

-- CreateIndex
CREATE INDEX "scenario_conditions_gameId_conditionId_idx" ON "scenario_conditions"("gameId", "conditionId");

-- AddForeignKey
ALTER TABLE "scenario_states" ADD CONSTRAINT "scenario_states_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scans" ADD CONSTRAINT "qr_scans_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_discoveries" ADD CONSTRAINT "scenario_discoveries_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_states" ADD CONSTRAINT "task_states_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_conditions" ADD CONSTRAINT "scenario_conditions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
