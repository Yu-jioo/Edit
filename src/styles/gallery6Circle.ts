import {
  GalleryCircleDirection,
  GalleryCircleFocusPosition,
  GalleryCircleMotionMode,
  GalleryItemConfig,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import { drawFittedImage, getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  computeVideoSourceTime,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  mixHexColor,
  progress,
  resolveTextDirection,
  stripKeywordMarkers,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
  layoutArabicQuote,
  segmentTextIntoBidiRuns,
  getWordIntrinsicDirection,
} from '../utils/textLayout';
import {
  computeGalleryEventTimes,
  computeGallerySchedule,
  DEFAULT_GALLERY_INTERVAL,
  GALLERY_ENTRANCE_DUR_SEC,
  getEffectiveGalleryItems,
  resolveGalleryBackground,
  resolveGalleryBoxPixels,
  resolveGalleryItemDrawable,
} from './galleryCore';

export const DEFAULT_GALLERY_CIRCLE_MOTION_MODE: GalleryCircleMotionMode = 'continuous';
export const DEFAULT_GALLERY_CIRCLE_DIRECTION: GalleryCircleDirection = 'cw';
export const DEFAULT_GALLERY_CIRCLE_SPEED = 14; // deg/s (4..40)
export const DEFAULT_GALLERY_CIRCLE_FOCUS_POSITION: GalleryCircleFocusPosition = 'top';
export const DEFAULT_GALLERY_CIRCLE_SHOW_TRACK = true;
export const DEFAULT_GALLERY_CIRCLE_RING_THICKNESS = 3; // px (1..8)
export const DEFAULT_GALLERY_CIRCLE_DOUBLE_ORBIT = false;
export const DEFAULT_GALLERY_CIRCLE_HUB_TITLE = '';

export const CIRCLE_STEP_ROTATE_SEC = 0.9;
export const CIRCLE_FOCUS_MAX_SCALE = 1.18;

export const GAL_CIRCLE_CONFIG: StyleMetadata = {
  id: 'gal_circle',
  mode: 'image',
  nameAr: 'دائرة دوّارة',
  nameEn: 'Rotating Circle',
  descriptionAr: 'عناصر دائرية متساوية المسافات على مسار دائري نقي مع عنوان مركزي متجاوب',
  defaultAccent: '#38BDF8',
  defaultKeywordColor: '#FBBF24',
  defaultQuoteFont: 'Readex Pro',
  defaultAuthorFont: 'Cairo',
  defaultEnglishQuoteFont: 'Outfit',
  defaultEnglishAuthorFont: 'Plus Jakarta Sans',
  supportedBackgrounds: ['style', 'green', 'black'],
  recommendedBackground: 'green',
};

export function resolveCircleMotionMode(
  mode?: GalleryCircleMotionMode | null
): GalleryCircleMotionMode {
  return mode === 'step' ? 'step' : 'continuous';
}

export function resolveCircleDirection(
  dir?: GalleryCircleDirection | null
): GalleryCircleDirection {
  return dir === 'ccw' ? 'ccw' : 'cw';
}

export function resolveCircleSpeed(speed?: number | null): number {
  if (typeof speed === 'number' && Number.isFinite(speed)) {
    return clamp(speed, 4, 40);
  }
  return DEFAULT_GALLERY_CIRCLE_SPEED;
}

export function resolveCircleFocusPosition(
  pos?: GalleryCircleFocusPosition | null
): GalleryCircleFocusPosition {
  if (pos === 'right' || pos === 'left' || pos === 'bottom' || pos === 'top') {
    return pos;
  }
  return DEFAULT_GALLERY_CIRCLE_FOCUS_POSITION;
}

export function resolveCircleRingThickness(thickness?: number | null): number {
  if (typeof thickness === 'number' && Number.isFinite(thickness)) {
    return clamp(thickness, 1, 8);
  }
  return DEFAULT_GALLERY_CIRCLE_RING_THICKNESS;
}

export function getFocusAngleRad(pos: GalleryCircleFocusPosition): number {
  switch (pos) {
    case 'right':
      return 0;
    case 'bottom':
      return Math.PI * 0.5;
    case 'left':
      return Math.PI;
    case 'top':
    default:
      return -Math.PI * 0.5;
  }
}

function normalizeAngleRad(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface CircleGalleryGeometry {
  cx: number;
  cy: number;
  maxHalf: number;
  outerPad: number;
  itemCount: number;
  isDoubleOrbit: boolean;
  outerCount: number;
  innerCount: number;
  outerTrackRadius: number;
  innerTrackRadius: number;
  decorTrackRadius: number; // Used for n === 1 revolving dashed ring
  outerItemRadius: number;
  outerItemDiameter: number;
  innerItemRadius: number;
  innerItemDiameter: number;
  hubClearRadius: number;
  focusMaxScale: number;
  ringThickness: number;
}

/**
 * Pure deterministic geometry for the Rotating Circle gallery:
 * - Perfect circular track(s) centered in boxPx, strictly inside safe margins.
 * - Single orbit (n >= 2): d = min(0.38 * R, 0.8 * 2*pi*R / n) with R + r * focusScale <= maxHalf.
 * - n === 1: large centered circle with dashed ring revolving around it.
 * - Double orbit (when doubleOrbit && n >= 5): alternating outer & inner rings with guaranteed
 *   non-overlapping radial & chord clearances and a clear central hub.
 */
export function computeCircleGalleryGeometry(params: {
  itemCount: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  highlightEnabled: boolean;
  doubleOrbit: boolean;
  ringThickness: number;
  isGreen: boolean;
}): CircleGalleryGeometry {
  const n = clamp(Math.round(params.itemCount || 1), 1, 8);
  const cx = params.boxX + params.boxWidth * 0.5;
  const cy = params.boxY + params.boxHeight * 0.5;
  const minDim = Math.max(48, Math.min(params.boxWidth, params.boxHeight));
  const ringThickness = resolveCircleRingThickness(params.ringThickness);
  const focusMaxScale = params.highlightEnabled ? CIRCLE_FOCUS_MAX_SCALE : 1.0;

  // Reserve outer safety padding so ring stroke, focus scale, and green hard offset shadow never clip
  const shadowReserve = params.isGreen ? 8 : 5;
  const outerPad = clamp(Math.round(minDim * 0.025), 6, 16) + ringThickness * 0.75 + shadowReserve;
  const maxHalf = Math.max(22, minDim * 0.5 - outerPad);

  if (n === 1) {
    const decorTrackRadius = Math.max(20, maxHalf * 0.94);
    const outerItemRadius = Math.max(14, (maxHalf * 0.62) / focusMaxScale);
    return {
      cx,
      cy,
      maxHalf,
      outerPad,
      itemCount: 1,
      isDoubleOrbit: false,
      outerCount: 1,
      innerCount: 0,
      outerTrackRadius: 0,
      innerTrackRadius: 0,
      decorTrackRadius,
      outerItemRadius,
      outerItemDiameter: outerItemRadius * 2,
      innerItemRadius: 0,
      innerItemDiameter: 0,
      hubClearRadius: 0,
      focusMaxScale,
      ringThickness,
    };
  }

  const isDoubleOrbit = Boolean(params.doubleOrbit) && n >= 5;

  if (!isDoubleOrbit) {
    // Exact spec formula: d = min(0.38 * R, 0.8 * 2*pi*R / n) -> r = k * R
    const kDiameter = Math.min(0.38, (0.8 * Math.PI * 2) / n);
    const kRadius = kDiameter * 0.5;
    // Ensure chord distance between neighbors exceeds focused + normal radii + ring stroke
    const maxNonOverlapRatio =
      n >= 2 ? (Math.sin(Math.PI / n) * 0.92) / ((focusMaxScale + 1) * 0.5) : kRadius;
    const effectiveK = Math.min(kRadius, maxNonOverlapRatio);

    // Track radius R = maxHalf - itemRadius * focusMaxScale (so R + r * focusMaxScale === maxHalf)
    const outerTrackRadius = maxHalf / (1 + effectiveK * focusMaxScale);
    const outerItemRadius = Math.max(10, outerTrackRadius * effectiveK);
    const outerItemDiameter = outerItemRadius * 2;
    const hubClearRadius = Math.max(
      14,
      outerTrackRadius - outerItemRadius * focusMaxScale - ringThickness - 6
    );

    return {
      cx,
      cy,
      maxHalf,
      outerPad,
      itemCount: n,
      isDoubleOrbit: false,
      outerCount: n,
      innerCount: 0,
      outerTrackRadius,
      innerTrackRadius: 0,
      decorTrackRadius: outerTrackRadius,
      outerItemRadius,
      outerItemDiameter,
      innerItemRadius: 0,
      innerItemDiameter: 0,
      hubClearRadius,
      focusMaxScale,
      ringThickness,
    };
  }

  // Double orbit (n >= 5): even items on outer track, odd items on inner track
  const outerCount = Math.ceil(n / 2);
  const innerCount = Math.floor(n / 2);

  // Choose balanced radial proportions so outer ring, inner ring, and hub never touch
  const outerChordLimit =
    (Math.sin(Math.PI / Math.max(2, outerCount)) * 0.86) / ((focusMaxScale + 1) * 0.5);
  const outerK = Math.min(0.148, (0.76 * Math.PI) / outerCount, outerChordLimit);
  let outerTrackRadius = maxHalf / (1 + outerK * focusMaxScale);
  let outerItemRadius = Math.max(9, outerTrackRadius * outerK);

  const radialGap = Math.max(6, ringThickness * 2 + 4);
  const outerInnerEdge = outerTrackRadius - outerItemRadius * focusMaxScale - radialGap;

  // Inner item slightly more compact so center hub stays legible even in small boxes
  let innerItemRadius = Math.max(8, outerItemRadius * 0.84);
  let innerTrackRadius = outerInnerEdge - innerItemRadius * focusMaxScale;

  // Enforce inner ring chord non-overlap & hub breathing room
  const innerMaxRadiusByChord =
    innerCount >= 2
      ? (innerTrackRadius * Math.sin(Math.PI / innerCount) * 0.88) / ((focusMaxScale + 1) * 0.5)
      : innerItemRadius;
  innerItemRadius = Math.min(innerItemRadius, Math.max(8, innerMaxRadiusByChord));

  // Ensure hub has at least 26% of maxHalf clear radius
  const minHubR = Math.max(16, maxHalf * 0.27);
  if (innerTrackRadius - innerItemRadius * focusMaxScale - ringThickness - 4 < minHubR) {
    // Gently compact item radii while preserving strict non-overlap
    const availRadial = Math.max(12, maxHalf - minHubR - radialGap - ringThickness - 4);
    const totalRadiiWeight = (1 + 0.84) * 2 * focusMaxScale;
    const compactR = Math.max(7, availRadial / Math.max(2.5, totalRadiiWeight));
    outerItemRadius = Math.min(outerItemRadius, compactR);
    innerItemRadius = Math.min(innerItemRadius, compactR * 0.84);
    outerTrackRadius = maxHalf - outerItemRadius * focusMaxScale;
    const recomputedInnerR =
      outerTrackRadius - outerItemRadius * focusMaxScale - radialGap - innerItemRadius * focusMaxScale;
    innerTrackRadius = Math.max(minHubR + innerItemRadius * focusMaxScale + ringThickness + 4, recomputedInnerR);
  }

  const hubClearRadius = Math.max(
    14,
    innerTrackRadius - innerItemRadius * focusMaxScale - ringThickness - 6
  );

  return {
    cx,
    cy,
    maxHalf,
    outerPad,
    itemCount: n,
    isDoubleOrbit: true,
    outerCount,
    innerCount,
    outerTrackRadius,
    innerTrackRadius,
    decorTrackRadius: outerTrackRadius,
    outerItemRadius,
    outerItemDiameter: outerItemRadius * 2,
    innerItemRadius,
    innerItemDiameter: innerItemRadius * 2,
    hubClearRadius,
    focusMaxScale,
    ringThickness,
  };
}

export interface CircleRenderedItemState {
  index: number;
  ring: 'outer' | 'inner';
  x: number;
  y: number;
  radius: number;
  scale: number;
  alpha: number;
  focusWeight: number;
  isFocused: boolean;
  visible: boolean;
  theta: number;
  angularDistanceToFocus: number;
  videoSourceTime: number;
  entranceP: number;
}

export interface CircleGalleryFrameState {
  geometry: CircleGalleryGeometry;
  items: CircleRenderedItemState[];
  focusedIndex: number;
  secondaryIndex: number;
  hubCrossfadeAlpha: number;
  outerTrackSpinRad: number;
  innerTrackSpinRad: number;
  masterTrackAlpha: number;
}

/**
 * Pure deterministic function of `t` computing orbital angles, curved entrance/spiral exit,
 * smooth continuous focus weights, upright positions, and video timestamps for every item.
 */
export function sampleCircleGalleryState(params: {
  items: GalleryItemConfig[];
  t: number;
  custom: StyleCustomization;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  isGreen: boolean;
}): CircleGalleryFrameState {
  const { items, t, custom, boxX, boxY, boxWidth, boxHeight, isGreen } = params;
  const n = Math.max(1, items.length);

  const highlightEnabled = custom.galleryHighlightCurrent !== false;
  const motionMode = resolveCircleMotionMode(custom.galleryCircleMotionMode);
  const direction = resolveCircleDirection(custom.galleryCircleDirection);
  const dirSign = direction === 'ccw' ? -1 : 1;
  const speedDeg = resolveCircleSpeed(custom.galleryCircleSpeed);
  const speedRad = (speedDeg * Math.PI) / 180;
  const focusPos = resolveCircleFocusPosition(custom.galleryCircleFocusPosition);
  const focusAngleRad = getFocusAngleRad(focusPos);
  const ringThickness = resolveCircleRingThickness(custom.galleryCircleRingThickness);
  const doubleOrbitRequested = Boolean(custom.galleryCircleDoubleOrbit);

  const schedule = computeGallerySchedule({
    itemCount: n,
    appearance: custom.galleryAppearance,
    interval: custom.galleryInterval,
    endHold: custom.galleryEndHold,
  });

  const geometry = computeCircleGalleryGeometry({
    itemCount: n,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    highlightEnabled,
    doubleOrbit: doubleOrbitRequested,
    ringThickness,
    isGreen,
  });

  const exitRaw = progress(t, schedule.exitStart, schedule.total);
  const exitEase = easeInCubic(exitRaw);
  const exitAlpha = 1 - exitEase;
  const masterTrackAlpha =
    easeOutCubic(progress(t, schedule.intro * 0.35, schedule.intro + 0.5)) * exitAlpha;

  // Compute ring angular displacements
  const u = Math.max(0, t - schedule.intro);
  const easeInDur = 0.85;
  const continuousDisp =
    u <= easeInDur
      ? speedRad * ((u * u) / (2 * easeInDur))
      : speedRad * (u - easeInDur * 0.5);

  let outerRingAngle = 0;
  let innerRingAngle = 0;

  if (n > 1) {
    if (motionMode === 'continuous') {
      outerRingAngle = dirSign * continuousDisp;
      // Inner track rotates in opposite direction
      innerRingAngle = -dirSign * continuousDisp * 1.06;
    } else {
      // Step-by-step mode: easeInOutCubic over 0.9s, then pause for interval
      const pauseDur = clamp(custom.galleryInterval ?? DEFAULT_GALLERY_INTERVAL, 0.3, 2.0);
      const rotDur = CIRCLE_STEP_ROTATE_SEC;
      const stepPeriod = rotDur + pauseDur;

      // Wait one pauseDur at step 0, then smoothly step 0 -> 1 -> 2 -> ...
      const stepFloat = (k: number, local: number): number => {
        if (local <= pauseDur) return k;
        const rotP = clamp((local - pauseDur) / rotDur, 0, 1);
        return k + easeInOutCubic(rotP);
      };

      const stepK = Math.floor(u / stepPeriod);
      const localU = u - stepK * stepPeriod;
      const smoothStep = stepFloat(stepK, localU);

      if (!geometry.isDoubleOrbit) {
        const stepAngle = (Math.PI * 2) / n;
        outerRingAngle = dirSign * smoothStep * stepAngle;
      } else {
        // Alternate bringing outer (even) and inner (odd) items to focusAngleRad
        // while outer rotates in +dirSign and inner rotates in -dirSign.
        const outerStep = (Math.PI * 2) / geometry.outerCount;
        const innerStep = (Math.PI * 2) / geometry.innerCount;
        // Each step advances both rings by half their slot step in opposite directions,
        // with inner starting half a step offset so even steps align an outer item at focus
        // and odd steps align an inner item at focus.
        outerRingAngle = dirSign * (smoothStep * 0.5) * outerStep;
        innerRingAngle = -dirSign * ((smoothStep - 1) * 0.5) * innerStep;
      }
    }
  }

  // Track dashed spin (always gentle continuous rotation)
  const outerTrackSpinRad = dirSign * Math.max(0.14, speedRad * 0.35) * t;
  const innerTrackSpinRad = -dirSign * Math.max(0.18, speedRad * 0.42) * t;

  interface TempItem {
    index: number;
    ring: 'outer' | 'inner';
    theta: number;
    angularDist: number;
    trackR: number;
    itemR: number;
    entranceRaw: number;
    videoSourceTime: number;
  }

  const tempItems: TempItem[] = [];
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const itemStart = schedule.itemStarts[i] ?? schedule.intro;
    const entranceRaw = progress(t, itemStart, itemStart + GALLERY_ENTRANCE_DUR_SEC);

    const isInner = geometry.isDoubleOrbit && i % 2 === 1;
    const ring: 'outer' | 'inner' = isInner ? 'inner' : 'outer';
    const trackCount = isInner ? geometry.innerCount : geometry.outerCount;
    const slotInTrack = geometry.isDoubleOrbit ? Math.floor(i / 2) : i;
    const slotStep = (Math.PI * 2) / Math.max(1, trackCount);

    let baseAngle: number;
    let ringDelta: number;
    if (!geometry.isDoubleOrbit) {
      // Lay items evenly spaced so rotating by +dirSign * slotStep brings item 0, 1, 2... sequentially to focus
      baseAngle = focusAngleRad - dirSign * slotInTrack * slotStep;
      ringDelta = outerRingAngle;
    } else if (!isInner) {
      baseAngle = focusAngleRad - dirSign * slotInTrack * slotStep;
      ringDelta = outerRingAngle;
    } else {
      // Inner ring rotates in -dirSign, so spacing is +dirSign to bring odd items 1, 3, 5... into focus in order
      baseAngle = focusAngleRad + dirSign * slotInTrack * slotStep;
      ringDelta = innerRingAngle;
    }

    const theta = baseAngle + ringDelta;
    const angularDist = n === 1 ? 0 : Math.abs(normalizeAngleRad(theta - focusAngleRad));
    const trackR = isInner ? geometry.innerTrackRadius : geometry.outerTrackRadius;
    const itemR = isInner ? geometry.innerItemRadius : geometry.outerItemRadius;

    const dur = Math.max(0.2, item.duration || 6.0);
    const trimIn = clamp(item.trimIn ?? 0, 0, Math.max(0, dur - 0.1));
    const trimOut = clamp(item.trimOut ?? dur, trimIn + 0.1, dur);
    const videoSourceTime = computeVideoSourceTime(t, {
      clipStart: itemStart,
      clipEnd: schedule.total,
      trimIn,
      trimOut,
      speed: clamp(item.speed ?? 1.0, 0.5, 2.0),
      endBehavior: item.endBehavior || 'loop',
    });

    tempItems.push({
      index: i,
      ring,
      theta,
      angularDist,
      trackR,
      itemR,
      entranceRaw,
      videoSourceTime,
    });
  }

  // Determine nearest & second-nearest visible items to focus position
  const visibleCandidates = tempItems
    .filter((it) => it.entranceRaw > 0.001 && exitRaw < 0.999)
    .sort((a, b) => a.angularDist - b.angularDist);

  const focusedIndex = visibleCandidates.length > 0 ? visibleCandidates[0].index : -1;
  const secondaryIndex = visibleCandidates.length > 1 ? visibleCandidates[1].index : -1;

  // Quick crossfade alpha for hub caption around handoff midpoint
  let hubCrossfadeAlpha = 1.0;
  if (visibleCandidates.length >= 2) {
    const d1 = visibleCandidates[0].angularDist;
    const d2 = visibleCandidates[1].angularDist;
    const stepSpan = (Math.PI * 2) / Math.max(2, n);
    const handoffBand = stepSpan * 0.18;
    const diff = Math.max(0, d2 - d1);
    hubCrossfadeAlpha = easeOutCubic(clamp(diff / Math.max(0.05, handoffBand), 0, 1));
  } else if (visibleCandidates.length === 1) {
    hubCrossfadeAlpha = easeOutCubic(clamp(visibleCandidates[0].entranceRaw * 1.5, 0, 1));
  } else {
    hubCrossfadeAlpha = 0;
  }
  hubCrossfadeAlpha *= exitAlpha;

  // Smooth continuous focus weights per item
  const renderedItems: CircleRenderedItemState[] = tempItems.map((it) => {
    const visible = it.entranceRaw > 0.001 && exitRaw < 0.999;
    if (!visible) {
      return {
        index: it.index,
        ring: it.ring,
        x: geometry.cx,
        y: geometry.cy,
        radius: it.itemR,
        scale: 0.6,
        alpha: 0,
        focusWeight: 0,
        isFocused: false,
        visible: false,
        theta: it.theta,
        angularDistanceToFocus: it.angularDist,
        videoSourceTime: it.videoSourceTime,
        entranceP: 0,
      };
    }

    const trackCount = it.ring === 'inner' ? geometry.innerCount : geometry.outerCount;
    const halfStep = Math.PI / Math.max(2, trackCount);
    let rawWeight =
      n === 1
        ? 1
        : easeInOutCubic(clamp(1 - it.angularDist / (halfStep * 0.95), 0, 1));

    // In double orbit, gently suppress non-nearest item if another ring's item is closer to focus
    if (geometry.isDoubleOrbit && it.index !== focusedIndex && visibleCandidates.length > 0) {
      const winnerDist = visibleCandidates[0].angularDist;
      const suppression = clamp((it.angularDist - winnerDist) / (halfStep * 0.55), 0, 1);
      rawWeight *= 1 - suppression * 0.72;
    }

    const focusWeight = clamp(rawWeight, 0, 1);
    const isFocused = it.index === focusedIndex;

    // Curved entrance from center (scale 0.6 -> 1.0, easeOutBack ~0.7s) + spiral exit (~0.6s)
    const entranceBack = easeOutBack(it.entranceRaw, 1.25);
    const entranceRadiusFactor = clamp(easeOutBack(it.entranceRaw, 1.05), 0, 1.02);
    const entranceSpiralOffset =
      -dirSign * (it.ring === 'inner' ? -1 : 1) * (1 - easeOutCubic(it.entranceRaw)) * 0.82;
    const exitSpiralOffset =
      dirSign * (it.ring === 'inner' ? -1 : 1) * exitEase * 1.15;

    const curRadius = clamp(
      it.trackR * entranceRadiusFactor * (1 - exitEase),
      0,
      Math.max(0, geometry.maxHalf - it.itemR * geometry.focusMaxScale)
    );
    const curTheta = it.theta + entranceSpiralOffset + exitSpiralOffset;

    const x = geometry.cx + Math.cos(curTheta) * curRadius;
    const y = geometry.cy + Math.sin(curTheta) * curRadius;

    const entranceScale = lerp(0.6, 1.0, clamp(entranceBack, 0, 1.05));
    const focusScale = highlightEnabled
      ? lerp(1.0, CIRCLE_FOCUS_MAX_SCALE, focusWeight)
      : 1.0;
    const exitScale = lerp(1.0, 0.55, exitEase);
    const scale = entranceScale * focusScale * exitScale;

    const entranceAlpha = easeOutCubic(clamp(it.entranceRaw * 1.5, 0, 1));
    const highlightAlpha =
      highlightEnabled && n > 1 ? lerp(0.7, 1.0, focusWeight) : 1.0;
    const alpha = clamp(entranceAlpha * exitAlpha * highlightAlpha, 0, 1);

    return {
      index: it.index,
      ring: it.ring,
      x,
      y,
      radius: it.itemR,
      scale,
      alpha,
      focusWeight,
      isFocused,
      visible: alpha > 0.01,
      theta: curTheta,
      angularDistanceToFocus: it.angularDist,
      videoSourceTime: it.videoSourceTime,
      entranceP: it.entranceRaw,
    };
  });

  return {
    geometry,
    items: renderedItems,
    focusedIndex,
    secondaryIndex,
    hubCrossfadeAlpha,
    outerTrackSpinRad,
    innerTrackSpinRad,
    masterTrackAlpha,
  };
}

/**
 * Cached deep-indigo style background (#0B1030 -> #1E1B4B) with faint concentric rings
 * and deterministic soft bokeh dots. Never drawn in green screen mode.
 */
function getCachedCircleBackground(
  W: number,
  H: number,
  seed: number,
  accentColor: string
): HTMLCanvasElement {
  const key = `gal-circle-bg|${W}x${H}|${seed}|${accentColor}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0B1030');
    grad.addColorStop(0.55, '#14173E');
    grad.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial atmospheric glow behind center
    const centerGlow = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      0,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.52
    );
    centerGlow.addColorStop(0, hexToRgba(accentColor, 0.14));
    centerGlow.addColorStop(0.6, hexToRgba(accentColor, 0.04));
    centerGlow.addColorStop(1, 'rgba(11, 16, 48, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, W, H);

    // Faint concentric rings
    const maxRingR = Math.hypot(W, H) * 0.52;
    const ringCount = 6;
    ctx.save();
    for (let i = 1; i <= ringCount; i++) {
      const rr = (maxRingR / ringCount) * i;
      ctx.strokeStyle = `rgba(226, 232, 240, ${(0.065 - i * 0.007).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.5, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Soft deterministic bokeh dots
    const rng = mulberry32(combineSeed(seed, 6047));
    const bokehCount = 18;
    for (let i = 0; i < bokehCount; i++) {
      const bx = rng() * W;
      const by = rng() * H;
      const br = lerp(18, 72, rng());
      const ba = lerp(0.04, 0.12, rng());
      const useAccent = rng() > 0.45;
      const color = useAccent ? accentColor : '#A5B4FC';
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, hexToRgba(color, ba));
      bg.addColorStop(0.6, hexToRgba(color, ba * 0.35));
      bg.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Draws a single word token with a crisp hard dark outline (for green chroma key mode)
 * while preserving exact RTL/LTR bidi shaping and NEVER splitting Arabic letters.
 */
function drawOutlinedBidiWord(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  wordText: string,
  rightX: number,
  baselineY: number,
  baseDirection: ResolvedTextDirection,
  strokeColor: string,
  strokeWidth: number
): void {
  if (!wordText) return;
  const runs = segmentTextIntoBidiRuns(wordText, baseDirection);
  const prevDir = ctx.direction;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'right';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;

  if (runs.length <= 1) {
    const dir = runs[0]?.direction ?? getWordIntrinsicDirection(wordText, baseDirection);
    ctx.direction = dir;
    ctx.strokeText(wordText, rightX, baselineY);
    ctx.direction = prevDir;
    ctx.textAlign = prevAlign;
    return;
  }

  const runWidths = runs.map((r) => {
    ctx.direction = r.direction;
    return ctx.measureText(r.text).width;
  });
  const totalRunW = runWidths.reduce((a, b) => a + b, 0);

  if (baseDirection === 'rtl') {
    let cursorRight = rightX;
    for (let i = 0; i < runs.length; i++) {
      ctx.direction = runs[i].direction;
      ctx.strokeText(runs[i].text, cursorRight, baselineY);
      cursorRight -= runWidths[i];
    }
  } else {
    let cursorLeft = rightX - totalRunW;
    for (let i = 0; i < runs.length; i++) {
      ctx.direction = runs[i].direction;
      const rRight = cursorLeft + runWidths[i];
      ctx.strokeText(runs[i].text, rRight, baselineY);
      cursorLeft = rRight;
    }
  }

  ctx.direction = prevDir;
  ctx.textAlign = prevAlign;
}

/**
 * Renders the center hub caption (or optional hub title) strictly inside the inner circle.
 * Supports *keyword* across multiple lines, tashkeel, RTL/LTR auto-direction, and crisp hard
 * dark outline on white text in green screen mode.
 */
function drawCircleHubCaption(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  text: string;
  cx: number;
  cy: number;
  boxW: number;
  boxH: number;
  custom: StyleCustomization;
  keywordColor: string;
  alpha: number;
  isGreen: boolean;
}): void {
  const { ctx, text, cx, cy, boxW, boxH, custom, keywordColor, alpha, isGreen } = params;
  const clean = stripKeywordMarkers(text || '').trim();
  if (!clean || alpha <= 0.01 || boxW < 30 || boxH < 18) return;

  const dir = resolveTextDirection(custom, text);
  const font =
    custom.quoteFontOverride ||
    (dir === 'ltr'
      ? GAL_CIRCLE_CONFIG.defaultEnglishQuoteFont || 'Outfit'
      : GAL_CIRCLE_CONFIG.defaultQuoteFont);

  const maxFont = clamp(Math.round(Math.min(boxW * 0.2, boxH * 0.34)), 13, 38);
  const minFont = clamp(Math.round(maxFont * 0.48), 11, maxFont);

  const layout = layoutArabicQuote(ctx, {
    text,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: minFont,
    maxFontSize: maxFont,
    fontSizeMultiplier: clamp(custom.fontSizeMultiplier || 1.0, 0.7, 1.3),
    lineHeightRatio: 1.38,
    boxX: cx - boxW * 0.5,
    boxY: cy - boxH * 0.5,
    boxWidth: boxW,
    boxHeight: boxH,
    align: 'center',
    direction: dir,
  });

  ctx.save();
  ctx.globalAlpha *= clamp(alpha, 0, 1);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Hard dark outline thickness for crisp green-screen legibility
  const outlineW = clamp(layout.fontSize * 0.16, 2.6, 5.6);

  for (const w of layout.words) {
    applyStudioCanvasTextProps(
      ctx,
      layout.fontFamily,
      layout.fontWeight,
      w.fontSize,
      layout.direction
    );
    if (isGreen) {
      drawOutlinedBidiWord(ctx, w.text, w.x, w.y, layout.direction, '#090D16', outlineW);
    }
    ctx.fillStyle = w.isKeyword ? keywordColor : '#FFFFFF';
    drawBidiWord(ctx, w.text, w.x, w.y, layout.direction);
  }

  // Per-line keyword underlines (handles keywords breaking across 2+ lines cleanly)
  for (const rect of layout.keywordLineRects) {
    const ly = rect.baselineY + Math.max(2, layout.fontSize * 0.13);
    const lw = Math.max(2, layout.fontSize * 0.08);
    ctx.lineCap = 'round';
    if (isGreen) {
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = lw + 2.4;
      ctx.beginPath();
      ctx.moveTo(rect.leftX, ly);
      ctx.lineTo(rect.rightX, ly);
      ctx.stroke();
    }
    ctx.strokeStyle = keywordColor;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(rect.leftX, ly);
    ctx.lineTo(rect.rightX, ly);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderGalCircle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): void {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveGalleryBackground(custom);
  const isGreen = bgMode === 'green';
  const accentColor = custom.accentColor || GAL_CIRCLE_CONFIG.defaultAccent;
  const accentLightTint = mixHexColor(accentColor, '#FFFFFF', 0.46);
  const keywordColor =
    custom.keywordColor || GAL_CIRCLE_CONFIG.defaultKeywordColor || accentColor;
  const showTrack = custom.galleryCircleShowTrack !== false;

  // 1. Background
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedCircleBackground(W, H, custom.seed, accentColor);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  const items = getEffectiveGalleryItems(content, custom);
  const boxPx = resolveGalleryBoxPixels(custom, size);

  const state = sampleCircleGalleryState({
    items,
    t,
    custom,
    boxX: boxPx.boxX,
    boxY: boxPx.boxY,
    boxWidth: boxPx.boxWidth,
    boxHeight: boxPx.boxHeight,
    isGreen,
  });

  const { geometry } = state;

  // 2. Track Ring(s)
  if (showTrack && state.masterTrackAlpha > 0.01) {
    const drawTrackCircle = (trackR: number, spinRad: number, alphaScale: number) => {
      if (trackR <= 8) return;
      ctx.save();
      ctx.translate(geometry.cx, geometry.cy);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      if (isGreen) {
        // Solid thin track ring in green mode (zero glow, zero feather, crisp edges)
        ctx.globalAlpha = state.masterTrackAlpha;
        ctx.setLineDash([]);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = Math.max(1.8, Math.min(3, geometry.ringThickness * 0.7));
        ctx.beginPath();
        ctx.arc(0, 0, trackR, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.rotate(spinRad);
        ctx.globalAlpha = state.masterTrackAlpha * alphaScale;
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = hexToRgba(accentLightTint, 0.45);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, trackR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    if (geometry.itemCount === 1) {
      drawTrackCircle(geometry.decorTrackRadius, state.outerTrackSpinRad, 0.9);
    } else {
      drawTrackCircle(geometry.outerTrackRadius, state.outerTrackSpinRad, 0.85);
      if (geometry.isDoubleOrbit && geometry.innerTrackRadius > 8) {
        drawTrackCircle(geometry.innerTrackRadius, state.innerTrackSpinRad, 0.68);
      }
    }
  }

  // 3. Draw Circular Items (back-to-front by focusWeight so focused item always renders crisp on top)
  const drawOrder = state.items
    .filter((it) => it.visible)
    .sort((a, b) => {
      if (a.isFocused !== b.isFocused) return a.isFocused ? 1 : -1;
      return a.focusWeight - b.focusWeight;
    });

  for (const entry of drawOrder) {
    const item = items[entry.index];
    const r = entry.radius;
    const d = r * 2;
    const drawable = resolveGalleryItemDrawable(
      content,
      item,
      entry.index,
      entry.videoSourceTime
    );

    ctx.save();
    // Upright translation & scale ONLY — never rotate items with the ring
    ctx.translate(entry.x, entry.y);
    ctx.scale(entry.scale, entry.scale);
    ctx.globalAlpha = entry.alpha;

    const ringW =
      geometry.ringThickness *
      (custom.galleryHighlightCurrent !== false
        ? lerp(1.0, 1.32, entry.focusWeight)
        : 1.0);

    // 3a. Outer Shadow / Focus Glow
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(5, 6, r + ringW * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#090D16';
      ctx.fill();
    } else {
      ctx.save();
      const glowStrength =
        custom.galleryHighlightCurrent !== false ? entry.focusWeight : 0.25;
      ctx.shadowColor =
        glowStrength > 0.35
          ? hexToRgba(accentColor, 0.25 + glowStrength * 0.42)
          : 'rgba(3, 7, 22, 0.55)';
      ctx.shadowBlur = glowStrength > 0.35 ? 16 + glowStrength * 18 : 14;
      ctx.shadowOffsetY = glowStrength > 0.35 ? 4 : 8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#DCE2EC';
      ctx.fill();
      ctx.restore();
    }

    // 3b. Circular Clipped Media (soft neutral disc behind transparent PNGs + cover crop)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // Soft neutral disc behind every item so transparent PNGs sit cleanly without chroma leak
    if (isGreen) {
      ctx.fillStyle = '#DCE2EC';
      ctx.fillRect(-r, -r, d, d);
    } else {
      const neutralDisc = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
      neutralDisc.addColorStop(0, '#E8EDF4');
      neutralDisc.addColorStop(1, '#CBD5E1');
      ctx.fillStyle = neutralDisc;
      ctx.fillRect(-r, -r, d, d);
    }

    // Cover crop strictly preserving display aspect ratio (never stretched)
    drawFittedImage(
      ctx,
      drawable,
      { zoom: 1, offsetX: 0, offsetY: 0 },
      'cover',
      -r,
      -r,
      d,
      d,
      1.0
    );

    // Subtle inner rim shade (style mode only; hard clean edges in green mode)
    if (!isGreen) {
      const innerShade = ctx.createRadialGradient(0, 0, r * 0.66, 0, 0, r);
      innerShade.addColorStop(0, 'rgba(5, 8, 22, 0)');
      innerShade.addColorStop(0.82, 'rgba(5, 8, 22, 0.12)');
      innerShade.addColorStop(1, 'rgba(5, 8, 22, 0.34)');
      ctx.fillStyle = innerShade;
      ctx.fillRect(-r, -r, d, d);
    }
    ctx.restore();

    // 3c. Accent Ring Border
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (isGreen) {
      ctx.strokeStyle =
        entry.focusWeight > 0.5 && custom.galleryHighlightCurrent !== false
          ? mixHexColor(accentColor, '#FFFFFF', 0.25)
          : accentColor;
      ctx.lineWidth = ringW;
      ctx.stroke();
    } else {
      const ringGrad = ctx.createLinearGradient(-r, -r, r, r);
      const brightStop =
        custom.galleryHighlightCurrent !== false
          ? mixHexColor(accentColor, '#FFFFFF', lerp(0.32, 0.72, entry.focusWeight))
          : accentLightTint;
      ringGrad.addColorStop(0, brightStop);
      ringGrad.addColorStop(0.55, accentColor);
      ringGrad.addColorStop(1, accentLightTint);
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = ringW;
      ctx.stroke();
    }

    ctx.restore();
  }

  // 4. Center Hub Caption (or Hub Title fallback when focused item has no caption)
  const hubFallbackTitle = (custom.galleryCircleHubTitle || '').trim();
  const resolveHubText = (idx: number): string => {
    if (idx < 0 || idx >= items.length) return hubFallbackTitle;
    const cap = (items[idx].caption || '').trim();
    if (stripKeywordMarkers(cap).trim().length > 0) return cap;
    return hubFallbackTitle;
  };

  const primaryText = resolveHubText(state.focusedIndex);
  const secondaryText = resolveHubText(state.secondaryIndex);
  const effectiveHubAlpha =
    primaryText && primaryText === secondaryText
      ? Math.min(1, state.masterTrackAlpha)
      : state.hubCrossfadeAlpha;

  if (stripKeywordMarkers(primaryText).trim().length > 0 && effectiveHubAlpha > 0.01) {
    if (geometry.itemCount === 1) {
      // With 1 centered large item, place caption cleanly along the lower hub band inside boxPx
      const singleR = geometry.outerItemRadius * geometry.focusMaxScale;
      const spaceBelow = Math.max(24, boxPx.boxY + boxPx.boxHeight - (geometry.cy + singleR) - 6);
      const capW = clamp(Math.round(Math.min(boxPx.boxWidth * 0.76, singleR * 2.1)), 90, boxPx.boxWidth - 20);
      const capH = clamp(Math.round(Math.min(spaceBelow * 0.9, 64)), 22, 64);
      const capCy = Math.min(
        boxPx.boxY + boxPx.boxHeight - capH * 0.5 - 6,
        geometry.cy + singleR + capH * 0.5 + 4
      );
      drawCircleHubCaption({
        ctx,
        text: primaryText,
        cx: geometry.cx,
        cy: capCy,
        boxW: capW,
        boxH: capH,
        custom,
        keywordColor,
        alpha: effectiveHubAlpha,
        isGreen,
      });
    } else if (geometry.hubClearRadius >= 18) {
      const hubR = geometry.hubClearRadius;

      // Subtle circular hub backing in style mode only (strictly clean in green mode)
      if (!isGreen) {
        ctx.save();
        ctx.globalAlpha = state.masterTrackAlpha * 0.62;
        const hubBg = ctx.createRadialGradient(
          geometry.cx,
          geometry.cy,
          0,
          geometry.cx,
          geometry.cy,
          hubR * 0.94
        );
        hubBg.addColorStop(0, 'rgba(11, 16, 48, 0.72)');
        hubBg.addColorStop(0.75, 'rgba(18, 22, 58, 0.34)');
        hubBg.addColorStop(1, 'rgba(18, 22, 58, 0)');
        ctx.fillStyle = hubBg;
        ctx.beginPath();
        ctx.arc(geometry.cx, geometry.cy, hubR * 0.94, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Inscribed safe rectangle strictly inside circle of radius hubR:
      // (0.72)^2 + (0.56)^2 = 0.832 < 1.0 -> corners never touch the inner item edge!
      const hubBoxW = Math.max(40, Math.round(hubR * 1.44));
      const hubBoxH = Math.max(24, Math.round(hubR * 1.12));

      drawCircleHubCaption({
        ctx,
        text: primaryText,
        cx: geometry.cx,
        cy: geometry.cy,
        boxW: hubBoxW,
        boxH: hubBoxH,
        custom,
        keywordColor,
        alpha: effectiveHubAlpha,
        isGreen,
      });
    }
  }
}

export function getGalCircleEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const base = computeGalleryEventTimes(
    ctx,
    content,
    timeline,
    custom,
    size,
    GAL_CIRCLE_CONFIG.defaultQuoteFont,
    GAL_CIRCLE_CONFIG.defaultEnglishQuoteFont || 'Outfit'
  );

  // Also include keyword hit time if optional hub title contains *keyword*
  const hubTitle = (custom.galleryCircleHubTitle || '').trim();
  if (hubTitle.includes('*') && base.keywordTimes.length === 0) {
    base.keywordTimes.push(Number(((base.itemTimes?.[0] ?? 0.6) + 0.24).toFixed(3)));
  }

  return base;
}
