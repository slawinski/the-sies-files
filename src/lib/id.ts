import { cryptoSecureRng } from "./rng";

/** Generate an opaque identifier (UUID v4). */
export function newId(): string {
  return cryptoSecureRng.randomUuid();
}
