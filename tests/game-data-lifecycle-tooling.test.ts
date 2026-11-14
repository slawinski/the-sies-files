import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArguments, operatorTarget } from "../scripts/game-data-lifecycle.mjs";
import { privatePath, writePrivate, readPrivate } from "../scripts/game-data-journal.mjs";
import { families, canonical } from "../scripts/game-data-policy.mjs";

it("requires explicit local target credentials from only the named environment variable", () => {
  expect(operatorTarget("postgresql://operator@127.0.0.1:5432/real_app", {}).database).toBe("real_app");
  for (const raw of [undefined, "postgresql://operator@remote/app", "postgresql://operator@localhost/app?host=remote", "postgresql://operator:secret@localhost/app", "postgresql://operator@localhost/app#x", "postgresql://operator@localhost/a/b", "postgresql://operator@localhost/postgres"]) {
    expect(() => operatorTarget(raw, { DATABASE_URL: "postgresql://operator@localhost/ambient" })).toThrow();
  }
  const target = operatorTarget("postgresql://operator@localhost:55499/app", { GAME_DATA_PASSWORD: "sentinel" });
  expect(target.url).toContain("sentinel");
  expect(target.host).toBe("127.0.0.1");
});

it("requires independent evidence and explicit unserved staging for restore-check", () => {
  expect(parseArguments(["restore-check", "--database", "postgresql://operator@127.0.0.1:55499/staging_test", "--evidence", "/private/custody.json", "--unserved-staging"])).toEqual({ mode: "restore-check", options: { database: "postgresql://operator@127.0.0.1:55499/staging_test", evidence: "/private/custody.json", unservedStaging: true } });
});

it("does not accept ambiguous CLI inputs", () => {
  for (const args of [[], ["restore-check"], ["apply", "--database", "a", "--database", "b"], ["plan", "--force"], ["apply", "--stopped-application", "yes"]]) {
    expect(() => parseArguments(args)).toThrow();
  }
});

it("classifies exactly 22 owned families and hashes JSON independent of key insertion order", () => {
  expect(families).toHaveLength(22);
  expect(new Set(families.map(f => f.table)).size).toBe(22);
  expect(canonical({ b: [1, { z: 2, a: null }], a: "x" })).toBe(canonical({ a: "x", b: [1, { a: null, z: 2 }] }));
});

it("refuses unsafe ancestors, symlinks, public files and collisions without overwriting", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "item7-u3-path-"));
  fs.chmodSync(dir, 0o700);
  try {
    const file = path.join(dir, "plan.json");
    privatePath(file);
    writePrivate(file, { sentinel: "private" });
    expect(readPrivate(file)).toEqual({ sentinel: "private" });
    expect(() => writePrivate(file, {})).toThrow();
    fs.symlinkSync(file, path.join(dir, "link"));
    expect(() => readPrivate(path.join(dir, "link"))).toThrow();
    fs.symlinkSync(dir, path.join(dir, "parent-link"));
    expect(() => privatePath(path.join(dir, "parent-link", "x"))).toThrow();
    fs.chmodSync(file, 0o644);
    expect(() => readPrivate(file)).toThrow();
    fs.chmodSync(dir, 0o777);
    expect(() => privatePath(path.join(dir, "x"))).toThrow();
  } finally { fs.rmSync(dir, { recursive: true }); }
});
