# Dev SSE Lost Events (module duplication)
> In-memory broker lost invalidate events in dev; fixed with globalThis

Entry: `src/modules/realtime/broker.ts` — listeners map now on `globalThis`

Symptom: `next dev` cold-start — SSE `hello` arrives but `invalidate` after a
mutation is lost (flaky, first request after compile affected). Production
(`next build`) unaffected (single module instance).

Cause: dev on-demand route compilation can load separate module instances of
`broker.ts` for the stream route vs mutating routes → publish hits a different
listeners map.

Fix: registry stored on `globalThis.__tsfRealtimeListeners` so all module
instances share it. Verified with standalone probe: 3/3 cold starts deliver
invalidate after the fix.

Related: e2e page SSE can also open LATE on a cold dev server (route compile
~5-10s after page load) — a mutation issued before the stream opens is missed
forever (no catch-up). Tests must wait for the LIVE dot before mutating.

Updated: 2026-08-22
