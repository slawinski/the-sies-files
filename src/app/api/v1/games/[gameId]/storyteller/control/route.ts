import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { prisma } from "@/lib/db";
import { runConsistencyChecks, listPresence } from "@/modules/recovery/recovery.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);

    const [game, blocking, lastEvent, latestCheckpoint, consistencyIssues, participantCount, presence, pendingSecrets, roster] = await Promise.all([
      prisma.gameSession.findUnique({ where: { id: gameId } }),
      prisma.operationalAction.findFirst({
        where: { phase: { gameId, status: { not: "COMPLETED" } }, status: { in: ["WAITING_FOR_PLAYER", "WAITING_FOR_STORYTELLER"] } },
        include: { phase: true },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.domainEvent.findFirst({ where: { gameId }, orderBy: { sequence: "desc" } }),
      prisma.checkpoint.findFirst({ where: { gameId }, orderBy: { createdAt: "desc" } }),
      runConsistencyChecks(gameId),
      prisma.player.count({ where: { gameId } }),
      listPresence(gameId),
      prisma.playerSecret.findMany({ where: { player: { gameId } } }),
      prisma.player.findMany({ where: { gameId }, orderBy: { virtualSeat: "asc" } }),
    ]);

    const nameById = new Map(roster.map((p) => [p.id, p.displayName]));
    const pendingDecisions = pendingSecrets
      .map((s) => {
        const pending = (s.abilityStateJson as { pendingSlayerDecision?: { targetPlayerId: string; options: Array<{ optionId: string; description: string; satisfies: boolean }> } } | null)?.pendingSlayerDecision;
        return pending
          ? {
              context: "SLAYER_TARGET_DEMON",
              slayerPlayerId: s.playerId,
              slayerName: nameById.get(s.playerId) ?? null,
              targetName: nameById.get(pending.targetPlayerId) ?? null,
              options: pending.options,
            }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    return jsonOk({
      gameId,
      name: game?.name ?? null,
      status: game?.status ?? null,
      phase: game?.phase ?? null,
      cycleNumber: game?.cycleNumber ?? 0,
      version: game?.version ?? 0,
      eventSequence: game?.eventSequence ?? 0,
      participantCount,
      blockingAction: blocking
        ? { id: blocking.id, kind: blocking.kind, actorPlayerId: blocking.actorPlayerId, status: blocking.status }
        : null,
      lastEvent: lastEvent
        ? { eventType: lastEvent.eventType, sequence: lastEvent.sequence, gameVersion: lastEvent.gameVersion, createdAt: lastEvent.createdAt.toISOString() }
        : null,
      latestCheckpoint: latestCheckpoint
        ? { id: latestCheckpoint.id, gameVersion: latestCheckpoint.gameVersion, checksum: latestCheckpoint.checksum, reason: latestCheckpoint.reason, createdAt: latestCheckpoint.createdAt.toISOString() }
        : null,
      consistencyIssues,
      presence,
      pendingDecisions,
    });
  } catch (err) {
    return jsonError(err);
  }
}
