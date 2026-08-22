#!/usr/bin/env node
// Map asset pipeline (docs/map-reveal-system-spec.md §3, §15, §18).
//
// Regenerates the production WebP derivatives from the canonical source PNGs:
//
//   assets/maps/sieski/the-sies-files-map-base.png        → public/maps/sieski/map-base-<hash>.webp      (public, opaque)
//   assets/maps/sieski/the-sies-files-map-west-reveal.png → assets/maps/sieski/map-west-reveal-<hash>.webp (protected, alpha)
//
// Names are content-hashed so the base map can be served with
// `Cache-Control: public, max-age=31536000, immutable` and the protected
// reveal asset never needs a guessable URL. The hash constants are then
// mirrored in `src/modules/map/assets.ts`.
//
// Requires: cwebp (https://developers.google.com/speed/webp). Run:
//   node scripts/build-map-assets.mjs

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = {
  base: join(root, "assets/maps/sieski/the-sies-files-map-base.png"),
  west: join(root, "assets/maps/sieski/the-sies-files-map-west-reveal.png"),
};
const targets = {
  base: join(root, "public/maps/sieski"),
  west: join(root, "assets/maps/sieski"),
};

function fail(message) {
  console.error(`[map-assets] ${message}`);
  process.exit(1);
}

function hashOf(file) {
  return createHash("sha256").update(execFileSync("shasum", ["-a", "256", file], { encoding: "utf8" })).digest("hex").slice(0, 12);
}

function build(input, outDir, args, label) {
  if (!existsSync(input)) fail(`missing source asset: ${input}`);
  mkdirSync(outDir, { recursive: true });
  const temp = join(outDir, `.${label}.tmp.webp`);
  execFileSync("cwebp", [...args, input, "-o", temp], { stdio: "inherit" });
  const hash = hashOf(temp);
  const final = join(outDir, `${label}-${hash}.webp`);
  renameSync(temp, final);
  console.log(`[map-assets] ${label} → ${final} (${hash})`);
  return final;
}

try {
  build(sources.base, targets.base, ["-quiet", "-q", "85", "-mt"], "map-base");
  build(sources.west, targets.west, ["-quiet", "-q", "85", "-alpha_q", "90", "-mt"], "map-west-reveal");
  console.log("[map-assets] done — update src/modules/map/assets.ts if hashes changed.");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
