// Command envelope + idempotency + versioned transaction helper.
//
// Every authoritative state mutation flows through `runCommand` (versioned,
// idempotent formal command) or `runGameTransaction` (unversioned mutation that
// still locks the game, appends events and bumps the version — used where the
// actor cannot know the expected version, e.g. an anonymous player claim).
//
// Canonical command flow (docs/01 §14):
//
//   authenticate/authorize (route) → lock/read version transactionally →
//   idempotency check → reject stale command → validate rules → mutate state →
//   append domain events in the same transaction → increment version → commit
//   → publish realtime invalidation (caller).
//
// Formal commands are never last-write-wins. The row lock is acquired BEFORE
// the idempotency check so that a timeout→retry of the same commandId returns
// the duplicate result instead of a spurious VERSION_CONFLICT.

import { Prisma } from "@prisma/client";
import type { GameSession } from "@prisma/client";
import { createHash } from "node:crypto";
import { isJson, parseCommandResult, readCommandReceipt, receiptInvalid,
  type CommandActor, type CommandOperation, type CommandResultFor, type Json } from "./command-contracts";
import { prisma } from "./db";
import { DomainError } from "./errors";

export interface CommandContext {
  tx: Prisma.TransactionClient;
  /** Game row read (and locked) at the start of the command. */
  game: GameSession;
  /** Current (pre-increment) version. */
  version: number;
  /** Append one or more domain events; resolves to the assigned sequence. */
  appendEvent: (type: string, payload?: unknown) => Promise<number>;
}

export interface CommandResult<T> {
  result: T;
  /** Resulting game version after commit. */
  version: number;
  /** Last event sequence written (or -1 when a duplicate was returned). */
  sequence: number;
  /** True when this commandId had already been applied. */
  duplicate: boolean;
}

export interface TransactionResult<T> {
  result: T;
  version: number;
  sequence: number;
}

type Handler<T> = (ctx: CommandContext) => Promise<T>;

interface LockedGame {
  game: GameSession;
  appendEvent: (type: string, payload?: unknown) => Promise<number>;
  appendedCount: () => number;
  newVersion: () => number;
  finalSequence: () => number;
}

/** Acquire the game row lock and build the event-appending context. */
async function lockAndRead(
  tx: Prisma.TransactionClient,
  gameId: string,
  opts: { actor?: string; commandId?: string },
): Promise<LockedGame> {
  await tx.$queryRaw`SELECT id FROM game_sessions WHERE id = ${gameId} FOR UPDATE`;
  const game = await tx.gameSession.findUnique({ where: { id: gameId } });
  if (!game) {
    throw new DomainError("GAME_NOT_FOUND", `Game ${gameId} not found`);
  }

  let seq = game.eventSequence;
  let appended = 0;
  const appendEvent = async (type: string, payload?: unknown): Promise<number> => {
    seq += 1;
    appended += 1;
    await tx.domainEvent.create({
      data: {
        gameId,
        sequence: seq,
        gameVersion: game.version + 1,
        eventType: type,
        actor: opts.actor ?? null,
        commandId: opts.commandId ?? null,
        payload:
          payload === undefined ? undefined : (payload as Prisma.InputJsonValue),
      },
    });
    return seq;
  };

  return {
    game,
    appendEvent,
    appendedCount: () => appended,
    newVersion: () => game.version + 1,
    finalSequence: () => seq,
  };
}

async function commitVersion(
  tx: Prisma.TransactionClient,
  gameId: string,
  locked: LockedGame,
): Promise<void> {
  await tx.gameSession.update({
    where: { id: gameId },
    data: { version: locked.newVersion(), eventSequence: locked.finalSequence() },
  });
}

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export async function runCommand<O extends CommandOperation>({
  gameId,
  commandId,
  expectedVersion,
  actor,
  handler,
  operation,
  input,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
  actor: CommandActor;
  operation: O;
  input: unknown;
  handler: Handler<unknown>;
}): Promise<CommandResult<CommandResultFor<O>>> {
  if (!isJson(input)) throw new DomainError("COMMAND_RESULT_INVALID", "Command identity is invalid");
  const requestHash = createHash("sha256").update(canonical({ format: 1, operation, actor, input })).digest("hex");
  return prisma.$transaction(async (tx) => {
    const locked = await lockAndRead(tx, gameId, { actor, commandId });

    // Idempotency — checked under the lock so concurrent duplicate commandIds
    // serialize and the loser returns the original result.
    const existing = await tx.commandReceipt.findUnique({
      where: { gameId_commandId: { gameId, commandId } },
    });
    if (existing) {
      if (existing.actor !== null && existing.actor !== actor) throw new DomainError("FORBIDDEN", "Command identity is unavailable");
      // Historical and partially identified receipts can never establish input equivalence.
      if (!existing.operation || !existing.actor || !existing.requestHash || existing.resultVersion === null) receiptInvalid();
      readCommandReceipt(existing);
      if (existing.operation !== operation || existing.requestHash !== requestHash)
        throw new DomainError("DUPLICATE_COMMAND", "Command identity does not match this request");
      return {
        result: parseCommandResult(operation, existing.resultJson),
        version: existing.resultingVersion,
        sequence: -1,
        duplicate: true,
      };
    }

    if (locked.game.version !== expectedVersion) {
      throw new DomainError(
        "VERSION_CONFLICT",
        `Expected version ${expectedVersion} but game is at ${locked.game.version}`,
      );
    }

    const rawResult = await handler({
      tx,
      game: locked.game,
      version: locked.game.version,
      appendEvent: locked.appendEvent,
    });
    const result = parseCommandResult(operation, rawResult, true);

    if (locked.appendedCount() === 0) {
      throw new Error(
        `Command ${commandId} mutated state but appended no domain events`,
      );
    }

    await commitVersion(tx, gameId, locked);

    await tx.commandReceipt.create({
      data: {
        commandId,
        gameId,
        resultingVersion: locked.newVersion(),
        status: "APPLIED",
        operation,
        actor,
        resultVersion: 1,
        requestHash,
        resultJson: result as Prisma.InputJsonValue,
      },
    });

    return {
      result,
      version: locked.newVersion(),
      sequence: locked.finalSequence(),
      duplicate: false,
    };
  });
}

/**
 * Unversioned game transaction: locks the game, appends events, bumps version.
 * Callers that need idempotency must supply it themselves (e.g. the claim flow
 * is made idempotent via `PlayerClaim` single-use semantics, not a receipt).
 */
export async function runGameTransaction<T>({
  gameId,
  actor,
  commandId,
  handler,
}: {
  gameId: string;
  actor?: string;
  commandId?: string;
  handler: Handler<T>;
}): Promise<TransactionResult<T>> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockAndRead(tx, gameId, { actor, commandId });

    const result = await handler({
      tx,
      game: locked.game,
      version: locked.game.version,
      appendEvent: locked.appendEvent,
    });

    if (locked.appendedCount() === 0) {
      throw new Error(
        `Transaction ${commandId ?? "(unversioned)"} mutated state but appended no domain events`,
      );
    }

    await commitVersion(tx, gameId, locked);

    return {
      result,
      version: locked.newVersion(),
      sequence: locked.finalSequence(),
    };
  });
}
