// Route-handler utilities: JSON responses with `Cache-Control: no-store`
// (secret API responses must never be shared-cached, docs/03 §17/§19), error
// mapping, and Zod body parsing. Every /api response is non-cacheable.

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DomainError, httpStatusFor } from "./errors";
import { RateLimitError } from "./rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(err.retryAfterSeconds) } },
    );
  }
  if (err instanceof DomainError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: httpStatusFor(err.code), headers: NO_STORE },
    );
  }
  if (err instanceof ZodError) {
    // Do not echo input values (they may contain a claim token).
    const issues = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: { code: "INVALID_SESSION_STATE", message: "Invalid request", issues } },
      { status: 400, headers: NO_STORE },
    );
  }
  console.error("[unhandled]", err);
  return NextResponse.json(
    { error: { code: "INVALID_SESSION_STATE", message: "Internal server error" } },
    { status: 500, headers: NO_STORE },
  );
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new DomainError("INVALID_SESSION_STATE", "Invalid JSON body");
  }
  return schema.parse(raw);
}
