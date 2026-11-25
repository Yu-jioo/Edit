import { PointsCameraMode, PointsStyleId, StyleCustomization } from '../types';
import { clamp, easeInOutCubic, lerp, PointsSceneSchedule } from '../utils/math';

export const DEFAULT_POINTS_CAMERA: PointsCameraMode = 'off';
export const DEFAULT_POINTS_CAMERA_ZOOM = 1.3;
export const POINTS_CAMERA_MIN_ZOOM = 1.1;
export const POINTS_CAMERA_MAX_ZOOM = 1.6;
export const POINTS_CAMERA_GLIDE_SEC = 0.8;
export const POINTS_CAMERA_END_HOLD_BEFORE_PULLBACK_SEC = 0.6;
export const POINTS_CAMERA_PULLBACK_SEC = 1.0;
export const POINTS_CAMERA_MIN_FULL_VIEW_SEC = 1.5;

export interface PointsCameraBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointsCameraItemBox extends PointsCameraBox {
  startTime: number;
  revealEnd: number;
}

export interface PointsCameraTransform {
  active: boolean;
  scale: number;
  focusX: number;
  focusY: number;
  viewportCenterX: number;
  viewportCenterY: number;
  pullBackStart: number;
  pullBackEnd: number;
}

/**
 * Resolves Points camera mode; always disabled ('off') in pts_ranking (single item on stage).
 */
export function resolvePointsCameraMode(
  custom?: Partial<StyleCustomization> | null,
  styleId?: PointsStyleId
): PointsCameraMode {
  const effectiveStyle = styleId ?? custom?.pointsStyleId ?? (custom?.styleId as PointsStyleId | undefined);
  if (effectiveStyle === 'pts_ranking') {
    return 'off';
  }
  const raw = custom?.pointsCamera;
  if (raw === 'follow' || raw === 'auto' || raw === 'off') {
    return raw;
  }
  return DEFAULT_POINTS_CAMERA;
}

/**
 * Resolves Points camera zoom multiplier (1.1 - 1.6x, default 1.3).
 */
export function resolvePointsCameraZoom(
  custom?: Partial<StyleCustomization> | null
): number {
  const raw = custom?.pointsCameraZoom;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(raw, POINTS_CAMERA_MIN_ZOOM, POINTS_CAMERA_MAX_ZOOM);
  }
  return DEFAULT_POINTS_CAMERA_ZOOM;
}

/**
 * Determines whether the deterministic Points camera should activate for the current layout.
 * - 'follow': always active (except pts_ranking).
 * - 'auto': activates only when full list forces text below the style's minimum font size.
 * - 'off': never active.
 */
export function isPointsCameraActive(
  custom: Partial<StyleCustomization> | undefined,
  styleId: PointsStyleId,
  belowMinFont: boolean
): boolean {
  const mode = resolvePointsCameraMode(custom, styleId);
  if (mode === 'follow') return true;
  if (mode === 'auto') return Boolean(belowMinFont);
  return false;
}

/**
 * Returns the 6% safe-area box for a canvas of size (frameW x frameH).
 */
export function computeSafeFrameBox(frameW: number, frameH: number): PointsCameraBox {
  const mx = Math.round(frameW * 0.06);
  const my = Math.round(frameH * 0.06);
  return {
    x: mx,
    y: my,
    w: Math.max(120, frameW - mx * 2),
    h: Math.max(120, frameH - my * 2),
  };
}

/**
 * Computes the intersection of two boxes (falling back to the primary box if disjoint).
 */
export function intersectCameraBoxes(
  a: PointsCameraBox,
  b: PointsCameraBox
): PointsCameraBox {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 - x1 >= 80 && y2 - y1 >= 80) {
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  return a;
}

/**
 * Computes the union bounding box of a non-empty array of boxes.
 */
export function computeUnionBox(boxes: PointsCameraBox[]): PointsCameraBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.w <= 0 || b.h <= 0) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: 100, h: 100 };
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

/**
 * Deterministic pan/zoom camera for Multi Points ("نقاط") mode.
 * - Pure deterministic function of t.
 * - Glides (easeInOutCubic, ~0.8s) to frame each item (with its marker and a touch of the previous item)
 *   as it starts appearing, holds while it appears, moves to the next, and pulls back to the full list
 *   ONLY after the last item finishes appearing (hold ~0.6s, ease out ~1.0s, full-view hold >= 1.5s).
 * - Clamps scale & focus so no framed item is ever cut off and the 6% safe margin is respected.
 */
export function samplePointsCamera(params: {
  items: PointsCameraItemBox[];
  fullBounds: PointsCameraBox;
  viewportBox: PointsCameraBox;
  frameW: number;
  frameH: number;
  schedule: PointsSceneSchedule;
  zoom: number;
  t: number;
  active: boolean;
  titleBox?: PointsCameraBox | null;
}): PointsCameraTransform {
  const {
    items,
    fullBounds,
    viewportBox,
    frameW,
    frameH,
    schedule,
    zoom,
    t,
    active,
    titleBox,
  } = params;

  const safeBox = computeSafeFrameBox(frameW, frameH);
  const effBox = intersectCameraBoxes(viewportBox, safeBox);
  const vpCx = effBox.x + effBox.w * 0.5;
  const vpCy = effBox.y + effBox.h * 0.5;

  const pullBackStart =
    schedule.pullBackStart ??
    Number((schedule.lastItemRevealEnd + POINTS_CAMERA_END_HOLD_BEFORE_PULLBACK_SEC).toFixed(3));
  const pullBackEnd =
    schedule.pullBackEnd ??
    Number((pullBackStart + POINTS_CAMERA_PULLBACK_SEC).toFixed(3));

  if (!active || items.length === 0) {
    return {
      active: false,
      scale: 1,
      focusX: vpCx,
      focusY: vpCy,
      viewportCenterX: vpCx,
      viewportCenterY: vpCy,
      pullBackStart,
      pullBackEnd,
    };
  }

  const targetZoom = clamp(zoom, POINTS_CAMERA_MIN_ZOOM, POINTS_CAMERA_MAX_ZOOM);

  // Computes a clamped camera view framing targetRect inside effBox with guaranteed zero cutoff
  const frameRect = (
    targetRect: PointsCameraBox,
    maxScale: number,
    padPx: number,
    clampToFull: boolean
  ): { focusX: number; focusY: number; scale: number } => {
    const reqW = Math.max(60, targetRect.w + padPx * 2);
    const reqH = Math.max(40, targetRect.h + padPx * 2);
    const fitScale = Math.min(effBox.w / reqW, effBox.h / reqH);
    const scale = clamp(Math.min(maxScale, fitScale), 0.55, maxScale);

    const halfVisW = (effBox.w * 0.5) / scale;
    const halfVisH = (effBox.h * 0.5) / scale;

    let focusX = targetRect.x + targetRect.w * 0.5;
    let focusY = targetRect.y + targetRect.h * 0.5;

    if (clampToFull) {
      const fbPad = 14;
      const fullLeft = fullBounds.x - fbPad;
      const fullRight = fullBounds.x + fullBounds.w + fbPad;
      const fullTop = fullBounds.y - fbPad;
      const fullBottom = fullBounds.y + fullBounds.h + fbPad;

      if (fullRight - fullLeft > halfVisW * 2) {
        const minFx = fullLeft + halfVisW;
        const maxFx = fullRight - halfVisW;
        focusX = clamp(focusX, minFx, maxFx);
      } else {
        focusX = (fullLeft + fullRight) * 0.5;
      }

      if (fullBottom - fullTop > halfVisH * 2) {
        const minFy = fullTop + halfVisH;
        const maxFy = fullBottom - halfVisH;
        focusY = clamp(focusY, minFy, maxFy);
      } else {
        focusY = (fullTop + fullBottom) * 0.5;
      }

      // Hard guarantee: targetRect + padPx is NEVER clipped out of effBox
      const reqMinFx = targetRect.x + targetRect.w + padPx - halfVisW;
      const reqMaxFx = targetRect.x - padPx + halfVisW;
      if (reqMinFx <= reqMaxFx) {
        focusX = clamp(focusX, reqMinFx, reqMaxFx);
      } else {
        focusX = targetRect.x + targetRect.w * 0.5;
      }

      const reqMinFy = targetRect.y + targetRect.h + padPx - halfVisH;
      const reqMaxFy = targetRect.y - padPx + halfVisH;
      if (reqMinFy <= reqMaxFy) {
        focusY = clamp(focusY, reqMinFy, reqMaxFy);
      } else {
        focusY = targetRect.y + targetRect.h * 0.5;
      }
    }

    return { focusX, focusY, scale };
  };

  // Full list view (wide shot at end hold)
  const fullView = frameRect(fullBounds, 1.0, 10, false);

  // Per-item view: frames item i (with its marker) plus a gentle slice of the previous item
  const itemViews = items.map((item, idx) => {
    let cluster: PointsCameraBox = {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    };

    if (idx > 0) {
      const prev = items[idx - 1];
      // Blend ~26% of the previous item's adjacent edge so a hint of the previous item stays visible
      const prevCx = prev.x + prev.w * 0.5;
      const prevCy = prev.y + prev.h * 0.5;
      const curCx = item.x + item.w * 0.5;
      const curCy = item.y + item.h * 0.5;
      const dy = Math.abs(curCy - prevCy);
      const dx = Math.abs(curCx - prevCx);

      if (dy >= dx * 0.5) {
        // Primarily vertical stacking: include bottom ~26% of previous item
        const peekH = Math.min(prev.h * 0.34, Math.max(16, item.h * 0.28));
        const peekY = prevCy < curCy ? prev.y + prev.h - peekH : prev.y;
        cluster = computeUnionBox([
          cluster,
          { x: prev.x, y: peekY, w: prev.w, h: peekH },
        ]);
      } else {
        // Primarily horizontal layout (e.g. timeline or horizontal cards): include adjacent ~24% of previous item
        const peekW = Math.min(prev.w * 0.3, Math.max(20, item.w * 0.24));
        const peekX = prevCx > curCx ? prev.x : prev.x + prev.w - peekW;
        cluster = computeUnionBox([
          cluster,
          { x: peekX, y: prev.y, w: peekW, h: prev.h },
        ]);
      }
    } else if (titleBox && titleBox.w > 0 && titleBox.h > 0) {
      // For item 0, include bottom slice of optional title for visual continuity
      const peekH = Math.min(titleBox.h, Math.max(18, titleBox.h * 0.5));
      cluster = computeUnionBox([
        cluster,
        {
          x: titleBox.x,
          y: titleBox.y + titleBox.h - peekH,
          w: titleBox.w,
          h: peekH,
        },
      ]);
    }

    return frameRect(cluster, targetZoom, 18, true);
  });

  // Initial intro view before item 0 starts appearing
  const introView =
    titleBox && titleBox.w > 0 && titleBox.h > 0
      ? frameRect(titleBox, Math.min(targetZoom, 1.24), 22, true)
      : {
          focusX: lerp(fullView.focusX, itemViews[0].focusX, 0.72),
          focusY: lerp(fullView.focusY, itemViews[0].focusY, 0.72),
          scale: lerp(fullView.scale, itemViews[0].scale, 0.72),
        };

  interface CamKeyframe {
    time: number;
    focusX: number;
    focusY: number;
    scale: number;
  }

  const keys: CamKeyframe[] = [{ time: 0, ...introView }];

  const pushKey = (time: number, view: { focusX: number; focusY: number; scale: number }) => {
    const prev = keys[keys.length - 1];
    const safeT = Math.max(prev.time + 0.002, time);
    keys.push({ time: safeT, ...view });
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const iv = itemViews[i];
    const nextStart = i + 1 < items.length ? items[i + 1].startTime : pullBackStart;

    const moveStart = i === 0 ? Math.max(0.06, item.startTime - 0.16) : item.startTime;
    const prevView = i === 0 ? introView : itemViews[i - 1];
    if (moveStart > keys[keys.length - 1].time + 0.01) {
      pushKey(moveStart, prevView);
    }

    const availSpan = Math.max(0.16, nextStart - moveStart);
    const glideDur = Math.min(POINTS_CAMERA_GLIDE_SEC, availSpan * 0.76);
    const arriveT = moveStart + glideDur;
    pushKey(arriveT, iv);

    // Stay on item i while it appears until next item starts (or pullBackStart for the last item)
    const holdUntil = i + 1 < items.length ? nextStart : pullBackStart;
    if (holdUntil > arriveT + 0.01) {
      pushKey(holdUntil, iv);
    }
  }

  // Pull back to full list ONLY after the last item finishes appearing + ~0.6s hold
  const effectivePullStart = Math.max(keys[keys.length - 1].time, pullBackStart);
  if (effectivePullStart > keys[keys.length - 1].time + 0.005) {
    pushKey(effectivePullStart, itemViews[itemViews.length - 1]);
  }
  const effectivePullEnd = Math.max(effectivePullStart + 0.25, pullBackEnd);
  pushKey(effectivePullEnd, fullView);
  pushKey(Math.max(effectivePullEnd + 0.5, schedule.totalDuration + 1), fullView);

  // Piecewise easeInOutCubic sampling
  if (t <= keys[0].time) {
    return {
      active: true,
      scale: keys[0].scale,
      focusX: keys[0].focusX,
      focusY: keys[0].focusY,
      viewportCenterX: vpCx,
      viewportCenterY: vpCy,
      pullBackStart: effectivePullStart,
      pullBackEnd: effectivePullEnd,
    };
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (t >= k0.time && t <= k1.time) {
      const span = Math.max(0.001, k1.time - k0.time);
      const u = easeInOutCubic(clamp((t - k0.time) / span, 0, 1));
      return {
        active: true,
        scale: lerp(k0.scale, k1.scale, u),
        focusX: lerp(k0.focusX, k1.focusX, u),
        focusY: lerp(k0.focusY, k1.focusY, u),
        viewportCenterX: vpCx,
        viewportCenterY: vpCy,
        pullBackStart: effectivePullStart,
        pullBackEnd: effectivePullEnd,
      };
    }
  }

  return {
    active: true,
    scale: fullView.scale,
    focusX: fullView.focusX,
    focusY: fullView.focusY,
    viewportCenterX: vpCx,
    viewportCenterY: vpCy,
    pullBackStart: effectivePullStart,
    pullBackEnd: effectivePullEnd,
  };
}

export const DEFAULT_CAMERA_EDGE_FEATHER_RATIO = 0.048;

let cachedFeatherCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let cachedFeatherCtx:
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null = null;
let featherLayerInUse = false;

function acquireCachedFeatherLayer(
  pixelW: number,
  pixelH: number
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} | null {
  if (featherLayerInUse) return null;
  const w = clamp(Math.round(pixelW), 1, 4096);
  const h = clamp(Math.round(pixelH), 1, 4096);

  if (cachedFeatherCanvas && cachedFeatherCtx) {
    if (cachedFeatherCanvas.width !== w || cachedFeatherCanvas.height !== h) {
      cachedFeatherCanvas.width = w;
      cachedFeatherCanvas.height = h;
    }
    return { canvas: cachedFeatherCanvas, ctx: cachedFeatherCtx };
  }

  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d');
      if (cctx) {
        cachedFeatherCanvas = c;
        cachedFeatherCtx = cctx;
        return { canvas: c, ctx: cctx };
      }
    }
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(w, h);
      const octx = oc.getContext('2d');
      if (octx) {
        cachedFeatherCanvas = oc;
        cachedFeatherCtx = octx;
        return { canvas: oc, ctx: octx };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function resolveEffectiveCanvasScale(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fallbackScale?: number
): { sx: number; sy: number } {
  if (typeof ctx.getTransform === 'function') {
    try {
      const m = ctx.getTransform();
      const sx = Math.hypot(m.a, m.b);
      const sy = Math.hypot(m.c, m.d);
      if (Number.isFinite(sx) && sx > 0.05 && Number.isFinite(sy) && sy > 0.05) {
        return { sx, sy };
      }
    } catch {
      // Fallback below
    }
  }
  const s = fallbackScale && fallbackScale > 0.05 ? fallbackScale : 1;
  return { sx: s, sy: s };
}

/**
 * Applies a silky 4-edge alpha fade along the outer `featherRatio` of the full screen (0..frameW, 0..frameH)
 * using destination-in compositing so content dissolves smoothly into any backdrop near the screen edges.
 * Stays strictly outside the 6% safe margin (4.8% < 6%) so framed active items remain 100% opaque.
 */
export function applyScreenEdgeFeatherMask(
  layerCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frameW: number,
  frameH: number,
  featherRatio: number = DEFAULT_CAMERA_EDGE_FEATHER_RATIO
): void {
  const featherPx = Math.max(12, Math.round(Math.min(frameW, frameH) * clamp(featherRatio, 0.01, 0.12)));
  const rx = clamp(featherPx / Math.max(1, frameW), 0.005, 0.25);
  const ry = clamp(featherPx / Math.max(1, frameH), 0.005, 0.25);

  layerCtx.save();
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.globalAlpha = 1;
  layerCtx.shadowBlur = 0;

  // Horizontal smooth S-curve fade (left & right screen edges)
  const hGrad = layerCtx.createLinearGradient(0, 0, frameW, 0);
  hGrad.addColorStop(0, 'rgba(0,0,0,0)');
  hGrad.addColorStop(rx * 0.25, 'rgba(0,0,0,0.18)');
  hGrad.addColorStop(rx * 0.6, 'rgba(0,0,0,0.68)');
  hGrad.addColorStop(rx, 'rgba(0,0,0,1)');
  hGrad.addColorStop(1 - rx, 'rgba(0,0,0,1)');
  hGrad.addColorStop(1 - rx * 0.6, 'rgba(0,0,0,0.68)');
  hGrad.addColorStop(1 - rx * 0.25, 'rgba(0,0,0,0.18)');
  hGrad.addColorStop(1, 'rgba(0,0,0,0)');
  layerCtx.fillStyle = hGrad;
  layerCtx.fillRect(0, 0, frameW, frameH);

  // Vertical smooth S-curve fade (top & bottom screen edges)
  const vGrad = layerCtx.createLinearGradient(0, 0, 0, frameH);
  vGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vGrad.addColorStop(ry * 0.25, 'rgba(0,0,0,0.18)');
  vGrad.addColorStop(ry * 0.6, 'rgba(0,0,0,0.68)');
  vGrad.addColorStop(ry, 'rgba(0,0,0,1)');
  vGrad.addColorStop(1 - ry, 'rgba(0,0,0,1)');
  vGrad.addColorStop(1 - ry * 0.6, 'rgba(0,0,0,0.68)');
  vGrad.addColorStop(1 - ry * 0.25, 'rgba(0,0,0,0.18)');
  vGrad.addColorStop(1, 'rgba(0,0,0,0)');
  layerCtx.fillStyle = vGrad;
  layerCtx.fillRect(0, 0, frameW, frameH);

  layerCtx.restore();
}

export interface CameraLayerRenderOptions {
  active: boolean;
  scale: number;
  focusX: number;
  focusY: number;
  viewportCenterX: number;
  viewportCenterY: number;
  frameW: number;
  frameH: number;
  pixelScale?: number;
  /** When true (closed containers like notebook sheet / terminal body), clip strictly to clipBox */
  clipToBox?: boolean;
  clipBox?: PointsCameraBox;
  /** Soft alpha fade near the actual screen edges (skipped automatically when bgMode === 'green') */
  featherScreenEdges?: boolean;
  bgMode?: 'style' | 'green' | 'black';
  featherRatio?: number;
}

/**
 * Executes a camera-transformed content layer render pass:
 * - Inactive camera: draws directly on mainCtx with zero overhead.
 * - Closed container (`clipToBox: true`): clips strictly inside `clipBox` (notebook sheet / terminal window).
 * - Open frame + Green Screen: NO inner clip and NO soft alpha feather (pure #00FF00 chroma isolation to frame edge).
 * - Open frame + Style/Black: NO inner clip; renders on cached offscreen layer and applies soft 4-edge screen feather
 *   before compositing over the static background.
 */
export function withCameraLayer(
  mainCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  opts: CameraLayerRenderOptions,
  drawFn: (drawCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void
): void {
  if (!opts.active) {
    drawFn(mainCtx);
    return;
  }

  // Closed-container styles keep their physical inner clip (notebook sheet / terminal window)
  if (opts.clipToBox && opts.clipBox) {
    mainCtx.save();
    mainCtx.beginPath();
    mainCtx.rect(opts.clipBox.x, opts.clipBox.y, opts.clipBox.w, opts.clipBox.h);
    mainCtx.clip();
    mainCtx.translate(opts.viewportCenterX, opts.viewportCenterY);
    mainCtx.scale(opts.scale, opts.scale);
    mainCtx.translate(-opts.focusX, -opts.focusY);
    try {
      drawFn(mainCtx);
    } finally {
      mainCtx.restore();
    }
    return;
  }

  const wantsFeather =
    Boolean(opts.featherScreenEdges) && opts.bgMode !== 'green';

  if (wantsFeather) {
    const { sx, sy } = resolveEffectiveCanvasScale(mainCtx, opts.pixelScale);
    const pixelW = Math.round(opts.frameW * sx);
    const pixelH = Math.round(opts.frameH * sy);
    const layer = acquireCachedFeatherLayer(pixelW, pixelH);

    if (layer) {
      featherLayerInUse = true;
      try {
        const lctx = layer.ctx;
        const actualW = layer.canvas.width;
        const actualH = layer.canvas.height;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.globalAlpha = 1;
        lctx.shadowBlur = 0;
        lctx.shadowColor = 'transparent';
        lctx.clearRect(0, 0, actualW, actualH);

        lctx.save();
        lctx.scale(actualW / Math.max(1, opts.frameW), actualH / Math.max(1, opts.frameH));

        // Camera transform in full frame space (NO premature inner box clip!)
        lctx.save();
        lctx.translate(opts.viewportCenterX, opts.viewportCenterY);
        lctx.scale(opts.scale, opts.scale);
        lctx.translate(-opts.focusX, -opts.focusY);
        try {
          drawFn(lctx);
        } finally {
          lctx.restore();
        }

        // Smooth 4-edge alpha fade near the real screen borders
        applyScreenEdgeFeatherMask(
          lctx,
          opts.frameW,
          opts.frameH,
          opts.featherRatio ?? DEFAULT_CAMERA_EDGE_FEATHER_RATIO
        );
        lctx.restore();

        // Composite onto main canvas (preserves mainCtx.globalAlpha and mainCtx transform)
        mainCtx.save();
        mainCtx.shadowBlur = 0;
        mainCtx.shadowColor = 'transparent';
        mainCtx.drawImage(layer.canvas, 0, 0, opts.frameW, opts.frameH);
        mainCtx.restore();
      } finally {
        featherLayerInUse = false;
      }
      return;
    }
  }

  // Open-frame direct pass (Green Screen mode, feather disabled, or headless test fallback):
  // NO premature inner box clip — elements extend naturally to the true frame edge.
  mainCtx.save();
  mainCtx.translate(opts.viewportCenterX, opts.viewportCenterY);
  mainCtx.scale(opts.scale, opts.scale);
  mainCtx.translate(-opts.focusX, -opts.focusY);
  try {
    drawFn(mainCtx);
  } finally {
    mainCtx.restore();
  }
}

export interface PointsCameraLayerOptions {
  frameW: number;
  frameH: number;
  pixelScale?: number;
  bgMode: 'style' | 'green' | 'black';
  /** True only for closed-container styles (notebook sheet / terminal body) */
  clipToBox?: boolean;
  clipBox?: PointsCameraBox;
  featherRatio?: number;
}

/**
 * Convenience wrapper for Multi-Points renderers:
 * Open-frame styles automatically get full-screen extension + soft edge feather (non-green),
 * while closed-container styles (`clipToBox: true`) keep strict container clipping.
 */
export function withPointsCameraLayer(
  mainCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cam: PointsCameraTransform,
  opts: PointsCameraLayerOptions,
  drawFn: (drawCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void
): void {
  withCameraLayer(
    mainCtx,
    {
      active: cam.active,
      scale: cam.scale,
      focusX: cam.focusX,
      focusY: cam.focusY,
      viewportCenterX: cam.viewportCenterX,
      viewportCenterY: cam.viewportCenterY,
      frameW: opts.frameW,
      frameH: opts.frameH,
      pixelScale: opts.pixelScale,
      clipToBox: Boolean(opts.clipToBox),
      clipBox: opts.clipBox,
      featherScreenEdges: !opts.clipToBox,
      bgMode: opts.bgMode,
      featherRatio: opts.featherRatio,
    },
    drawFn
  );
}

/**
 * Applies a PointsCameraTransform directly to the canvas context.
 * Closed-container styles (`clipToBox = true`, e.g. notebook sheet & terminal body) clip strictly to `clipBox`.
 */
export function beginPointsCameraTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cam: PointsCameraTransform,
  clipBox?: PointsCameraBox,
  clipToBox: boolean = true
): void {
  ctx.save();
  if (cam.active) {
    if (clipToBox && clipBox) {
      ctx.beginPath();
      ctx.rect(clipBox.x, clipBox.y, clipBox.w, clipBox.h);
      ctx.clip();
    }
    ctx.translate(cam.viewportCenterX, cam.viewportCenterY);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.focusX, -cam.focusY);
  }
}
