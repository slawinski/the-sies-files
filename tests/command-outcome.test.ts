import { expect, it } from "vitest";
import { clearPendingQr, decodeScanAcknowledgement, decodeScanStatus, hydratePendingQr, retainPendingQr, PENDING_QR_KEY, type PendingQrIdentity } from "@/lib/command-outcome";
import { executeCommand } from "@/lib/command-refresh";

const identity: PendingQrIdentity = { format: 1, operation: "scanQr", gameId: "game", playerId: "player", commandId: "command" };
const outcome = { discoveries: ["clue"], tasks: [], conditions: [], mapVersionId: null };
it("persists only the scoped command identity and discards corrupt/foreign identities", () => {
  const values = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
  expect(retainPendingQr(identity, storage)).toBe(true);
  expect(JSON.parse(values.get(PENDING_QR_KEY)!)).toEqual(identity);
  expect(hydratePendingQr("game", "player", storage)).toEqual(identity);
  clearPendingQr({ ...identity, commandId: "newer" }, storage);
  expect(values.size).toBe(1);
  expect(hydratePendingQr("game", "other", storage)).toBeNull();
  expect(values.size).toBe(0);
  for (const value of ["not JSON", JSON.stringify({ ...identity, token: "private" }), JSON.stringify({ ...identity, format: 2 })]) {
    values.set(PENDING_QR_KEY, value);
    expect(hydratePendingQr("game", "player", storage)).toBeNull();
    expect(values.size).toBe(0);
  }
});
it("storage denial degrades without preventing in-memory identity recovery", () => {
  const denied = () => { throw new Error("storage blocked"); };
  expect(retainPendingQr(identity, denied)).toBe(false);
  expect(hydratePendingQr("game", "player", denied)).toBeNull();
  expect(() => clearPendingQr(identity, denied)).not.toThrow();
});
it("validates both initial acknowledgements and exact supported status metadata", () => {
  expect(decodeScanAcknowledgement({ version: 2, outcome })).toEqual({ version: 2, outcome });
  expect(decodeScanStatus({ status: "UNKNOWN" }, identity)).toBeNull();
  const applied = { status: "APPLIED", commandId: "command", operation: "scanQr", resultVersion: 1, resultingGameVersion: 2, result: { outcome } };
  expect(decodeScanStatus(applied, identity)).toEqual({ version: 2, outcome });
  for (const patch of [{ commandId: "other" }, { operation: "voteIntent" }, { resultVersion: 99 }, { resultingGameVersion: 0 }, { result: {} }, { privateMarker: "secret" }])
    expect(() => decodeScanStatus({ ...applied, ...patch }, identity)).toThrow();
  for (const invalid of [null, {}, { version: 2, outcome: { duplicate: true } }, { version: NaN, outcome }]) expect(() => decodeScanAcknowledgement(invalid)).toThrow();
});
it("malformed successful API JSON cannot acknowledge or refresh as a committed command", async () => {
  let acknowledgements = 0, refreshes = 0;
  const result = await executeCommand(async () => decodeScanAcknowledgement(null), async () => { refreshes++; }, () => { acknowledgements++; });
  expect(result.committed).toBe(false);
  expect(acknowledgements).toBe(0);
  expect(refreshes).toBe(0);
});
