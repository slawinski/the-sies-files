// Production Content-Security-Policy (audit spec 22 §2). No unsafe-eval;
// inline script/style allowances are the pragmatic minimum for Next.js app
// router bootstrap without a nonce pipeline (a nonce-based upgrade is the
// documented follow-up).

export function buildCspPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}
