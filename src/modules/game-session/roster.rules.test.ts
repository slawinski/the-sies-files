import { describe, it, expect } from "vitest";
import {
  isRosterReady,
  validateRosterSizeForAdd,
  normalizeDisplayName,
  isContiguousSeats,
  isPermutation,
  hasDuplicates,
} from "./roster.rules";
import { DomainError } from "@/lib/errors";

describe("isRosterReady", () => {
  it("is false below 13", () => {
    expect(isRosterReady(0)).toBe(false);
    expect(isRosterReady(12)).toBe(false);
  });
  it("is true for 13..16", () => {
    for (let n = 13; n <= 16; n += 1) expect(isRosterReady(n)).toBe(true);
  });
  it("is false above 16", () => {
    expect(isRosterReady(17)).toBe(false);
  });
});

describe("validateRosterSizeForAdd", () => {
  it("allows below 16", () => {
    expect(() => validateRosterSizeForAdd(15)).not.toThrow();
  });
  it("throws ROSTER_FULL at 16", () => {
    try {
      validateRosterSizeForAdd(16);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as DomainError).code).toBe("ROSTER_FULL");
    }
  });
});

describe("normalizeDisplayName", () => {
  it("trims whitespace", () => {
    expect(normalizeDisplayName("  Ada  ")).toBe("Ada");
  });
  it("throws INVALID_DISPLAY_NAME on empty", () => {
    expect(() => normalizeDisplayName("")).toThrow(DomainError);
    expect(() => normalizeDisplayName("   ")).toThrow(DomainError);
  });
});

describe("isContiguousSeats", () => {
  it("true for 0..n-1", () => {
    expect(isContiguousSeats([0, 1, 2, 3])).toBe(true);
  });
  it("false for gaps", () => {
    expect(isContiguousSeats([0, 2, 3])).toBe(false);
  });
  it("false for wrong start", () => {
    expect(isContiguousSeats([1, 2, 3])).toBe(false);
  });
});

describe("isPermutation", () => {
  const current = ["a", "b", "c"];
  it("true for a shuffle", () => {
    expect(isPermutation(["c", "a", "b"], current)).toBe(true);
  });
  it("false for missing id", () => {
    expect(isPermutation(["a", "b"], current)).toBe(false);
  });
  it("false for extra id", () => {
    expect(isPermutation(["a", "b", "c", "d"], current)).toBe(false);
  });
  it("false for duplicate id", () => {
    expect(isPermutation(["a", "a", "c"], current)).toBe(false);
  });
  it("false for wrong id", () => {
    expect(isPermutation(["a", "b", "x"], current)).toBe(false);
  });
});

describe("hasDuplicates", () => {
  it("detects duplicates", () => {
    expect(hasDuplicates(["a", "a"])).toBe(true);
  });
  it("false for unique", () => {
    expect(hasDuplicates(["a", "b"])).toBe(false);
  });
});
