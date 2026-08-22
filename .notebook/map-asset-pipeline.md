# Map Asset Pipeline
> Content-hashed WebP derivatives; public vs protected placement

Entry: `scripts/build-map-assets.mjs`

- Source PNGs (authoring truth, 1448×1086, all identical canvas):
  `assets/maps/sieski/the-sies-files-map-{master,base,west-reveal}.png`
- Derived: `public/maps/sieski/map-base-<sha12>.webp` (public, immutable via
  `/maps/:path*` header rule) and `assets/maps/sieski/map-west-reveal-<sha12>.webp`
  (protected — served only by the authorized route handler).
- Hash constants mirrored in `src/modules/map/assets.ts`; regenerating changes
  them (script prints a reminder).
- cwebp: `-q 85 -mt` (opaque), `-q 85 -alpha_q 90 -mt` (alpha).
- Validation in `tests/map-system.test.ts` — parses PNG IHDR / WebP VP8·VP8L·VP8X
  headers for dimension equality + asserts no `reveal|master|extended` file
  under `public/`.
- Artwork facts (from pixel analysis): seam ≈ x 0.45 (organic), west fog
  high-pass correlation with master ≈ 0.03 (no leaked detail), reveal alpha
  bbox x 0.011–0.546, y 0.259–0.77; base+reveal composite ≠ master exactly
  (authoring variance — not required by acceptance).

Updated: 2026-08-22
