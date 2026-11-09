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
    for (const module of ["game-session", "setup", "operational", "investigation", "scenario", "recovery"]) {
      const file = path.join(process.cwd(), `src/modules/${module}/${module}.service.ts`);
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
