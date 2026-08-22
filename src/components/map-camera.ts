// Map camera math (docs/map-reveal-system-spec.md §4, §9).
//
// The canonical canvas is 1448×1086 (aspect 4:3) — in normalized units the
// world is 1 × 0.75. The camera is a crop rect in normalized canvas coords;
// the crop always preserves the canvas aspect because the viewport element
// adopts the crop's pixel aspect (see MapCard). Pure functions only — no
// React, no DOM — so they stay unit-testable.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WorldBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** Natural (unscaled) canvas size of the production map assets. */
export const CANVAS_WIDTH = 1448;
export const CANVAS_HEIGHT = 1086;
export const CANVAS_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT; // 4:3

/** Whole authored canvas in normalized coords. */
export const FULL_VIEW: Rect = { x0: 0, y0: 0, x1: 1, y1: 0.75 };

/**
 * Initial framing: the main property only. Tuned against the production
 * assets (the base artwork's organic seam sits at x≈0.45; property content
 * spans x∈[0.44, 0.96], y∈[0.07, 0.62]). A little fog margin stays visible on
 * the west edge so the composition reads as a complete sheet, not a crop.
 * Spec step 14: revisit with a final visual pass.
 */
export const INITIAL_VIEW: Rect = { x0: 0.42, y0: 0.05, x1: 0.96, y1: 0.72 };

/** Pan/zoom clamps before the reveal — the camera must never wander into the
 *  hidden western world or far off the property (spec §9). */
export const PRE_WORLD: WorldBounds = { xMin: 0.34, yMin: 0.02, xMax: 0.98, yMax: 0.75 };
export const PRE_MIN_SCALE = 1; // == INITIAL_VIEW framing (no zoom-out)
export const PRE_MAX_SCALE = 2.5;

/** After the reveal the whole authored map is fair game. */
export const POST_WORLD: WorldBounds = { xMin: 0, yMin: 0, xMax: 1, yMax: 0.75 };
export const POST_MIN_SCALE = 1; // == FULL_VIEW framing
export const POST_MAX_SCALE = 3;

export function rectWidth(rect: Rect): number {
  return rect.x1 - rect.x0;
}

export function rectHeight(rect: Rect): number {
  return rect.y1 - rect.y0;
}

/** Camera zoom scale relative to the natural 1:1 canvas render. */
export function rectScale(rect: Rect): number {
  return 1 / rectWidth(rect);
}

export function rectAspect(rect: Rect): number {
  return (rectWidth(rect) * CANVAS_WIDTH) / (rectHeight(rect) * CANVAS_HEIGHT);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp a camera rect so it stays inside the given world bounds and within
 * the allowed zoom range. Pan (translation) is clamped first; when the rect
 * is larger than the world it is centered instead. The rect's own aspect is
 * always preserved (zooming scales width and height together).
 */
export function clampRect(rect: Rect, world: WorldBounds, minScale: number, maxScale: number): Rect {
  const aspect = rectWidth(rect) === 0 ? CANVAS_ASPECT : rectHeight(rect) / rectWidth(rect);
  let { x0, y0, x1, y1 } = rect;

  // Zoom clamp: adjust size about the rect center, preserving the aspect.
  const maxWidth = 1 / minScale;
  const minWidth = 1 / maxScale;
  const width = clamp(rectWidth(rect), minWidth, maxWidth);
  const height = width * aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = cx - width / 2;
  x1 = cx + width / 2;
  y0 = cy - height / 2;
  y1 = cy + height / 2;

  // Pan clamp.
  const worldW = world.xMax - world.xMin;
  const worldH = world.yMax - world.yMin;
  if (width >= worldW) {
    const c = (world.xMin + world.xMax) / 2;
    x0 = c - width / 2;
    x1 = c + width / 2;
  } else {
    x0 = clamp(x0, world.xMin, world.xMax - width);
    x1 = x0 + width;
  }
  if (height >= worldH) {
    const c = (world.yMin + world.yMax) / 2;
    y0 = c - height / 2;
    y1 = c + height / 2;
  } else {
    y0 = clamp(y0, world.yMin, world.yMax - height);
    y1 = y0 + height;
  }

  return { x0, y0, x1, y1 };
}

/**
 * Zoom a rect about a focal point (normalized canvas coords), then clamp.
 * `factor > 1` zooms in.
 */
export function zoomRectAbout(
  rect: Rect,
  fx: number,
  fy: number,
  factor: number,
  world: WorldBounds,
  minScale: number,
  maxScale: number,
): Rect {
  const width = rectWidth(rect) / factor;
  const height = rectHeight(rect) / factor;
  // Keep the focal point stationary: its relative position in the rect is fixed.
  const rx = (fx - rect.x0) / rectWidth(rect);
  const ry = (fy - rect.y0) / rectHeight(rect);
  const next: Rect = {
    x0: fx - width * rx,
    y0: fy - height * ry,
    x1: fx + width * (1 - rx),
    y1: fy + height * (1 - ry),
  };
  return clampRect(next, world, minScale, maxScale);
}

/** Pan a rect by normalized delta (positive delta moves the camera east/south). */
export function panRect(rect: Rect, dx: number, dy: number, world: WorldBounds, minScale: number, maxScale: number): Rect {
  return clampRect(
    { x0: rect.x0 + dx, y0: rect.y0 + dy, x1: rect.x1 + dx, y1: rect.y1 + dy },
    world,
    minScale,
    maxScale,
  );
}

export interface RectCss {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  aspect: number;
}

/**
 * CSS geometry for `.map-world` inside the viewport. The world keeps the
 * canvas's 4:3 ratio exactly; the viewport element adopts `aspect` so the
 * crop fills it with no distortion or letterboxing.
 */
export function rectToCss(rect: Rect): RectCss {
  const widthPct = 100 / rectWidth(rect);
  const heightPct = 100 / rectHeight(rect);
  return {
    leftPct: -(rect.x0 / rectWidth(rect)) * 100,
    topPct: -(rect.y0 / rectHeight(rect)) * 100,
    widthPct,
    heightPct,
    aspect: rectAspect(rect),
  };
}

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * RequestAnimationFrame tween between two rects. Honors reduced motion by
 * jumping straight to the destination. Returns a cancel function.
 */
export function tweenRect(
  from: Rect,
  to: Rect,
  durationMs: number,
  onFrame: (rect: Rect) => void,
  onDone: () => void,
  reducedMotion: boolean,
): () => void {
  if (reducedMotion || durationMs <= 0) {
    onFrame(to);
    onDone();
    return () => undefined;
  }

  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  let raf = 0;
  let finished = false;

  const step = (now: number) => {
    if (finished) return;
    const t = Math.min(1, (now - start) / durationMs);
    const e = easeInOutCubic(t);
    onFrame({
      x0: from.x0 + (to.x0 - from.x0) * e,
      y0: from.y0 + (to.y0 - from.y0) * e,
      x1: from.x1 + (to.x1 - from.x1) * e,
      y1: from.y1 + (to.y1 - from.y1) * e,
    });
    if (t >= 1) {
      finished = true;
      onDone();
      return;
    }
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    finished = true;
    cancelAnimationFrame(raf);
  };
}
