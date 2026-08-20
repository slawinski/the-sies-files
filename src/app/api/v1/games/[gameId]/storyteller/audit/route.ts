import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    const events = await prisma.domainEvent.findMany({
      where: { gameId },
      orderBy: { sequence: "desc" },
      take: 200,
    });
    return jsonOk({
      events: events.map((e) => ({
        sequence: e.sequence,
        gameVersion: e.gameVersion,
        eventType: e.eventType,
        actor: e.actor,
        commandId: e.commandId,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
