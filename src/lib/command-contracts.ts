// Client-safe, synchronous durable-result contracts. Never add coercion,
// stripping, defaults or transforms: the persisted result is an observed fact.
import { z } from "zod";
import { DomainError } from "./errors";

const id = z.string().min(1);
const empty = z.strictObject({});
const winner = z.strictObject({ winner: z.enum(["GOOD", "EVIL"]).nullable() });
export const scanOutcomeSchema = z.strictObject({
  discoveries: z.array(id), tasks: z.array(id), conditions: z.array(id), mapVersionId: id.nullable(),
});
export const commandContracts = {
  renameGame: empty,
  setParticipantKind: empty,
  addPlayer: z.strictObject({ playerId: id }),
  updatePlayer: empty,
  removePlayer: empty,
  reorderPlayers: empty,
  issueClaimToken: z.strictObject({ playerId: id, claimId: id, expiresAt: z.iso.datetime() }),
  generateSetup: z.strictObject({ regenerationIndex: z.number().int().nonnegative() }),
  commitSetup: z.strictObject({ setupHash: id }),
  acknowledgeRole: empty,
  startOperational: z.strictObject({ actionCount: z.number().int().nonnegative(), cycleNumber: z.number().int().positive() }),
  submitAction: empty,
  resolveAction: empty,
  completeOperational: empty,
  openNominations: empty,
  closeNominations: empty,
  nominate: z.strictObject({ nominationId: id }),
  resolveNominationTrigger: empty,
  voteIntent: empty,
  startVotingPass: empty,
  advanceVotingPass: empty,
  lockVote: empty,
  resolveExecution: winner,
  exileTraveller: empty,
  slayer: z.strictObject({ winner: z.enum(["GOOD", "EVIL"]).nullable(), decisionRequired: z.boolean().optional() }),
  resolveSlayerDecision: winner,
  closeInvestigation: winner,
  scanQr: z.strictObject({ outcome: scanOutcomeSchema }),
  storytellerRevealClue: empty,
  storytellerCompleteTask: empty,
  storytellerSetStage: empty,
  storytellerSetMap: empty,
  storytellerSetCondition: empty,
  createCheckpoint: z.strictObject({ checkpointId: id }),
  resetPlayerAccess: empty,
  recoveryOverride: empty,
} as const;

export type CommandOperation = keyof typeof commandContracts;
export type CommandResultFor<O extends CommandOperation> = z.output<(typeof commandContracts)[O]>;
export type CommandActor = "storyteller" | `player:${string}`;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Reject values JSON.stringify would silently alter or omit. */
export function isJson(value: unknown, ancestors = new Set<object>()): value is Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  const valid = Array.isArray(value)
    ? keys.length === value.length + 1 && Array.from({ length: value.length }, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        return descriptor?.enumerable && "value" in descriptor && isJson(descriptor.value, ancestors);
      }).every(Boolean)
    : keys.every(k => typeof k === "string" && Object.getOwnPropertyDescriptor(value, k)?.enumerable &&
        "value" in Object.getOwnPropertyDescriptor(value, k)! && isJson(Object.getOwnPropertyDescriptor(value, k)!.value, ancestors));
  ancestors.delete(value);
  return valid;
}

export function isCommandOperation(value: string): value is CommandOperation {
  return Object.hasOwn(commandContracts, value);
}

export function parseCommandResult<O extends CommandOperation>(operation: O, value: unknown, fresh = false): CommandResultFor<O> {
  const parsed = isJson(value) ? commandContracts[operation].safeParse(value) : null;
  if (!parsed?.success) throw new DomainError(
    fresh ? "COMMAND_RESULT_INVALID" : "COMMAND_RECEIPT_INVALID",
    fresh ? "Command result is invalid" : "Committed command outcome is unreadable",
  );
  // The indexed catalog schema validated this exact operation above.
  return parsed.data as CommandResultFor<O>;
}

export interface ReceiptRecord {
  operation: string | null; actor: string | null; requestHash: string | null; resultVersion: number | null;
  status: string; resultingVersion: number; resultJson: unknown;
}

export function receiptInvalid(): never {
  throw new DomainError("COMMAND_RECEIPT_INVALID", "Committed command outcome is unreadable");
}

/** The common current-format reader, used only after viewer/duplicate eligibility. */
export function readCommandReceipt(receipt: ReceiptRecord) {
  if (!receipt.operation || !isCommandOperation(receipt.operation) || receipt.resultVersion !== 1 ||
      !receipt.actor || !/^(storyteller|player:.+)$/.test(receipt.actor) ||
      !receipt.requestHash || !/^[a-f0-9]{64}$/.test(receipt.requestHash) ||
      receipt.status !== "APPLIED" || !Number.isSafeInteger(receipt.resultingVersion) || receipt.resultingVersion < 1) receiptInvalid();
  return { operation: receipt.operation, resultVersion: 1 as const,
    resultingGameVersion: receipt.resultingVersion, result: parseCommandResult(receipt.operation, receipt.resultJson) };
}
