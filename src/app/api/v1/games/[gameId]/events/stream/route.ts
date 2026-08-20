import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DomainError, httpStatusFor } from "@/lib/errors";
import { resolveViewer } from "@/lib/auth/http";
import { subscribe } from "@/modules/realtime/broker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events: membership-scoped projection invalidation stream.
// Events carry only { gameId, type, version, sequence } — no payloads, no
// secrets. Clients refetch their projection on receipt. Missed events are
// harmless because a refetch reconstructs truth (docs/01 §17).

function streamError(err: unknown): NextResponse {
  if (err instanceof DomainError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: httpStatusFor(err.code), headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: { code: "INVALID_SESSION_STATE", message: "Internal server error" } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;

  try {
    await resolveViewer(gameId); // throws 401/404 unless a member
  } catch (err) {
    return streamError(err);
  }

  const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
  if (!game) {
    return streamError(new DomainError("GAME_NOT_FOUND", "Game not found"));
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, version: number, sequence: number) => {
        if (closed) return;
        const data = JSON.stringify({ gameId, type, version, sequence });
        try {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${data}\nid: ${sequence}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send("hello", game.version, game.eventSequence);
      unsubscribe = subscribe(gameId, (ev) => {
        send(ev.type, ev.version, ev.sequence);
      });

      req.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
