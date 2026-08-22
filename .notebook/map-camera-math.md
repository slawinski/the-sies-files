# Map Camera Math
> Normalized 1×0.75 world, crop-rect camera, aspect invariants

Entry: `src/components/map-camera.ts`

- Canonical canvas 1448×1086 → normalized world 1 × 0.75 (y1 max = 0.75).
- Camera = crop rect {x0,y0,x1,y1}; `.map-viewport` adopts the crop's PIXEL
  aspect inline (`aspect-ratio: (x1-x0)*1448 / ((y1-y0)*1086)`) so the crop
  fills the viewport with no distortion/letterboxing.
- `.map-world` CSS: width 100/(x1-x0)%, height 100/(y1-y0)%, left
  -x0/(x1-x0)*100%, top -y0/(y1-y0)*100% → world always renders at exactly 4:3.
- Invariants (unit-tested): world px aspect = css.aspect × (y1-y0)/(x1-x0) = 4/3;
  zoomRectAbout keeps the focal stationary while unclamped; clampRect preserves
  the rect's own aspect (height = width × rectAspect, NOT width/CANVAS_ASPECT —
  that's the bug this module once had).
- Frames: INITIAL {0.42,0.05,0.96,0.72}, FULL {0,0,1,0.75}; pre bounds
  {0.34,0.02,0.98,0.75} scale 1–2.5; post = canvas, scale 1–3.
- POIs: normalized {x,y} → left/top % inside the world (resolution-independent).

Updated: 2026-08-22
