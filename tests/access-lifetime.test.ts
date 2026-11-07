import { describe, expect, it } from "vitest";
import { AccessLifetime, isAccessDenial } from "@/lib/access-lifetime";
import { ApiClientError } from "@/lib/client-api";

describe("private access lifetime", () => {
  it("rejects held results immediately and after same-game reauthorization", () => {
    const access = new AccessLifetime();
    const held = access.capture();
    expect(access.owns(held)).toBe(true);
    access.lose();
    expect(access.owns(held)).toBe(false);
    const ended = access.capture();
    access.lose();
    expect(access.capture()).toBe(ended);
    access.authorize();
    expect(access.owns(held)).toBe(false);
    expect(access.owns(ended)).toBe(false);
    expect(access.owns(access.capture())).toBe(true);
  });
  it("distinguishes authoritative denials from resource and temporary failures", () => {
    expect(isAccessDenial(new ApiClientError(404, "GAME_NOT_FOUND", "Game not found"))).toBe(true);
    expect(isAccessDenial(new ApiClientError(401, "UNAUTHORIZED", "Not authenticated"))).toBe(true);
    expect(isAccessDenial(new ApiClientError(403, "FORBIDDEN", "Forbidden"), true)).toBe(true);
    for (const error of [new ApiClientError(403, "FORBIDDEN", "Forbidden"),
      new ApiClientError(404, "GAME_NOT_FOUND", "Layer not found"),
      new ApiClientError(404, "PLAYER_NOT_FOUND", "Player not found"),
      new ApiClientError(500, "UNKNOWN", "Internal server error"), new Error("network")]) {
      expect(isAccessDenial(error)).toBe(false);
    }
  });
});
