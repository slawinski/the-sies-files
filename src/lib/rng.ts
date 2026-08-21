// Injectable RNG. Production code uses crypto; tests and Slice 2 setup
// generation use a deterministic seeded generator so setup is reproducible.

import { createHmac, randomBytes, randomUUID } from "node:crypto";

export interface Rng {
  /** Returns `length` random bytes. */
  randomBytes(length: number): Uint8Array;
  /** Returns a random UUID v4 string. */
  randomUuid(): string;
  /** Returns a uniformly random integer in [min, max] inclusive. */
  randomInt(min: number, max: number): number;
}

export class CryptoSecureRng implements Rng {
  randomBytes(length: number): Uint8Array {
    return randomBytes(length);
  }

  randomUuid(): string {
    return randomUUID();
  }

  randomInt(min: number, max: number): number {
    const range = max - min + 1;
    const buf = Buffer.alloc(4);
    // Rejection sampling to avoid modulo bias.
    const limit = Math.floor(2 ** 32 / range) * range;
    let val: number;
    do {
      randomBytes(4).copy(buf);
      val = buf.readUInt32BE(0);
    } while (val >= limit);
    return min + (val % range);
  }
}

export const cryptoSecureRng: Rng = new CryptoSecureRng();

/**
 * Hash a string (e.g. a 128-bit hex seed) to a 32-bit uint for seeding a
 * deterministic PRNG. The seed string itself can carry more entropy than the
 * PRNG state; hashing just derives the working state.
 */
export function hashStringToUint32(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * RNG v2 (audit spec 24 §6): counter-based HMAC-SHA256 construction preserving
 * >=128 bits of effective deterministic state from the seed string. Rejection
 * sampling avoids modulo bias. Legacy `SeededRng` (xorshift32) remains for
 * generator-version-1 compatibility and must never be mixed with v2 seeds.
 */
export class SeededRngV2 implements Rng {
  private counter = 0;
  private readonly seed: Buffer;

  constructor(seed: string) {
    this.seed = Buffer.from(seed, "utf8");
  }

  private block(): Buffer {
    const c = this.counter;
    this.counter += 1;
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(BigInt(c));
    return createHmac("sha256", this.seed).update(counterBytes).digest();
  }

  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const block = this.block();
      const take = Math.min(block.length, length - offset);
      out.set(block.subarray(0, take), offset);
      offset += take;
    }
    return out;
  }

  randomUuid(): string {
    const b = this.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(b)
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  randomInt(min: number, max: number): number {
    const range = max - min + 1;
    // Rejection sampling over 32 bits to avoid modulo bias.
    const limit = Math.floor(2 ** 32 / range) * range;
    let val: number;
    do {
      val = this.block().readUInt32BE(0);
    } while (val >= limit);
    return min + (val % range);
  }
}

/** Deterministic xorshift32-based generator for tests and seeded setup. */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  private next(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x;
  }

  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      out[i] = this.next() & 0xff;
    }
    return out;
  }

  randomUuid(): string {
    const b = this.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(b)
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  randomInt(min: number, max: number): number {
    const range = max - min + 1;
    // Rejection sampling to avoid modulo bias (matches CryptoSecureRng).
    const limit = Math.floor(2 ** 32 / range) * range;
    let val: number;
    do {
      val = this.next();
    } while (val >= limit);
    return min + (val % range);
  }
}
