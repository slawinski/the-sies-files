# ADR-002 — Claim Token Transport (Body, not URL path)

**Status:** Accepted
**Applies to:** Slice 1 claim flow (`04_SLICE_1_SESSION_ROSTER_GRIMOIRE.md` §6)
**Supersedes:** the API shape `POST /api/v1/player-claims/:token/claim`

## 1. Context

Slice 1 specifies `POST /api/v1/player-claims/:token/claim`, placing the raw
one-time claim token in the URL path. URLs are written to proxy/access logs,
browser history, and can leak via `Referer`. This conflicts with the hard rule
that the raw token is never logged (docs/04 §5.3, docs/01 §18).

## 2. Decision

- The claim endpoint is `POST /api/v1/player-claims/claim`, accepting the token
  in the **POST body** (`{ token, commandId }`), never the URL.
- Claim links use a URL **fragment** (`/claim#<token>`). Fragments are not sent
  to the server, so the token never appears in server access logs or the
  request path.
- The client reads the fragment, then POSTs the token in the body. The page
  carries `Referrer-Policy: no-referrer` and the response `Cache-Control: no-store`.

## 3. Consequences

- The raw token still appears in the fragment (browser-local), which is the
  inherent property of a one-time link; it is never persisted or logged by the
  server.
- Idempotency is handled via a client-generated `commandId` recorded on the
  claim at first use (retry-after-timeout re-issues a session rather than
  failing).
