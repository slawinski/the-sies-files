import { z } from "zod";
import { scanOutcomeSchema } from "./command-contracts";
import { ApiClientError } from "./client-api";

export const PENDING_QR_KEY = "tsf:pending-qr";
const identitySchema = z.strictObject({
  format: z.literal(1), operation: z.literal("scanQr"),
  gameId: z.string().min(1), playerId: z.string().min(1), commandId: z.string().min(1),
});
export type PendingQrIdentity = z.infer<typeof identitySchema>;
type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStorage: StorageAccess = () => window.sessionStorage;

export function retainPendingQr(identity: PendingQrIdentity, storage: StorageAccess = browserStorage): boolean {
  try { storage().setItem(PENDING_QR_KEY, JSON.stringify(identitySchema.parse(identity))); return true; }
  catch { return false; }
}
export function clearPendingQr(identity?: PendingQrIdentity, storage: StorageAccess = browserStorage): void {
  try {
    if (identity) {
      const parsed = identitySchema.safeParse(JSON.parse(storage().getItem(PENDING_QR_KEY) ?? "null"));
      if (parsed.success && parsed.data.commandId !== identity.commandId) return;
    }
    storage().removeItem(PENDING_QR_KEY);
  } catch { /* In-memory recovery remains usable when storage is blocked. */ }
}
export function hydratePendingQr(gameId: string, playerId: string, storage: StorageAccess = browserStorage): PendingQrIdentity | null {
  try {
    const parsed = identitySchema.safeParse(JSON.parse(storage().getItem(PENDING_QR_KEY) ?? "null"));
    if (parsed.success && parsed.data.gameId === gameId && parsed.data.playerId === playerId) return parsed.data;
    clearPendingQr(undefined, storage);
  } catch { clearPendingQr(undefined, storage); }
  return null;
}

const version = z.number().int().positive();
const acknowledgement = z.strictObject({ version, outcome: scanOutcomeSchema });
const statusSchema = z.union([
  z.strictObject({ status: z.literal("UNKNOWN") }),
  z.strictObject({ status: z.literal("APPLIED"), commandId: z.string().min(1), operation: z.literal("scanQr"),
    resultVersion: z.union([z.literal(0), z.literal(1)]), resultingGameVersion: version,
    result: z.strictObject({ outcome: scanOutcomeSchema }),
  }),
]);
function malformed(): never { throw new ApiClientError(0, "COMMAND_ACK_INVALID", "Nie można odczytać wyniku skanu."); }
export function decodeScanAcknowledgement(value: unknown) {
  const parsed = acknowledgement.safeParse(value);
  if (!parsed.success) malformed();
  return parsed.data;
}
export function decodeScanStatus(value: unknown, identity: PendingQrIdentity) {
  const parsed = statusSchema.safeParse(value);
  if (!parsed.success) malformed();
  if (parsed.data.status === "UNKNOWN") return null;
  if (parsed.data.commandId !== identity.commandId) malformed();
  return { version: parsed.data.resultingGameVersion, outcome: parsed.data.result.outcome };
}
export function definitelyRejected(error: unknown): boolean {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500 &&
    !["DUPLICATE_COMMAND", "COMMAND_RECEIPT_INVALID"].includes(error.code);
}
