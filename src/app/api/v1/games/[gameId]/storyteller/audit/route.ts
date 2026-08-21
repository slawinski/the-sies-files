import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import {
  AUDIT_CATEGORIES,
  categoryEventTypes,
  classifyEventCategory,
  type AuditCategory,
} from "@/modules/recovery/recovery.service";

const MAX_LIMIT = 500;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);

    const url = new URL(req.url);
    const categoriesParam = url.searchParams.get("categories");
    const cursorParam = url.searchParams.get("cursor");
    const limitParam = url.searchParams.get("limit");

    let categories: AuditCategory[] | undefined;
    if (categoriesParam) {
      categories = categoriesParam.split(",").filter((c): c is AuditCategory => (AUDIT_CATEGORIES as readonly string[]).includes(c));
      if (categories.length === 0) throw new DomainError("INVALID_SESSION_STATE", "Unknown audit category");
    }
    const limit = Math.min(Math.max(parseInt(limitParam ?? "100", 10) || 100, 1), MAX_LIMIT);
    const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

    const eventTypes = categories ? categoryEventTypes(categories) : undefined;
    const events = await prisma.domainEvent.findMany({
      where: {
        gameId,
        ...(eventTypes ? { eventType: { in: eventTypes } } : {}),
        ...(cursor !== undefined ? { sequence: { lt: cursor } } : {}),
      },
      orderBy: { sequence: "desc" },
      take: limit,
    });

    return jsonOk({
      categories,
      nextCursor: events.length === limit ? events[events.length - 1].sequence : null,
      events: events.map((e) => ({
        sequence: e.sequence,
        gameVersion: e.gameVersion,
        eventType: e.eventType,
        category: classifyEventCategory(e.eventType),
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
