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

    const [game, blocking, lastEvent, latestCheckpoint, consistencyIssues, participantCount, presence] = await Promise.all([
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
    ]);

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
    });
  } catch (err) {
    return jsonError(err);
  }
}
