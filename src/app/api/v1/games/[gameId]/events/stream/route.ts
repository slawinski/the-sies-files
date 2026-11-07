import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DomainError, httpStatusFor } from "@/lib/errors";
import { resolveViewer, type Viewer } from "@/lib/auth/http";
import { recheckViewerSession } from "@/modules/auth/session";
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

  let viewer: Viewer;
  let game;
  try {
    viewer = await resolveViewer(gameId); // throws 401/404 unless a member
    game = await prisma.gameSession.findUnique({ where: { id: gameId } });
  } catch (err) {
    return streamError(err);
  }

  if (!game) {
    return streamError(new DomainError("GAME_NOT_FOUND", "Game not found"));
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let idle: ReturnType<typeof setTimeout> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let expiry: ReturnType<typeof setTimeout> | undefined;
      let expiresAt = Infinity;
      let checking = false;
      let hello = true;
      let pending: { type: string; version: number; sequence: number } | null = {
        type: "hello", version: game.version, sequence: game.eventSequence,
      };
      const close = () => {
        if (closed) return;
        closed = true;
        pending = null;
        clearTimeout(idle); clearTimeout(deadline); clearTimeout(expiry);
        unsubscribe?.();
        req.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* reader already closed */ }
      };
      cleanup = close;
      const send = (type: string, data: object, sequence?: number) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n${sequence === undefined ? "" : `id: ${sequence}\n`}\n`),
          );
        } catch { close(); }
      };
      const lost = () => { send("access-lost", {}); close(); };
      const check = () => {
        if (closed || checking) return;
        if (Date.now() >= expiresAt) { lost(); return; }
        checking = true;
        clearTimeout(idle);
        const started = Date.now();
        const due = started + 5_000;
        // A query may not be cancellable. Its late completion has no authority.
        deadline = setTimeout(close, 5_000);
        void recheckViewerSession(viewer, gameId).then(session => {
          if (closed) return;
          if (Date.now() >= due) { close(); return; }
          if (!session) { lost(); return; }
          expiresAt = session.expiresAt.getTime();
          if (Date.now() >= expiresAt) { lost(); return; }
          clearTimeout(expiry);
          expiry = setTimeout(() => { if (Date.now() >= expiresAt) lost(); else check(); }, Math.min(expiresAt - Date.now(), 2_147_483_647));
          const next = pending;
          pending = null;
          if (next) {
            const type = hello ? "hello" : next.type;
            hello = false;
            send(type, { gameId, type, version: next.version, sequence: next.sequence }, next.sequence);
          }
          clearTimeout(deadline);
          checking = false;
          // Count from attempt start, not completion: a slow prior read must
          // not add another five seconds to the nominal 10s + 5s bound.
          if (!closed) idle = setTimeout(check, Math.max(0, started + 10_000 - Date.now()));
        }, () => close()); // uncertainty is not a definite access-loss assertion
      };
      req.signal.addEventListener("abort", close);
      if (req.signal.aborted) { close(); return; }
      unsubscribe = subscribe(gameId, ev => {
        if (closed) return;
        if (!pending || ev.sequence >= pending.sequence) pending = ev;
        check();
      });
      check();
    },
    cancel() {
      cleanup();
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
