import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { commandContracts, isJson, parseCommandResult, type CommandOperation } from "@/lib/command-contracts";

const meaningful: Partial<Record<CommandOperation, unknown[]>> = {
  addPlayer: [{ playerId: "player" }],
  issueClaimToken: [{ playerId: "player", claimId: "claim", expiresAt: "2026-11-09T00:00:00.000Z" }],
  generateSetup: [{ regenerationIndex: 0 }], commitSetup: [{ setupHash: "hash" }],
  startOperational: [{ actionCount: 0, cycleNumber: 1 }], nominate: [{ nominationId: "nomination" }],
  resolveExecution: [{ winner: null }, { winner: "GOOD" }, { winner: "EVIL" }],
  slayer: [{ winner: null }, { winner: null, decisionRequired: true }, { winner: "GOOD" }],
  resolveSlayerDecision: [{ winner: null }, { winner: "GOOD" }, { winner: "EVIL" }],
  closeInvestigation: [{ winner: null }, { winner: "GOOD" }, { winner: "EVIL" }],
  scanQr: [{ outcome: { discoveries: ["clue"], tasks: ["task"], conditions: ["condition"], mapVersionId: null } }],
  createCheckpoint: [{ checkpointId: "checkpoint" }],
};

// This is an intent-coverage audit, not inferred from the production catalog:
// dropping a URL ID/payload field must fail even if the output schema is empty.
const bindings: Record<CommandOperation, string[]> = {
  renameGame: ["name", "normalizeGameName"], setParticipantKind: ["playerId", "participantKind"],
  addPlayer: ["displayName", "normalizeDisplayName"], updatePlayer: ["playerId", "displayName", "normalizeDisplayName"],
  removePlayer: ["playerId"], reorderPlayers: ["orderedPlayerIds"], issueClaimToken: ["playerId"],
  generateSetup: ["seedSupplied", "seed"], commitSetup: [], acknowledgeRole: [], startOperational: [],
  submitAction: ["actionId", "targetPlayerIds"], resolveAction: ["actionId", "resolutionSupplied", "resolution"], completeOperational: [],
  openNominations: [], closeNominations: [], nominate: ["nomineeId"], resolveNominationTrigger: ["nominationId", "optionId"],
  voteIntent: ["nominationId", "intent"], startVotingPass: ["nominationId"], advanceVotingPass: ["nominationId"], lockVote: ["nominationId"],
  resolveExecution: [], exileTraveller: ["playerId"], slayer: ["targetPlayerId"], resolveSlayerDecision: ["slayerPlayerId", "optionId"],
  closeInvestigation: [], scanQr: ["tokenDigest", "createHash", "token"], storytellerRevealClue: ["clueId", "targetSupplied", "targetPlayerId"],
  storytellerCompleteTask: ["taskId"], storytellerSetStage: ["stageId"], storytellerSetMap: ["mapVersionId"],
  storytellerSetCondition: ["conditionId", "active"], createCheckpoint: ["reasonSupplied", "reason"],
  resetPlayerAccess: ["playerId"], recoveryOverride: ["payload", "trimmedReason"],
};
const playerOperations = new Set(["acknowledgeRole", "submitAction", "nominate", "voteIntent", "slayer", "scanQr"]);

describe("durable command contracts", () => {
  for (const operation of Object.keys(commandContracts) as CommandOperation[]) {
    it(`${operation} accepts its branches and refuses extra fields and non-JSON`, () => {
      for (const value of meaningful[operation] ?? [{}]) {
        expect(parseCommandResult(operation, value, true)).toEqual(value);
        expect(() => parseCommandResult(operation, { ...value as object, privateMarker: "secret" }, true))
          .toThrowError(expect.objectContaining({ code: "COMMAND_RESULT_INVALID" }));
      }
      for (const value of [undefined, null, NaN, Infinity, new Date(), BigInt(1), { field: undefined }]) {
        expect(() => parseCommandResult(operation, value, true)).toThrowError(expect.objectContaining({ code: "COMMAND_RESULT_INVALID" }));
      }
    });
  }
  it("refuses silent JSON alteration, cycles and sparse arrays", () => {
    const cyclic: unknown[] = []; cyclic.push(cyclic);
    const getter = Object.defineProperty({}, "secret", { enumerable: true, get() { throw new Error("must not execute"); } });
    for (const value of [cyclic, new Array(2), getter, { [Symbol("secret")]: 1 }, new Map(), { nested: new Date() }]) expect(isJson(value)).toBe(false);
  });

  it("audits all 36 production producers for explicit catalog operation, actor and intent", () => {
    const found: string[] = [];
    for (const moduleName of ["game-session", "setup", "operational", "investigation", "scenario", "recovery"]) {
      const file = path.join(process.cwd(), `src/modules/${moduleName}/${moduleName}.service.ts`);
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "runCommand") {
          const arg = node.arguments[0];
          expect(ts.isObjectLiteralExpression(arg)).toBe(true);
          if (!ts.isObjectLiteralExpression(arg)) throw new Error("Missing explicit descriptor");
          const properties = new Map(arg.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source), p.initializer]));
          expect(properties.has("actor")).toBe(true);
          expect(properties.has("input")).toBe(true);
          expect(properties.has("resultSchema")).toBe(false);
          const op = properties.get("operation");
          if (!op || !ts.isStringLiteral(op)) throw new Error("Operation must be statically auditable");
          expect(Object.hasOwn(commandContracts, op.text)).toBe(true);
          const operation = op.text as CommandOperation;
          const input = properties.get("input")!.getText(source);
          for (const field of bindings[operation]) expect(input).toMatch(new RegExp(`\\b${field}\\b`));
          if (!bindings[operation].length) expect(input).toBe("{}");
          if (operation === "issueClaimToken" || operation === "resetPlayerAccess") expect(input).toBe("{ playerId }");
          const actor = properties.get("actor")!.getText(source);
          expect(actor.startsWith("`player:")).toBe(playerOperations.has(operation));
          if (!playerOperations.has(operation)) expect(actor).toBe('"storyteller"');
          found.push(op.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toHaveLength(36);
    expect(found.sort()).toEqual(Object.keys(commandContracts).sort());
  });
});
