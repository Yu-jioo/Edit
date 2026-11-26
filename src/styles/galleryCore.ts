import {
  AspectRatioFormat,
  BackgroundMode,
  GalleryAppearanceMode,
  GalleryItemConfig,
  GalleryRuntimeMediaEntry,
  GalleryStyleId,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleId,
  TimelineConfig,
} from '../types';
import { createBufferCanvas, drawFittedImage, getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  computeVideoSourceTime,
  DEFAULT_VIDEO_BOX,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  stripKeywordMarkers,
  videoBoxToPixels,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';

export const MAX_GALLERY_ITEMS = 8;
export const MAX_GALLERY_VIDEOS = 4;

export const GALLERY_INTRO_SEC = 0.6;
export const GALLERY_EXIT_SEC = 0.6;
export const GALLERY_ENTRANCE_DUR_SEC = 0.7;

export const DEFAULT_GALLERY_INTERVAL = 0.7;
export const DEFAULT_GALLERY_FLOAT_INTENSITY = 1.0;
export const DEFAULT_GALLERY_END_HOLD = 3.0;
export const DEFAULT_GALLERY_STYLE_ID: GalleryStyleId = 'gal_float';

export const GALLERY_STYLE_IDS: GalleryStyleId[] = [
  'gal_float',
  'gal_orbit',
  'gal_polaroid',
  'gal_wall',
  'gal_bubbles',
  'gal_circle',
];

export const DEFAULT_GALLERY_ITEMS: GalleryItemConfig[] = [
  {
    id: 'demo-gal-1',
    kind: 'image',
    fileName: 'لقطة-١.png',
    caption: 'المرحلة *الأولى*',
    fit: 'cover',
    displayWidth: 1600,
    displayHeight: 1000,
  },
  {
    id: 'demo-gal-2',
    kind: 'image',
    fileName: 'لقطة-٢.png',
    caption: 'تطوّر *التصميم*',
    fit: 'cover',
    displayWidth: 900,
    displayHeight: 1200,
  },
  {
    id: 'demo-gal-3',
    kind: 'image',
    fileName: 'لقطة-٣.png',
    caption: 'تفاصيل *دقيقة*',
    fit: 'cover',
    displayWidth: 1200,
    displayHeight: 1200,
  },
  {
    id: 'demo-gal-4',
    kind: 'image',
    fileName: 'لقطة-٤.png',
    caption: 'النتيجة *النهائية*',
    fit: 'cover',
    displayWidth: 1600,
    displayHeight: 900,
  },
];

export function isGalleryStyleId(styleId?: string | null): styleId is GalleryStyleId {
  return (
    styleId === 'gal_float' ||
    styleId === 'gal_orbit' ||
    styleId === 'gal_polaroid' ||
    styleId === 'gal_wall' ||
    styleId === 'gal_bubbles' ||
    styleId === 'gal_circle'
  );
}

export function resolveGalleryStyleId(styleId?: string | null): GalleryStyleId {
  return isGalleryStyleId(styleId) ? styleId : DEFAULT_GALLERY_STYLE_ID;
}

export function isGalleryActive(custom?: Partial<StyleCustomization> | null): boolean {
  if (!custom) return false;
  return (
    (custom.mode === 'image' || custom.mode === 'video') &&
    Boolean(custom.galleryEnabled)
  );
}

/**
 * Returns true if the current videoBox/position covers the fullscreen safe region.
 * Style backgrounds are allowed ONLY in fullscreen; non-fullscreen boxes default to green.
 */
export function isGalleryBoxFullscreen(custom?: Partial<StyleCustomization> | null): boolean {
  if (!custom) return false;
  if (custom.position === 'fullscreen') {
    const b = custom.videoBox;
    if (!b) return true;
    return b.w >= 84 && b.h >= 84;
  }
  const b = custom.videoBox;
  if (!b) return false;
  return b.w >= 86 && b.h >= 86;
}

/**
 * Resolves the effective background mode for Gallery styles:
 * Supports 'style', 'green', and 'black' across all box sizes.
 */
export function resolveGalleryBackground(custom: StyleCustomization): BackgroundMode {
  return resolveBackgroundMode(custom);
}

export function getEffectiveGalleryItems(
  content?: QuoteContent,
  custom?: StyleCustomization
): GalleryItemConfig[] {
  const raw =
    (content?.galleryItems && content.galleryItems.length > 0
      ? content.galleryItems
      : custom?.galleryItems && custom.galleryItems.length > 0
        ? custom.galleryItems
        : DEFAULT_GALLERY_ITEMS) || DEFAULT_GALLERY_ITEMS;
  return raw.slice(0, MAX_GALLERY_ITEMS);
}

export interface GallerySchedule {
  intro: number;
  enter: number;
  hold: number;
  exitStart: number;
  exit: number;
  total: number;
  appearance: GalleryAppearanceMode;
  interval: number;
  endHold: number;
  itemCount: number;
  itemStarts: number[];
  itemAppearEnds: number[];
  lastAppearEnd: number;
}

/**
 * Pure deterministic timing schedule for Gallery ("عناصر متعددة") mode:
 * - Fixed intro = 0.6s, fixed exit = 0.6s
 * - Entrance duration per item = 0.7s
 * - Staggered: item i appears at intro + i * interval
 * - Together: all items appear at intro
 * - End hold = 1..8s (default 3s) after the last item finishes entering
 */
export function computeGallerySchedule(params: {
  itemCount: number;
  appearance?: GalleryAppearanceMode;
  interval?: number;
  endHold?: number;
}): GallerySchedule {
  const itemCount = clamp(Math.round(params.itemCount || 1), 1, MAX_GALLERY_ITEMS);
  const appearance: GalleryAppearanceMode =
    params.appearance === 'together' ? 'together' : 'stagger';
  const interval = clamp(
    Number.isFinite(params.interval) ? params.interval! : DEFAULT_GALLERY_INTERVAL,
    0.3,
    2.0
  );
  const endHold = clamp(
    Number.isFinite(params.endHold) ? params.endHold! : DEFAULT_GALLERY_END_HOLD,
    1.0,
    8.0
  );

  const intro = GALLERY_INTRO_SEC;
  const exit = GALLERY_EXIT_SEC;
  const itemStarts: number[] = [];
  const itemAppearEnds: number[] = [];

  for (let i = 0; i < itemCount; i++) {
    const start = appearance === 'stagger' ? intro + i * interval : intro;
    itemStarts.push(Number(start.toFixed(3)));
    itemAppearEnds.push(Number((start + GALLERY_ENTRANCE_DUR_SEC).toFixed(3)));
  }

  const lastAppearEnd = itemAppearEnds[itemCount - 1] ?? intro + GALLERY_ENTRANCE_DUR_SEC;
  const enter = Number(lastAppearEnd.toFixed(2));
  const hold = Number(endHold.toFixed(2));
  const exitStart = Number((enter + hold).toFixed(2));
  const total = Number((exitStart + exit).toFixed(2));

  return {
    intro,
    enter,
    hold,
    exitStart,
    exit,
    total,
    appearance,
    interval,
    endHold: hold,
    itemCount,
    itemStarts,
    itemAppearEnds,
    lastAppearEnd,
  };
}

/**
 * Computes which item index is currently highlighted (or -1 if highlight is disabled / none active).
 * Returns smooth per-item focus weight [0..1] for crisp transitions.
 */
export function computeGalleryFocusWeights(
  t: number,
  schedule: GallerySchedule,
  highlightEnabled: boolean,
  styleId: GalleryStyleId
): { activeIndex: number; weights: number[] } {
  const n = schedule.itemCount;
  const weights = new Array<number>(n).fill(1);
  if (!highlightEnabled || n <= 1) {
    return { activeIndex: -1, weights };
  }

  // Orbit & Circle styles determine focus purely by orbital proximity
  if (styleId === 'gal_orbit' || styleId === 'gal_circle') {
    return { activeIndex: -1, weights };
  }

  let activeIndex = -1;
  if (schedule.appearance === 'stagger') {
    if (t < schedule.itemStarts[0]) {
      return { activeIndex: -1, weights };
    }
    if (t < schedule.lastAppearEnd + 0.15) {
      // Most recently appeared item is the active focus
      for (let i = n - 1; i >= 0; i--) {
        if (t >= schedule.itemStarts[i]) {
          activeIndex = i;
          break;
        }
      }
    } else if (t < schedule.exitStart) {
      // During endHold, cycle softly or hold focus cleanly across items
      const holdElapsed = t - (schedule.lastAppearEnd + 0.15);
      const holdSpan = Math.max(0.5, schedule.exitStart - (schedule.lastAppearEnd + 0.15));
      // Keep the last item highlighted briefly, then cycle smoothly through items during long holds
      if (holdSpan >= 2.2) {
        const step = holdSpan / n;
        activeIndex = Math.min(n - 1, Math.floor(holdElapsed / step));
      } else {
        activeIndex = n - 1;
      }
    } else {
      activeIndex = n - 1;
    }
  } else {
    // Together mode: cycle highlight gently during hold if highlight is ON
    if (t < schedule.intro) return { activeIndex: -1, weights };
    const activeSpan = Math.max(0.6, schedule.exitStart - schedule.intro);
    const step = activeSpan / n;
    activeIndex = clamp(Math.floor((t - schedule.intro) / step), 0, n - 1);
  }

  // Smooth transition weight
  for (let i = 0; i < n; i++) {
    weights[i] = i === activeIndex ? 1 : 0;
  }

  return { activeIndex, weights };
}

export interface GalleryLayoutSlot {
  index: number;
  itemId: string;
  // Base center in canvas coordinates (strictly inside boxPx with float/scale/rotation margin)
  cx: number;
  cy: number;
  // Outer card/frame width & height (at scale 1.0)
  width: number;
  height: number;
  // Media display aspect ratio (width / height)
  mediaAspect: number;
  // Depth layer 0..1 (higher = closer to viewer, slightly larger, drawn on top)
  depth: number;
  // Base resting tilt in radians (small organic tilt for polaroid/float)
  baseTiltRad: number;
  // Lissajous drift parameters
  ampX: number;
  ampY: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  swayFreq: number;
  swayPhase: number;
  // Safe inner bounds for center point (cx + dx, cy + dy) so card NEVER touches box edge
  minCx: number;
  maxCx: number;
  minCy: number;
  maxCy: number;
  // Extra vertical space reserved below card for captions (e.g. pill chip or polaroid strip)
  captionPadBottom: number;
}

export interface GalleryComputedLayout {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  slots: GalleryLayoutSlot[];
  maxSlotPxWidth: number;
  maxSlotPxHeight: number;
}

const layoutMemoCache = new Map<string, GalleryComputedLayout>();

function getSlotGridDimensions(
  count: number,
  boxAspect: number,
  format: AspectRatioFormat
): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) {
    return boxAspect >= 1.05 ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
  }
  if (count === 3) {
    if (boxAspect >= 1.55) return { cols: 3, rows: 1 };
    if (boxAspect <= 0.72) return { cols: 1, rows: 3 };
    return { cols: 2, rows: 2 };
  }
  if (count === 4) {
    if (boxAspect >= 2.2) return { cols: 4, rows: 1 };
    if (boxAspect <= 0.55) return { cols: 1, rows: 4 };
    return { cols: 2, rows: 2 };
  }
  if (count === 5 || count === 6) {
    if (boxAspect >= 1.05 && format === '16:9') return { cols: 3, rows: 2 };
    if (boxAspect >= 1.15) return { cols: 3, rows: 2 };
    return { cols: 2, rows: 3 };
  }
  // 7 or 8 items
  if (boxAspect >= 1.1) return { cols: 4, rows: 2 };
  return { cols: 2, rows: 4 };
}

/**
 * Pure deterministic layout engine computed once at final box size:
 * - Packs 1–8 items inside `boxPx` adapting to box aspect and 16:9 / 9:16 format.
 * - Preserves each item's natural display aspect ratio (never stretches).
 * - Reserves explicit margin for Lissajous drift + 1.08 focus scale + ±2° sway so NO item ever touches/clips the box edge.
 */
export function computeGalleryLayout(params: {
  items: GalleryItemConfig[];
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  format: AspectRatioFormat;
  seed: number;
  styleId: GalleryStyleId;
  floatIntensity: number;
  highlightEnabled: boolean;
}): GalleryComputedLayout {
  const {
    items,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    format,
    seed,
    styleId,
    floatIntensity,
    highlightEnabled,
  } = params;

  const intensity = clamp(floatIntensity, 0, 1.5);
  const cacheKey = [
    styleId,
    format,
    seed,
    Math.round(boxX),
    Math.round(boxY),
    Math.round(boxWidth),
    Math.round(boxHeight),
    intensity.toFixed(2),
    highlightEnabled ? '1' : '0',
    items
      .map(
        (it) =>
          `${it.id}:${it.displayWidth}x${it.displayHeight}:${it.fit}:${it.caption ? 1 : 0}`
      )
      .join('|'),
  ].join('#');

  const cached = layoutMemoCache.get(cacheKey);
  if (cached) return cached;

  const n = Math.max(1, Math.min(MAX_GALLERY_ITEMS, items.length));
  const boxAspect = boxWidth / Math.max(1, boxHeight);
  const rng = mulberry32(combineSeed(seed, styleId.length * 911 + n * 73));

  const { cols, rows } = getSlotGridDimensions(n, boxAspect, format);
  const isScattered =
    styleId === 'gal_float' || styleId === 'gal_polaroid' || styleId === 'gal_bubbles';
  const isCircular = styleId === 'gal_bubbles' || styleId === 'gal_circle';

  // Inner safety pad so shadows/borders/float never touch box boundary
  const outerSafetyPad = clamp(Math.round(Math.min(boxWidth, boxHeight) * 0.032), 10, 28);
  const maxFloatBasePx = clamp(Math.min(boxWidth, boxHeight) * 0.022, 6, 18);
  const focusScaleMax = highlightEnabled ? (styleId === 'gal_circle' ? 1.18 : 1.08) : 1.0;

  const usableW = Math.max(60, boxWidth - outerSafetyPad * 2);
  const usableH = Math.max(60, boxHeight - outerSafetyPad * 2);

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  // Deterministic depth layers: balanced mix of foreground, midground, background
  const depthOrder: number[] = [];
  for (let i = 0; i < n; i++) {
    depthOrder.push(i);
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = depthOrder[i];
    depthOrder[i] = depthOrder[j];
    depthOrder[j] = tmp;
  }

  const slots: GalleryLayoutSlot[] = [];
  let maxSlotPxWidth = 0;
  let maxSlotPxHeight = 0;

  for (let i = 0; i < n; i++) {
    const item = items[i];
    const row = Math.floor(i / cols);
    const itemsInRow = row === rows - 1 ? n - row * cols : cols;
    const colInRow = i - row * cols;

    // Center the last row when it has fewer items than `cols`
    const rowOffsetCols = (cols - itemsInRow) * 0.5;
    const baseCellCx = boxX + outerSafetyPad + (colInRow + rowOffsetCols + 0.5) * cellW;
    const baseCellCy = boxY + outerSafetyPad + (row + 0.5) * cellH;

    const rawAspect =
      item.displayWidth > 0 && item.displayHeight > 0
        ? item.displayWidth / item.displayHeight
        : 16 / 9;
    const mediaAspect = clamp(rawAspect, 0.42, 2.45);

    const depthRank = n > 1 ? depthOrder[i] / (n - 1) : 0.75;
    const depth = isScattered ? lerp(0.28, 1.0, depthRank) : lerp(0.55, 0.95, depthRank);

    // Slight size variation by depth layer (scattered styles) or uniform crisp tiles (wall)
    const depthSizeMult =
      styleId === 'gal_wall'
        ? 0.94
        : isCircular
          ? lerp(0.84, 1.04, depth)
          : lerp(0.86, 1.06, depth);

    // Allow light overlap in scattered styles while ensuring each item stays mostly visible
    const cellFillRatio =
      styleId === 'gal_wall'
        ? 0.88
        : isScattered
          ? n === 1
            ? 0.82
            : 0.92
          : 0.84;

    // Reserve room for focus scale (1.08), rotation (~±4° max), and caption overhang
    const hasCaption = Boolean(item.caption && stripKeywordMarkers(item.caption).trim().length > 0);
    const captionPadBottom =
      styleId === 'gal_float' && hasCaption
        ? clamp(Math.round(cellH * 0.08), 8, 22)
        : styleId === 'gal_bubbles' && hasCaption
          ? clamp(Math.round(cellH * 0.14), 14, 34)
          : 0;

    // Maximum bounding box inside cell (accounting for focus scale + float drift)
    const driftReserve = maxFloatBasePx * intensity * lerp(0.65, 1.05, depth);
    const availWForItem = Math.max(
      44,
      (cellW * cellFillRatio * depthSizeMult) / focusScaleMax - (styleId === 'gal_wall' ? 8 : 4)
    );
    const availHForItem = Math.max(
      44,
      (cellH * cellFillRatio * depthSizeMult - captionPadBottom) / focusScaleMax -
        (styleId === 'gal_wall' ? 8 : 4)
    );

    let cardW: number;
    let cardH: number;

    if (isCircular) {
      const diameter = Math.max(44, Math.min(availWForItem, availHForItem));
      cardW = diameter;
      cardH = diameter;
    } else if (styleId === 'gal_wall') {
      // Masonry / frosted glass grid tiles: gently respect item aspect while fitting cleanly inside cell
      const targetAspect =
        item.fit === 'contain'
          ? mediaAspect
          : clamp(lerp(cellW / Math.max(1, cellH), mediaAspect, 0.55), 0.65, 1.9);
      cardW = availWForItem;
      cardH = cardW / targetAspect;
      if (cardH > availHForItem) {
        cardH = availHForItem;
        cardW = cardH * targetAspect;
      }
    } else if (styleId === 'gal_polaroid') {
      // Polaroid frame has extra white bottom strip (~20% of photo height)
      const stripRatio = 0.22;
      const sidePadRatio = 0.08;
      // Fit photo aspect inside cardW x (cardH / (1 + stripRatio))
      const maxPhotoW = availWForItem / (1 + sidePadRatio * 2);
      const maxPhotoH = availHForItem / (1 + sidePadRatio + stripRatio);
      let photoW = maxPhotoW;
      let photoH = photoW / mediaAspect;
      if (photoH > maxPhotoH) {
        photoH = maxPhotoH;
        photoW = photoH * mediaAspect;
      }
      cardW = photoW * (1 + sidePadRatio * 2);
      cardH = photoH * (1 + sidePadRatio + stripRatio);
    } else {
      // gal_float and gal_orbit base slot sizing: preserves display aspect accurately
      cardW = availWForItem;
      cardH = cardW / mediaAspect;
      if (cardH > availHForItem) {
        cardH = availHForItem;
        cardW = cardH * mediaAspect;
      }
    }

    // Clamp card sizes strictly so card * focusScaleMax + rotation + drift fits inside boxPx
    const maxAllowedW = Math.max(40, (usableW - driftReserve * 2) / (focusScaleMax * 1.06));
    const maxAllowedH = Math.max(
      40,
      (usableH - driftReserve * 2 - captionPadBottom) / (focusScaleMax * 1.06)
    );
    if (cardW > maxAllowedW) {
      const k = maxAllowedW / cardW;
      cardW *= k;
      cardH *= k;
    }
    if (cardH > maxAllowedH) {
      const k = maxAllowedH / cardH;
      cardW *= k;
      cardH *= k;
    }

    cardW = Math.max(36, Math.round(cardW));
    cardH = Math.max(36, Math.round(cardH));

    // Organic seeded scatter offset (light overlap allowed in scattered styles, zero in wall)
    const jitterScale =
      styleId === 'gal_wall'
        ? 0.02
        : styleId === 'gal_orbit'
          ? 0
          : n === 1
            ? 0
            : 0.14;
    const jitterX = (rng() - 0.5) * 2 * cellW * jitterScale;
    const jitterY = (rng() - 0.5) * 2 * cellH * jitterScale;

    // Resting tilt in radians (small subtle angle for polaroids/float)
    const baseTiltDeg =
      styleId === 'gal_polaroid'
        ? (rng() - 0.5) * 9.0
        : styleId === 'gal_float'
          ? (rng() - 0.5) * 3.6
          : 0;
    const baseTiltRad = (baseTiltDeg * Math.PI) / 180;

    // Worst-case rotated + scaled half extents so we can enforce zero edge contact
    const maxRotRad = Math.abs(baseTiltRad) + (2.4 * Math.PI) / 180;
    const cosR = Math.cos(maxRotRad);
    const sinR = Math.sin(maxRotRad);
    const scaledHalfW = ((cardW * cosR + cardH * sinR) * 0.5) * focusScaleMax + 4;
    const scaledHalfH = ((cardW * sinR + cardH * cosR) * 0.5) * focusScaleMax + 4;

    const minCx = boxX + outerSafetyPad + scaledHalfW;
    const maxCx = boxX + boxWidth - outerSafetyPad - scaledHalfW;
    const minCy = boxY + outerSafetyPad + scaledHalfH;
    const maxCy = boxY + boxHeight - outerSafetyPad - scaledHalfH - captionPadBottom;

    // Ensure valid min/max even on tiny boxes
    const safeMinCx = Math.min(minCx, boxX + boxWidth * 0.5);
    const safeMaxCx = Math.max(maxCx, boxX + boxWidth * 0.5);
    const safeMinCy = Math.min(minCy, boxY + boxHeight * 0.5);
    const safeMaxCy = Math.max(maxCy, boxY + boxHeight * 0.5);

    // Lissajous drift amplitude (~10-18px at 1080p, scaled by intensity & depth, bounded by remaining room)
    const desiredAmp = lerp(10, 18, 0.35 + 0.65 * depth) * (Math.min(boxWidth, boxHeight) / 900);
    const clampedDesiredAmp = clamp(desiredAmp, 4, 18) * intensity;
    const roomX = Math.max(0, (safeMaxCx - safeMinCx) * 0.45);
    const roomY = Math.max(0, (safeMaxCy - safeMinCy) * 0.45);
    const ampX = Math.min(clampedDesiredAmp, roomX);
    const ampY = Math.min(clampedDesiredAmp * 0.92, roomY);

    // Clamp base center so baseCenter ± amp stays inside [safeMin, safeMax]
    const cx = clamp(baseCellCx + jitterX, safeMinCx + ampX, safeMaxCx - ampX);
    const cy = clamp(baseCellCy + jitterY, safeMinCy + ampY, safeMaxCy - ampY);

    const freqX = lerp(0.55, 0.95, rng());
    const freqY = lerp(0.48, 0.88, rng());
    const phaseX = rng() * Math.PI * 2;
    const phaseY = rng() * Math.PI * 2;
    const swayFreq = lerp(0.65, 1.15, rng());
    const swayPhase = rng() * Math.PI * 2;

    maxSlotPxWidth = Math.max(maxSlotPxWidth, Math.ceil(cardW * focusScaleMax));
    maxSlotPxHeight = Math.max(maxSlotPxHeight, Math.ceil(cardH * focusScaleMax));

    slots.push({
      index: i,
      itemId: item.id,
      cx,
      cy,
      width: cardW,
      height: cardH,
      mediaAspect,
      depth,
      baseTiltRad,
      ampX,
      ampY,
      freqX,
      freqY,
      phaseX,
      phaseY,
      swayFreq,
      swayPhase,
      minCx: safeMinCx,
      maxCx: safeMaxCx,
      minCy: safeMinCy,
      maxCy: safeMaxCy,
      captionPadBottom,
    });
  }

  const result: GalleryComputedLayout = {
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    slots,
    maxSlotPxWidth,
    maxSlotPxHeight,
  };

  if (layoutMemoCache.size >= 40) {
    const oldest = layoutMemoCache.keys().next().value;
    if (oldest) layoutMemoCache.delete(oldest);
  }
  layoutMemoCache.set(cacheKey, result);
  return result;
}

export interface GalleryItemMotionSample {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  rotationRad: number;
  alpha: number;
  brightnessAlpha: number;
  isFocused: boolean;
  entranceP: number;
  exitP: number;
  videoSourceTime: number;
}

/**
 * Pure function of `t`: evaluates an item's entrance, Lissajous floating drift, sway,
 * focus highlight (1.08 scale + 100% brightness vs ~70% for others), exit fade/drift,
 * and deterministic video source timestamp (starts when the item appears).
 */
export function sampleGalleryItemMotion(params: {
  slot: GalleryLayoutSlot;
  item: GalleryItemConfig;
  t: number;
  schedule: GallerySchedule;
  custom: StyleCustomization;
  focusWeight: number;
  hasActiveFocus: boolean;
  styleId: GalleryStyleId;
}): GalleryItemMotionSample {
  const { slot, item, t, schedule, custom, focusWeight, hasActiveFocus, styleId } = params;

  const itemStart = schedule.itemStarts[slot.index] ?? schedule.intro;
  const entranceRaw = progress(t, itemStart, itemStart + GALLERY_ENTRANCE_DUR_SEC);
  const exitRaw = progress(t, schedule.exitStart, schedule.total);

  if (entranceRaw <= 0.001 || exitRaw >= 0.999) {
    return {
      visible: false,
      x: slot.cx,
      y: slot.cy,
      scale: 0.9,
      rotationRad: slot.baseTiltRad,
      alpha: 0,
      brightnessAlpha: 0,
      isFocused: false,
      entranceP: 0,
      exitP: exitRaw,
      videoSourceTime: item.trimIn ?? 0,
    };
  }

  const entranceEase = easeOutBack(entranceRaw, 1.35);
  const entranceAlpha = easeOutCubic(clamp(entranceRaw * 1.45, 0, 1));
  const exitEase = easeInCubic(exitRaw);
  const exitAlpha = 1 - exitEase;

  const intensity = clamp(custom.galleryFloatIntensity ?? DEFAULT_GALLERY_FLOAT_INTENSITY, 0, 1.5);
  const floatAge = Math.max(0, t - itemStart);
  const floatEnvelope = easeOutCubic(clamp(floatAge / 0.5, 0, 1)) * (1 - exitEase * 0.5);

  // Seeded Lissajous drift + gentle sway (±2°)
  const driftX = Math.sin(floatAge * slot.freqX + slot.phaseX) * slot.ampX * floatEnvelope;
  const driftY = Math.cos(floatAge * slot.freqY + slot.phaseY) * slot.ampY * floatEnvelope;
  const swayRad =
    Math.sin(floatAge * slot.swayFreq + slot.swayPhase) *
    ((2.0 * Math.PI) / 180) *
    clamp(intensity, 0, 1.5) *
    floatEnvelope;

  // Entrance rise + exit drift down (clamped cleanly inside safe vertical bounds)
  const riseMax = Math.min(34, Math.max(10, (slot.maxCy - slot.minCy) * 0.25 + 14));
  const riseOffset = (1 - easeOutCubic(entranceRaw)) * riseMax;
  const exitDropOffset = exitEase * Math.min(28, riseMax);

  // Damped pendulum swing flavor for Polaroid on entrance
  const polaroidSwingRad =
    styleId === 'gal_polaroid'
      ? Math.sin(entranceRaw * Math.PI * 2.4) *
        Math.exp(-entranceRaw * 3.1) *
        ((9.5 * Math.PI) / 180) *
        (slot.index % 2 === 0 ? 1 : -1)
      : 0;

  const isFocused = hasActiveFocus && focusWeight >= 0.5;
  const focusScale = hasActiveFocus ? lerp(1.0, 1.08, focusWeight) : 1.0;
  const entranceScale = lerp(0.9, 1.0, clamp(entranceEase, 0, 1.08));
  const exitScale = lerp(1.0, 0.96, exitEase);
  const scale = entranceScale * focusScale * exitScale;

  const rawX = slot.cx + driftX;
  const rawY = slot.cy + driftY + riseOffset + exitDropOffset;
  const x = clamp(rawX, slot.minCx, slot.maxCx);
  const y = clamp(rawY, slot.minCy, slot.maxCy);

  // Highlight current item (100% bright) vs others (~70%)
  const dimFactor = hasActiveFocus ? lerp(0.7, 1.0, focusWeight) : 1.0;
  const alpha = clamp(entranceAlpha * exitAlpha, 0, 1);
  const brightnessAlpha = clamp(alpha * dimFactor, 0, 1);

  // Deterministic video source timestamp (starts when item appears)
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

  return {
    visible: alpha > 0.01,
    x,
    y,
    scale,
    rotationRad: slot.baseTiltRad + swayRad + polaroidSwingRad,
    alpha,
    brightnessAlpha,
    isFocused,
    entranceP: entranceRaw,
    exitP: exitRaw,
    videoSourceTime,
  };
}

/**
 * Generates a crisp, cached procedural demo poster canvas for an item (used when no file is uploaded
 * or after loading a preset before re-selecting files).
 */
export function getGalleryDemoPosterCanvas(
  item: GalleryItemConfig,
  index: number
): HTMLCanvasElement {
  const aspect = clamp(
    (item.displayWidth || 1600) / Math.max(1, item.displayHeight || 1000),
    0.45,
    2.2
  );
  const w = aspect >= 1 ? 480 : Math.round(480 * aspect);
  const h = aspect >= 1 ? Math.round(480 / aspect) : 480;
  const key = `gal-demo-poster|${item.id}|${index}|${w}x${h}|${item.kind}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const palettes: [string, string, string][] = [
      ['#1E293B', '#3B82F6', '#93C5FD'],
      ['#312E81', '#8B5CF6', '#DDD6FE'],
      ['#3F1D38', '#EC4899', '#FBCFE8'],
      ['#172554', '#0EA5E9', '#BAE6FD'],
      ['#451A03', '#F59E0B', '#FDE68A'],
      ['#1F2937', '#F97316', '#FED7AA'],
      ['#2E1065', '#A855F7', '#E9D5FF'],
      ['#1E1B4B', '#6366F1', '#C7D2FE'],
    ];
    const [c0, c1, c2] = palettes[index % palettes.length];
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.6, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle geometric architectural shapes (no green hues so chroma key stays clean)
    const rng = mulberry32(combineSeed(index + 17, w * 31 + h));
    ctx.save();
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.08 + rng() * 0.1).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, Math.min(w, h) * (0.14 + rng() * 0.24), 0, Math.PI * 2);
      ctx.fill();
    }
    // Crisp horizon / mountain silhouette
    ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.68);
    ctx.quadraticCurveTo(w * 0.28, h * 0.44, w * 0.56, h * 0.62);
    ctx.quadraticCurveTo(w * 0.8, h * 0.74, w, h * 0.54);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Small item badge in corner
    if (item.kind === 'video') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      const r = Math.min(w, h) * 0.055;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - r * 0.6, h * 0.5 - r);
      ctx.lineTo(w * 0.5 + r * 1.1, h * 0.5);
      ctx.lineTo(w * 0.5 - r * 0.6, h * 0.5 + r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  });
}

/**
 * Resolves the drawable image/canvas for a gallery item at `sourceTime`.
 */
export function resolveGalleryItemDrawable(
  content: QuoteContent,
  item: GalleryItemConfig,
  index: number,
  sourceTime: number
): HTMLImageElement | HTMLCanvasElement {
  const media: GalleryRuntimeMediaEntry | undefined = content.galleryMedia?.[item.id];
  if (media) {
    if (item.kind === 'video' && media.getFrame) {
      const frame = media.getFrame(sourceTime);
      if (frame) return frame;
    }
    if (media.poster) return media.poster;
  }
  return getGalleryDemoPosterCanvas(item, index);
}

/**
 * Draws a gallery item's media inside (x, y, w, h) respecting `fit` ('cover' | 'contain')
 * without EVER stretching the display aspect ratio.
 */
export function drawGalleryItemMedia(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  drawable: HTMLImageElement | HTMLCanvasElement,
  fit: 'cover' | 'contain',
  x: number,
  y: number,
  w: number,
  h: number,
  backdropFill?: string
): void {
  if (backdropFill) {
    ctx.fillStyle = backdropFill;
    ctx.fillRect(x, y, w, h);
  }
  drawFittedImage(ctx, drawable, { zoom: 1, offsetX: 0, offsetY: 0 }, fit, x, y, w, h, 1.0);
}

/**
 * Draws an Arabic/English RTL/LTR caption for a gallery item using the studio's RTL text layout
 * engine (never splitting Arabic into characters, supporting *keyword* spans across lines + diacritics).
 */
export function drawGalleryItemCaption(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  caption: string;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  fontFamily: string;
  fontWeight?: number;
  minFontSize?: number;
  maxFontSize?: number;
  fontSizeMultiplier: number;
  direction: ResolvedTextDirection;
  textColor: string;
  keywordColor: string;
  t: number;
  revealStartSec: number;
  alpha: number;
  underlineKeywords?: boolean;
}): void {
  const {
    ctx,
    caption,
    boxX,
    boxY,
    boxW,
    boxH,
    fontFamily,
    fontWeight = 700,
    minFontSize = 11,
    maxFontSize = 24,
    fontSizeMultiplier,
    direction,
    textColor,
    keywordColor,
    t,
    revealStartSec,
    alpha,
    underlineKeywords = true,
  } = params;

  const clean = stripKeywordMarkers(caption || '').trim();
  if (!clean || alpha <= 0.01 || boxW < 24 || boxH < 14) return;

  const layout = layoutArabicQuote(ctx, {
    text: caption,
    quotationMarks: 'none',
    fontFamily,
    fontWeight,
    minFontSize,
    maxFontSize,
    fontSizeMultiplier: clamp(fontSizeMultiplier || 1.0, 0.7, 1.3),
    lineHeightRatio: 1.25,
    boxX,
    boxY,
    boxWidth: boxW,
    boxHeight: boxH,
    align: 'center',
    direction,
  });

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  for (const w of layout.words) {
    applyStudioCanvasTextProps(ctx, layout.fontFamily, layout.fontWeight, w.fontSize, layout.direction);
    ctx.fillStyle = w.isKeyword ? keywordColor : textColor;
    drawBidiWord(ctx, w.text, w.x, w.y, layout.direction);
  }

  if (underlineKeywords) {
    for (let i = 0; i < layout.keywordLineRects.length; i++) {
      const rect = layout.keywordLineRects[i];
      const p = easeInOutCubic(
        progress(t, revealStartSec + 0.12 + i * 0.06, revealStartSec + 0.45 + i * 0.06)
      );
      if (p <= 0.02) continue;
      const ly = rect.baselineY + Math.max(2, layout.fontSize * 0.11);
      const curW = rect.width * p;
      const sx = layout.direction === 'ltr' ? rect.leftX : rect.rightX;
      const ex = layout.direction === 'ltr' ? rect.leftX + curW : rect.rightX - curW;
      ctx.strokeStyle = keywordColor;
      ctx.lineWidth = Math.max(1.8, layout.fontSize * 0.075);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, ly);
      ctx.lineTo(ex, ly);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Shared EventTimes calculation for all 5 Gallery styles:
 * returns { enterStart, itemTimes[], keywordTimes[], itemSfxStyle }.
 */
export function computeGalleryEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize,
  defaultFontAr: string,
  defaultFontEn: string
): SceneEventTimes {
  const items = getEffectiveGalleryItems(content, custom);
  const schedule = computeGallerySchedule({
    itemCount: items.length,
    appearance: custom.galleryAppearance,
    interval: custom.galleryInterval,
    endHold: custom.galleryEndHold,
  });

  const keywordTimes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const cap = items[i].caption || '';
    if (!cap.includes('*')) continue;
    const dir = resolveTextDirection(custom, cap);
    const font = custom.quoteFontOverride || (dir === 'ltr' ? defaultFontEn : defaultFontAr);
    const layout = layoutArabicQuote(ctx, {
      text: cap,
      quotationMarks: 'none',
      fontFamily: font,
      fontWeight: 700,
      minFontSize: 12,
      maxFontSize: 22,
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      lineHeightRatio: 1.25,
      boxX: 0,
      boxY: 0,
      boxWidth: Math.max(120, Math.round(size.baseWidth * 0.25)),
      boxHeight: 80,
      align: 'center',
      direction: dir,
    });
    const seen = new Set<number>();
    const start = schedule.itemStarts[i] ?? schedule.intro;
    for (const w of layout.words) {
      if (w.isKeyword && w.groupId !== null && !seen.has(w.groupId)) {
        seen.add(w.groupId);
        keywordTimes.push(Number((start + 0.18 + seen.size * 0.06).toFixed(3)));
      }
    }
  }

  return {
    enterStart: 0.04,
    itemTimes: schedule.itemStarts,
    keywordTimes,
    itemSfxStyle: custom.galleryItemSfxType || 'pop',
  };
}

/**
 * Resolves the active pixel box for Gallery mode (reusing videoBox + safe margin clamping).
 */
export function resolveGalleryBoxPixels(
  custom: StyleCustomization,
  size: RenderSize
): { boxX: number; boxY: number; boxWidth: number; boxHeight: number } {
  return videoBoxToPixels(
    custom.videoBox || DEFAULT_VIDEO_BOX,
    size.baseWidth,
    size.baseHeight,
    Boolean(custom.videoAllowOutOfMargin)
  );
}

/**
 * Helper to draw a dark scrim/dim overlay over unfocused items (strictly clipped to shape)
 * when "تمييز العنصر الحالي" is enabled, keeping focused item 100% bright and others ~70%.
 */
export function drawUnfocusedDimOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimAmount: number,
  isGreen: boolean,
  drawShapePath: () => void
): void {
  if (dimAmount <= 0.01) return;
  ctx.save();
  drawShapePath();
  ctx.clip();
  // In green mode keep edges crisp without alpha bleed outside shape
  ctx.fillStyle = isGreen
    ? `rgba(12, 16, 26, ${(dimAmount * 0.34).toFixed(3)})`
    : `rgba(8, 12, 22, ${(dimAmount * 0.32).toFixed(3)})`;
  ctx.fill();
  ctx.restore();
}

/**
 * Creates a clean rounded rectangle path centered at (0, 0) with width `w`, height `h`, radius `r`.
 */
export function traceCenteredRoundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  r: number
): void {
  const rad = clamp(r, 0, Math.min(w, h) * 0.5);
  ctx.beginPath();
  ctx.roundRect(-w * 0.5, -h * 0.5, w, h, rad);
}

/**
 * Helper to sample green pixel ratio (> 8% warning) on any HTMLImageElement or HTMLCanvasElement.
 */
export function computeDrawableGreenRatio(
  drawable: HTMLImageElement | HTMLCanvasElement
): number {
  try {
    const sampleSize = 64;
    const c = createBufferCanvas(sampleSize, sampleSize);
    const cctx = c.getContext('2d');
    if (!cctx) return 0;
    cctx.drawImage(drawable, 0, 0, sampleSize, sampleSize);
    const data = cctx.getImageData(0, 0, sampleSize, sampleSize).data;
    let totalOpaque = 0;
    let greenPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 32) continue;
      totalOpaque++;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d >= 0.18 && g >= 0.35) {
        let h = 0;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
        if (h >= 68 && h <= 165) greenPixels++;
      }
    }
    if (totalOpaque === 0) return 0;
    return greenPixels / totalOpaque;
  } catch {
    return 0;
  }
}

export { hexToRgba };
