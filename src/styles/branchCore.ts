import {
  AspectRatioFormat,
  BackgroundMode,
  BranchCameraMode,
  BranchLayoutMode,
  BranchStyleId,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  BranchScheduleResult,
  clamp,
  computeBranchSchedule,
  DEFAULT_BRANCH_DATA,
  DEFAULT_BRANCH_TIMING,
  detectTextDirection,
  easeInOutCubic,
  easeOutCubic,
  getBranchPositionBox,
  hexToRgba,
  lerp,
  progress,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';
import { withCameraLayer } from './pointsCamera';

export type ResolvedBranchLayout = 'radial' | 'horizontal' | 'vertical';

export interface Point2D {
  x: number;
  y: number;
}

export interface BranchNodeGeometry {
  id: string;
  level: 'root' | 'branch' | 'sub';
  branchIndex: number; // -1 for root
  subIndex: number; // -1 for root & branch
  text: string;
  direction: ResolvedTextDirection;
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  padX: number;
  padY: number;
  anchorX: number;
  anchorY: number;
  fontSize: number;
  layout: ArabicQuoteLayout;
  sectorAngle: number;
  connectorStart: number;
  connectorEnd: number;
  popTime: number;
  settledTime: number;
  keywordTimes: number[];
}

export interface BranchConnectorGeometry {
  fromNodeId: string;
  toNodeId: string;
  level: 'branch' | 'sub';
  branchIndex: number;
  subIndex: number;
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  startTime: number;
  endTime: number;
}

export interface BranchCameraTransform {
  active: boolean;
  scale: number;
  focusX: number;
  focusY: number;
  viewportCenterX: number;
  viewportCenterY: number;
}

export const DEFAULT_BRANCH_CAMERA: BranchCameraMode = 'follow';
export const DEFAULT_BRANCH_CAMERA_ZOOM = 1.4;
export const BRANCH_CAMERA_MIN_ZOOM = 1.1;
export const BRANCH_CAMERA_MAX_ZOOM = 1.8;

export function resolveBranchCameraMode(
  custom?: Partial<StyleCustomization> | null
): BranchCameraMode {
  const raw = custom?.branchCamera;
  if (raw === 'follow' || raw === 'auto' || raw === 'off') {
    return raw;
  }
  return DEFAULT_BRANCH_CAMERA;
}

export function resolveBranchCameraZoom(
  custom?: Partial<StyleCustomization> | null
): number {
  const raw = custom?.branchCameraZoom;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(raw, BRANCH_CAMERA_MIN_ZOOM, BRANCH_CAMERA_MAX_ZOOM);
  }
  return DEFAULT_BRANCH_CAMERA_ZOOM;
}

export interface BranchTreeLayoutPlan {
  schedule: BranchScheduleResult;
  effectiveLayout: ResolvedBranchLayout;
  effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  frameW: number;
  frameH: number;
  stageX: number;
  stageY: number;
  stageW: number;
  stageH: number;
  cameraMode: BranchCameraMode;
  cameraZoom: number;
  cameraEnabled: boolean;
  root: BranchNodeGeometry;
  branches: BranchNodeGeometry[];
  subs: BranchNodeGeometry[][];
  allNodes: BranchNodeGeometry[];
  connectors: BranchConnectorGeometry[];
  rootFontSize: number;
  branchFontSize: number;
  subFontSize: number;
  fontFamily: string;
  fontWeight: number;
  allKeywordTimes: number[];
  hasOverlap: boolean;
  hasOverflow: boolean;
}

export interface BuildBranchLayoutParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  custom: StyleCustomization;
  size: RenderSize;
  styleId: BranchStyleId;
  allowedArabicFonts: string[];
  defaultArabicFont: string;
  defaultEnglishFont: string;
  fontWeight?: number;
  lineHeightRatio?: number;
  minRootFont?: number;
  maxRootFont?: number;
  minBranchFont?: number;
  maxBranchFont?: number;
  minSubFont?: number;
  maxSubFont?: number;
  supportedLayouts?: ResolvedBranchLayout[];
  forceLayout?: ResolvedBranchLayout;
  nodePadXFactor?: number;
  nodePadYFactor?: number;
  minNodeGap?: number;
  extraTopReserve?: number;
  extraBottomReserve?: number;
  keywordOffsetSec?: number;
}

/**
 * Resolves the active branching tree layout mode ("auto" -> radial / horizontal / vertical).
 */
export function resolveEffectiveBranchLayout(
  requested: BranchLayoutMode | undefined,
  format: AspectRatioFormat,
  posBox: {
    boxWidth: number;
    boxHeight: number;
    effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
  },
  supported: ResolvedBranchLayout[] = ['radial', 'horizontal', 'vertical']
): ResolvedBranchLayout {
  const safeSupported: ResolvedBranchLayout[] =
    supported.length > 0 ? supported : ['radial', 'horizontal', 'vertical'];

  if (requested && requested !== 'auto') {
    if (safeSupported.includes(requested)) {
      return requested;
    }
  }

  // "Auto" picks radial for center/fullscreen 16:9, horizontal for wide bands and 16:9 columns,
  // vertical for 9:16 and narrow columns.
  let autoChoice: ResolvedBranchLayout;
  if (format === '9:16') {
    autoChoice = 'vertical';
  } else if (posBox.effectivePosition === 'left' || posBox.effectivePosition === 'right') {
    autoChoice = 'horizontal';
  } else {
    const aspect = posBox.boxWidth / Math.max(1, posBox.boxHeight);
    if (aspect > 2.35) {
      autoChoice = 'horizontal';
    } else if (aspect < 0.85) {
      autoChoice = 'vertical';
    } else {
      autoChoice = 'radial';
    }
  }

  if (safeSupported.includes(autoChoice)) {
    return autoChoice;
  }
  return safeSupported[0];
}

export function resolveBranchFontFamily(
  custom: StyleCustomization,
  textSample: string,
  allowedArabicFonts: string[],
  defaultArabicFont: string,
  defaultEnglishFont: string
): { fontFamily: string; direction: ResolvedTextDirection } {
  const direction = detectTextDirection(textSample, custom.textDirection || 'auto');
  if (direction === 'ltr') {
    return {
      fontFamily: custom.quoteFontOverride || defaultEnglishFont,
      direction: 'ltr',
    };
  }
  const requested = custom.quoteFontOverride || defaultArabicFont;
  const fontFamily = allowedArabicFonts.includes(requested)
    ? requested
    : defaultArabicFont;
  return { fontFamily, direction: 'rtl' };
}

function measureNodeBox(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  lineHeightRatio: number,
  maxTextWidth: number,
  maxTextHeight: number,
  padX: number,
  padY: number,
  align: 'right' | 'center' | 'left',
  direction: ResolvedTextDirection
): { layout: ArabicQuoteLayout; w: number; h: number } {
  const layout = layoutArabicQuote(ctx, {
    text,
    quotationMarks: 'none',
    fontFamily,
    fontWeight,
    minFontSize: Math.max(10, Math.floor(fontSize * 0.88)),
    maxFontSize: Math.ceil(fontSize),
    fontSizeMultiplier: 1,
    lineHeightRatio,
    boxX: 0,
    boxY: 0,
    boxWidth: Math.max(48, maxTextWidth),
    boxHeight: Math.max(24, maxTextHeight),
    align,
    direction,
    verticalAlign: 'top',
  });

  const contentW = Math.max(44, Math.ceil(layout.maxLineWidth));
  const contentH = Math.max(Math.ceil(layout.fontSize * 1.3), Math.ceil(layout.totalHeight));
  return {
    layout,
    w: Math.ceil(contentW + padX * 2),
    h: Math.ceil(contentH + padY * 2),
  };
}

function repositionLayoutInsideBox(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  lineHeightRatio: number,
  x: number,
  y: number,
  w: number,
  h: number,
  padX: number,
  padY: number,
  align: 'right' | 'center' | 'left',
  direction: ResolvedTextDirection
): ArabicQuoteLayout {
  return layoutArabicQuote(ctx, {
    text,
    quotationMarks: 'none',
    fontFamily,
    fontWeight,
    minFontSize: Math.max(10, Math.floor(fontSize * 0.92)),
    maxFontSize: Math.ceil(fontSize),
    fontSizeMultiplier: 1,
    lineHeightRatio,
    boxX: x + padX,
    boxY: y + padY,
    boxWidth: Math.max(40, w - padX * 2),
    boxHeight: Math.max(20, h - padY * 2),
    align,
    direction,
    verticalAlign: 'center',
  });
}

interface PlacedRect {
  id: string;
  level: 'root' | 'branch' | 'sub';
  branchIndex: number;
  subIndex: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  padX: number;
  padY: number;
  fontSize: number;
  sectorAngle: number;
  text: string;
  direction: ResolvedTextDirection;
}

export function checkNodesOverlap(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  minGap: number = 4
): boolean {
  const halfGap = minGap * 0.5;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      const overlapX =
        Math.min(a.x + a.w + halfGap, b.x + b.w + halfGap) -
        Math.max(a.x - halfGap, b.x - halfGap);
      const overlapY =
        Math.min(a.y + a.h + halfGap, b.y + b.h + halfGap) -
        Math.max(a.y - halfGap, b.y - halfGap);
      if (overlapX > 0.5 && overlapY > 0.5) {
        return true;
      }
    }
  }
  return false;
}

export function checkNodesOutsideBounds(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  tolerance: number = 1.5
): boolean {
  const minX = bounds.x - tolerance;
  const minY = bounds.y - tolerance;
  const maxX = bounds.x + bounds.w + tolerance;
  const maxY = bounds.y + bounds.h + tolerance;
  for (const r of rects) {
    if (r.x < minX || r.y < minY || r.x + r.w > maxX || r.y + r.h > maxY) {
      return true;
    }
  }
  return false;
}

function relaxNonOverlappingRects(
  rects: PlacedRect[],
  bounds: { x: number; y: number; w: number; h: number },
  minGap: number,
  iterations: number = 64
): void {
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.w;
  const maxY = bounds.y + bounds.h;

  for (let iter = 0; iter < iterations; iter++) {
    let anyMoved = false;
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i];
      for (let j = i + 1; j < rects.length; j++) {
        const b = rects[j];
        const reqX = (a.w + b.w) * 0.5 + minGap;
        const reqY = (a.h + b.h) * 0.5 + minGap;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const penX = reqX - Math.abs(dx);
        const penY = reqY - Math.abs(dy);

        if (penX > 0.25 && penY > 0.25) {
          anyMoved = true;
          const weightA = a.level === 'root' ? 0.15 : a.level === 'branch' ? 0.45 : 0.55;
          const weightB = b.level === 'root' ? 0.15 : b.level === 'branch' ? 0.45 : 0.55;
          const totalW = weightA + weightB;
          const shareA = weightA / totalW;
          const shareB = weightB / totalW;

          if (penX < penY) {
            const dir = dx === 0 ? (j % 2 === 0 ? 1 : -1) : Math.sign(dx);
            const push = penX + 0.6;
            a.cx -= dir * push * shareA;
            b.cx += dir * push * shareB;
          } else {
            const dir = dy === 0 ? (j % 2 === 0 ? 1 : -1) : Math.sign(dy);
            const push = penY + 0.6;
            a.cy -= dir * push * shareA;
            b.cy += dir * push * shareB;
          }
        }
      }
    }

    // Clamp inside bounds
    for (const r of rects) {
      const halfW = r.w * 0.5;
      const halfH = r.h * 0.5;
      const loX = minX + halfW;
      const hiX = maxX - halfW;
      const loY = minY + halfH;
      const hiY = maxY - halfH;
      r.cx = loX <= hiX ? clamp(r.cx, loX, hiX) : (minX + maxX) * 0.5;
      r.cy = loY <= hiY ? clamp(r.cy, loY, hiY) : (minY + maxY) * 0.5;
    }

    if (!anyMoved) break;
  }
}

function tryPlaceTreeAtScale(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  schedule: BranchScheduleResult,
  layoutMode: ResolvedBranchLayout,
  stage: { x: number; y: number; w: number; h: number },
  fontFamily: string,
  fontWeight: number,
  lineHeightRatio: number,
  rootFont: number,
  branchFont: number,
  subFont: number,
  padXFactor: number,
  padYFactor: number,
  minGap: number,
  textAlignForNodes: 'right' | 'center' | 'left',
  customDirection: StyleCustomization['textDirection']
): {
  rects: PlacedRect[];
  hasOverlap: boolean;
  hasOverflow: boolean;
} {
  const tree = schedule.tree;
  const branchCount = tree.branches.length;
  const hasAnySubs = tree.branches.some((b) => b.subs.length > 0);

  const rootPadX = Math.max(12, Math.round(rootFont * padXFactor * 1.15));
  const rootPadY = Math.max(8, Math.round(rootFont * padYFactor * 1.05));
  const branchPadX = Math.max(10, Math.round(branchFont * padXFactor));
  const branchPadY = Math.max(6, Math.round(branchFont * padYFactor));
  const subPadX = Math.max(8, Math.round(subFont * padXFactor * 0.9));
  const subPadY = Math.max(5, Math.round(subFont * padYFactor * 0.85));

  // Determine per-level max text widths based on layout geometry
  let rootMaxW: number;
  let branchMaxW: number;
  let subMaxW: number;

  if (layoutMode === 'horizontal') {
    const colCount = hasAnySubs ? 3 : 2;
    const colGap = Math.max(minGap * 2.2, stage.w * 0.055);
    const availW = stage.w - colGap * (colCount - 1);
    rootMaxW = availW * (hasAnySubs ? 0.24 : 0.34);
    branchMaxW = availW * (hasAnySubs ? 0.32 : 0.58);
    subMaxW = availW * 0.36;
  } else if (layoutMode === 'vertical') {
    rootMaxW = stage.w * 0.54;
    const perColW = (stage.w - minGap * (branchCount + 1)) / Math.max(1, branchCount);
    const stackedVertical = branchCount > 3 || perColW < 150;
    if (stackedVertical) {
      branchMaxW = stage.w * 0.42;
      subMaxW = stage.w * 0.44;
    } else {
      branchMaxW = Math.max(90, perColW - branchPadX * 2);
      subMaxW = Math.max(85, perColW - subPadX * 2);
    }
  } else {
    // radial
    rootMaxW = stage.w * 0.24;
    branchMaxW = stage.w * (hasAnySubs ? 0.2 : 0.28);
    subMaxW = stage.w * 0.2;
  }

  const rootDir = detectTextDirection(tree.root, customDirection || 'auto');
  const rootM = measureNodeBox(
    ctx,
    tree.root,
    fontFamily,
    fontWeight,
    rootFont,
    lineHeightRatio,
    rootMaxW,
    stage.h * 0.26,
    rootPadX,
    rootPadY,
    'center',
    rootDir
  );

  const branchMeasured = tree.branches.map((b) => {
    const dir = detectTextDirection(b.text, customDirection || 'auto');
    return {
      dir,
      ...measureNodeBox(
        ctx,
        b.text,
        fontFamily,
        fontWeight,
        branchFont,
        lineHeightRatio,
        branchMaxW,
        stage.h * 0.22,
        branchPadX,
        branchPadY,
        textAlignForNodes,
        dir
      ),
    };
  });

  const subMeasured = tree.branches.map((b) =>
    b.subs.map((s) => {
      const dir = detectTextDirection(s.text, customDirection || 'auto');
      return {
        dir,
        ...measureNodeBox(
          ctx,
          s.text,
          fontFamily,
          fontWeight,
          subFont,
          lineHeightRatio,
          subMaxW,
          stage.h * 0.16,
          subPadX,
          subPadY,
          textAlignForNodes,
          dir
        ),
      };
    })
  );

  const rects: PlacedRect[] = [];
  const centerX = stage.x + stage.w * 0.5;
  const centerY = stage.y + stage.h * 0.5;

  if (layoutMode === 'radial') {
    rects.push({
      id: 'root',
      level: 'root',
      branchIndex: -1,
      subIndex: -1,
      cx: centerX,
      cy: centerY,
      w: rootM.w,
      h: rootM.h,
      padX: rootPadX,
      padY: rootPadY,
      fontSize: rootFont,
      sectorAngle: 0,
      text: tree.root,
      direction: rootDir,
    });

    const weights = tree.branches.map((b) => Math.max(1, 1 + b.subs.length * 0.72));
    const totalWeight = weights.reduce((acc, v) => acc + v, 0);

    // Start at top-right (-35 deg) so RTL reading begins naturally on the right
    let angleCursor = -Math.PI * 0.35;
    const rx1 = stage.w * (hasAnySubs ? 0.24 : 0.33);
    const ry1 = stage.h * (hasAnySubs ? 0.25 : 0.33);
    const rx2 = stage.w * 0.415;
    const ry2 = stage.h * 0.425;

    for (let bi = 0; bi < branchCount; bi++) {
      const sectorSpan = (weights[bi] / totalWeight) * Math.PI * 2;
      const midAngle = angleCursor + sectorSpan * 0.5;
      const bm = branchMeasured[bi];

      const bx = centerX + Math.cos(midAngle) * rx1;
      const by = centerY + Math.sin(midAngle) * ry1;

      rects.push({
        id: tree.branches[bi].id,
        level: 'branch',
        branchIndex: bi,
        subIndex: -1,
        cx: bx,
        cy: by,
        w: bm.w,
        h: bm.h,
        padX: branchPadX,
        padY: branchPadY,
        fontSize: branchFont,
        sectorAngle: midAngle,
        text: tree.branches[bi].text,
        direction: bm.dir,
      });

      const subs = tree.branches[bi].subs;
      const subSpan = Math.min(sectorSpan * 0.86, Math.max(0.28, subs.length * 0.36));
      for (let si = 0; si < subs.length; si++) {
        const frac = subs.length === 1 ? 0 : (si / (subs.length - 1)) - 0.5;
        const subAngle = midAngle + frac * subSpan;
        const sm = subMeasured[bi][si];
        const sx = centerX + Math.cos(subAngle) * rx2;
        const sy = centerY + Math.sin(subAngle) * ry2;

        rects.push({
          id: subs[si].id,
          level: 'sub',
          branchIndex: bi,
          subIndex: si,
          cx: sx,
          cy: sy,
          w: sm.w,
          h: sm.h,
          padX: subPadX,
          padY: subPadY,
          fontSize: subFont,
          sectorAngle: subAngle,
          text: subs[si].text,
          direction: sm.dir,
        });
      }

      angleCursor += sectorSpan;
    }
  } else if (layoutMode === 'horizontal') {
    // RTL tree: Root on the RIGHT, Branches in the middle, Sub-points on the LEFT
    const maxBranchW = Math.max(...branchMeasured.map((b) => b.w), 80);
    const maxSubW = hasAnySubs
      ? Math.max(...subMeasured.flat().map((s) => s.w), 70)
      : 0;

    const rootCx = stage.x + stage.w - rootM.w * 0.5 - 4;
    const subCx = hasAnySubs ? stage.x + maxSubW * 0.5 + 4 : stage.x + stage.w * 0.25;
    const branchCx = hasAnySubs
      ? lerp(rootCx - rootM.w * 0.5, subCx + maxSubW * 0.5, 0.48)
      : stage.x + maxBranchW * 0.5 + stage.w * 0.08;

    rects.push({
      id: 'root',
      level: 'root',
      branchIndex: -1,
      subIndex: -1,
      cx: rootCx,
      cy: centerY,
      w: rootM.w,
      h: rootM.h,
      padX: rootPadX,
      padY: rootPadY,
      fontSize: rootFont,
      sectorAngle: Math.PI,
      text: tree.root,
      direction: rootDir,
    });

    // Compute vertical slot height per branch proportional to its sub-tree height
    const branchRowHeights = tree.branches.map((b, bi) => {
      const subStackH =
        b.subs.length > 0
          ? subMeasured[bi].reduce((acc, s) => acc + s.h, 0) +
            Math.max(0, b.subs.length - 1) * minGap
          : 0;
      return Math.max(branchMeasured[bi].h, subStackH) + minGap;
    });
    const totalRowH = branchRowHeights.reduce((acc, v) => acc + v, 0);
    const scaleY = totalRowH > stage.h ? stage.h / totalRowH : 1;
    const usedH = totalRowH * scaleY;
    let yCursor = stage.y + (stage.h - usedH) * 0.5;

    for (let bi = 0; bi < branchCount; bi++) {
      const slotH = branchRowHeights[bi] * scaleY;
      const branchCy = yCursor + slotH * 0.5;
      const bm = branchMeasured[bi];

      rects.push({
        id: tree.branches[bi].id,
        level: 'branch',
        branchIndex: bi,
        subIndex: -1,
        cx: branchCx,
        cy: branchCy,
        w: bm.w,
        h: bm.h,
        padX: branchPadX,
        padY: branchPadY,
        fontSize: branchFont,
        sectorAngle: Math.PI,
        text: tree.branches[bi].text,
        direction: bm.dir,
      });

      const subs = tree.branches[bi].subs;
      if (subs.length > 0) {
        const rawSubStackH =
          subMeasured[bi].reduce((acc, s) => acc + s.h, 0) +
          Math.max(0, subs.length - 1) * minGap;
        const subGap =
          subs.length > 1
            ? Math.max(
                minGap * 0.7,
                Math.min(minGap * 1.4, (slotH - subMeasured[bi].reduce((a, s) => a + s.h, 0)) / (subs.length - 1))
              )
            : 0;
        const actualSubStackH =
          subMeasured[bi].reduce((acc, s) => acc + s.h, 0) +
          Math.max(0, subs.length - 1) * subGap;
        let sy = branchCy - Math.min(slotH, Math.max(actualSubStackH, rawSubStackH * scaleY)) * 0.5;

        for (let si = 0; si < subs.length; si++) {
          const sm = subMeasured[bi][si];
          rects.push({
            id: subs[si].id,
            level: 'sub',
            branchIndex: bi,
            subIndex: si,
            cx: subCx,
            cy: sy + sm.h * 0.5,
            w: sm.w,
            h: sm.h,
            padX: subPadX,
            padY: subPadY,
            fontSize: subFont,
            sectorAngle: Math.PI,
            text: subs[si].text,
            direction: sm.dir,
          });
          sy += sm.h + subGap;
        }
      }

      yCursor += slotH;
    }
  } else {
    // Vertical top-down tree: Root at TOP center, branches below.
    // For <= 3 branches and wide enough stage, use side-by-side RTL columns (first branch on RIGHT).
    // For >= 4 branches or narrow column, use compact RTL indented vertical hierarchy (branch on right, subs nested slightly left below it)
    const perColW = (stage.w - minGap * (branchCount + 1)) / Math.max(1, branchCount);
    const useStackedVertical = branchCount > 3 || perColW < 155;

    const rootCy = stage.y + rootM.h * 0.5 + 4;
    rects.push({
      id: 'root',
      level: 'root',
      branchIndex: -1,
      subIndex: -1,
      cx: useStackedVertical ? stage.x + stage.w * 0.5 : centerX,
      cy: rootCy,
      w: rootM.w,
      h: rootM.h,
      padX: rootPadX,
      padY: rootPadY,
      fontSize: rootFont,
      sectorAngle: Math.PI * 0.5,
      text: tree.root,
      direction: rootDir,
    });

    const contentTop = rootCy + rootM.h * 0.5 + Math.max(minGap * 2, stage.h * 0.045);
    const availH = Math.max(60, stage.y + stage.h - contentTop);

    if (!useStackedVertical) {
      // RTL columns: branch 0 on the right, branch N-1 on the left
      const colW = (stage.w - minGap * (branchCount - 1)) / branchCount;
      const maxBranchH = Math.max(...branchMeasured.map((b) => b.h), 40);
      const branchRowCy = contentTop + maxBranchH * 0.5;
      const subsTopY = branchRowCy + maxBranchH * 0.5 + Math.max(minGap * 1.8, stage.h * 0.035);

      for (let bi = 0; bi < branchCount; bi++) {
        // RTL order: bi = 0 is rightmost column
        const colIdxFromLeft = branchCount - 1 - bi;
        const colCenterX = stage.x + colIdxFromLeft * (colW + minGap) + colW * 0.5;
        const bm = branchMeasured[bi];

        rects.push({
          id: tree.branches[bi].id,
          level: 'branch',
          branchIndex: bi,
          subIndex: -1,
          cx: colCenterX,
          cy: branchRowCy,
          w: bm.w,
          h: bm.h,
          padX: branchPadX,
          padY: branchPadY,
          fontSize: branchFont,
          sectorAngle: Math.PI * 0.5,
          text: tree.branches[bi].text,
          direction: bm.dir,
        });

        const subs = tree.branches[bi].subs;
        let sy = subsTopY;
        for (let si = 0; si < subs.length; si++) {
          const sm = subMeasured[bi][si];
          rects.push({
            id: subs[si].id,
            level: 'sub',
            branchIndex: bi,
            subIndex: si,
            cx: colCenterX,
            cy: sy + sm.h * 0.5,
            w: sm.w,
            h: sm.h,
            padX: subPadX,
            padY: subPadY,
            fontSize: subFont,
            sectorAngle: Math.PI * 0.5,
            text: subs[si].text,
            direction: sm.dir,
          });
          sy += sm.h + minGap * 1.15;
        }
      }
    } else {
      // Stacked RTL vertical hierarchy: branches on the right column, their subs stacked cleanly on the left
      const branchRightEdge = stage.x + stage.w - 6;
      const subLeftEdge = stage.x + 6;

      const blockHeights = tree.branches.map((b, bi) => {
        const subH =
          b.subs.length > 0
            ? subMeasured[bi].reduce((acc, s) => acc + s.h, 0) +
              Math.max(0, b.subs.length - 1) * minGap
            : 0;
        return Math.max(branchMeasured[bi].h, subH) + minGap;
      });
      const totalBlockH = blockHeights.reduce((acc, v) => acc + v, 0);
      const yScale = totalBlockH > availH ? availH / totalBlockH : 1;
      let yCur = contentTop + Math.max(0, (availH - totalBlockH * yScale) * 0.5);

      for (let bi = 0; bi < branchCount; bi++) {
        const slotH = blockHeights[bi] * yScale;
        const bm = branchMeasured[bi];
        const bCy = yCur + slotH * 0.5;
        const bCx = branchRightEdge - bm.w * 0.5;

        rects.push({
          id: tree.branches[bi].id,
          level: 'branch',
          branchIndex: bi,
          subIndex: -1,
          cx: bCx,
          cy: bCy,
          w: bm.w,
          h: bm.h,
          padX: branchPadX,
          padY: branchPadY,
          fontSize: branchFont,
          sectorAngle: Math.PI * 0.75,
          text: tree.branches[bi].text,
          direction: bm.dir,
        });

        const subs = tree.branches[bi].subs;
        if (subs.length > 0) {
          const stackH =
            subMeasured[bi].reduce((acc, s) => acc + s.h, 0) +
            Math.max(0, subs.length - 1) * minGap;
          let sy = bCy - Math.min(slotH, stackH) * 0.5;
          for (let si = 0; si < subs.length; si++) {
            const sm = subMeasured[bi][si];
            rects.push({
              id: subs[si].id,
              level: 'sub',
              branchIndex: bi,
              subIndex: si,
              cx: subLeftEdge + sm.w * 0.5,
              cy: sy + sm.h * 0.5,
              w: sm.w,
              h: sm.h,
              padX: subPadX,
              padY: subPadY,
              fontSize: subFont,
              sectorAngle: Math.PI,
              text: subs[si].text,
              direction: sm.dir,
            });
            sy += sm.h + minGap;
          }
        }
        yCur += slotH;
      }
    }
  }

  relaxNonOverlappingRects(rects, stage, minGap, 68);

  const boxes = rects.map((r) => ({
    x: r.cx - r.w * 0.5,
    y: r.cy - r.h * 0.5,
    w: r.w,
    h: r.h,
  }));

  const hasOverlap = checkNodesOverlap(boxes, Math.max(2, minGap * 0.5));
  const hasOverflow = checkNodesOutsideBounds(boxes, stage, 2);

  return { rects, hasOverlap, hasOverflow };
}

function edgeAnchorBetween(from: BranchNodeGeometry, to: BranchNodeGeometry): {
  start: Point2D;
  end: Point2D;
} {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const halfFromW = from.w * 0.5;
  const halfFromH = from.h * 0.5;
  const halfToW = to.w * 0.5;
  const halfToH = to.h * 0.5;

  const scaleFrom = Math.min(
    Math.abs(dx) > 0.001 ? halfFromW / Math.abs(dx) : 1e6,
    Math.abs(dy) > 0.001 ? halfFromH / Math.abs(dy) : 1e6
  );
  const scaleTo = Math.min(
    Math.abs(dx) > 0.001 ? halfToW / Math.abs(dx) : 1e6,
    Math.abs(dy) > 0.001 ? halfToH / Math.abs(dy) : 1e6
  );

  return {
    start: {
      x: from.cx + dx * Math.min(0.49, scaleFrom),
      y: from.cy + dy * Math.min(0.49, scaleFrom),
    },
    end: {
      x: to.cx - dx * Math.min(0.49, scaleTo),
      y: to.cy - dy * Math.min(0.49, scaleTo),
    },
  };
}

function buildConnectorCubic(
  from: BranchNodeGeometry,
  to: BranchNodeGeometry,
  layoutMode: ResolvedBranchLayout,
  level: 'branch' | 'sub',
  branchIndex: number,
  subIndex: number,
  startTime: number,
  endTime: number
): BranchConnectorGeometry {
  const { start, end } = edgeAnchorBetween(from, to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let p1: Point2D;
  let p2: Point2D;

  if (layoutMode === 'horizontal') {
    p1 = { x: start.x + dx * 0.52, y: start.y };
    p2 = { x: start.x + dx * 0.48, y: end.y };
  } else if (layoutMode === 'vertical') {
    p1 = { x: start.x, y: start.y + dy * 0.52 };
    p2 = { x: end.x, y: start.y + dy * 0.48 };
  } else {
    // Smooth radial organic curve
    const perpX = -dy * 0.1;
    const perpY = dx * 0.1;
    p1 = { x: start.x + dx * 0.36 + perpX, y: start.y + dy * 0.36 + perpY };
    p2 = { x: start.x + dx * 0.72 - perpX * 0.45, y: start.y + dy * 0.72 - perpY * 0.45 };
  }

  return {
    fromNodeId: from.id,
    toNodeId: to.id,
    level,
    branchIndex,
    subIndex,
    p0: start,
    p1,
    p2,
    p3: end,
    startTime,
    endTime,
  };
}

/**
 * Computes the complete deterministic branching tree layout ONCE at FINAL size before animation.
 * Verifies zero node overlap and zero overflow; enables deterministic camera automatically when needed.
 */
export function buildBranchTreeLayout(params: BuildBranchLayoutParams): BranchTreeLayoutPlan {
  const {
    ctx,
    custom,
    size,
    allowedArabicFonts,
    defaultArabicFont,
    defaultEnglishFont,
    fontWeight = 700,
    lineHeightRatio = 1.48,
    minRootFont = 26,
    maxRootFont = 48,
    minBranchFont = 20,
    maxBranchFont = 34,
    minSubFont = 16,
    maxSubFont = 26,
    supportedLayouts = ['radial', 'horizontal', 'vertical'],
    forceLayout,
    nodePadXFactor = 0.72,
    nodePadYFactor = 0.42,
    minNodeGap = 14,
    extraTopReserve = 0,
    extraBottomReserve = 0,
    keywordOffsetSec = 0.22,
  } = params;

  const W = size.baseWidth;
  const H = size.baseHeight;
  const cameraMode = resolveBranchCameraMode(custom);
  const cameraZoom = resolveBranchCameraZoom(custom);

  let schedule = computeBranchSchedule(
    custom.branchData ?? DEFAULT_BRANCH_DATA,
    custom.branchTiming ?? DEFAULT_BRANCH_TIMING,
    { cameraActive: cameraMode === 'follow' }
  );

  const posBox = getBranchPositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H
  );

  const boxX = posBox.boxX;
  const boxY = posBox.boxY + extraTopReserve;
  const boxW = posBox.boxWidth;
  const boxH = Math.max(120, posBox.boxHeight - extraTopReserve - extraBottomReserve);

  const effectiveLayout =
    forceLayout ||
    resolveEffectiveBranchLayout(
      custom.branchLayout,
      custom.format,
      posBox,
      supportedLayouts
    );

  const sampleText = [
    schedule.tree.root,
    ...schedule.tree.branches.map((b) => b.text),
  ].join(' ');
  const { fontFamily } = resolveBranchFontFamily(
    custom,
    sampleText,
    allowedArabicFonts,
    defaultArabicFont,
    defaultEnglishFont
  );

  const mult = clamp(custom.fontSizeMultiplier || 1, 0.7, 1.3);
  const desiredRoot = clamp(Math.round(maxRootFont * mult), minRootFont, Math.round(maxRootFont * 1.25));
  const desiredBranch = clamp(Math.round(maxBranchFont * mult), minBranchFont, Math.round(maxBranchFont * 1.25));
  const desiredSub = clamp(Math.round(maxSubFont * mult), minSubFont, Math.round(maxSubFont * 1.25));

  const nodeAlign: 'right' | 'center' | 'left' =
    effectiveLayout === 'radial' ? 'center' : 'right';

  const baseStage = { x: boxX, y: boxY, w: boxW, h: boxH };

  // Helper to solve largest legible fonts inside a given stage
  const solveForStage = (
    stage: { x: number; y: number; w: number; h: number },
    allowBelowMin: boolean
  ) => {
    const steps = allowBelowMin ? 18 : 10;
    const minScale = allowBelowMin ? 0.42 : 0.72;
    let bestResult: {
      rects: PlacedRect[];
      rootFont: number;
      branchFont: number;
      subFont: number;
      hasOverlap: boolean;
      hasOverflow: boolean;
    } | null = null;

    for (let s = 0; s <= steps; s++) {
      const ratio = lerp(1.0, minScale, s / steps);
      const rF = Math.max(
        allowBelowMin ? 14 : minRootFont,
        Math.round(desiredRoot * ratio)
      );
      const bF = Math.min(
        rF - 2,
        Math.max(allowBelowMin ? 12 : minBranchFont, Math.round(desiredBranch * ratio))
      );
      const sF = Math.min(
        bF - 2,
        Math.max(allowBelowMin ? 10 : minSubFont, Math.round(desiredSub * ratio))
      );
      const gap = Math.max(6, Math.round(minNodeGap * ratio));

      const attempt = tryPlaceTreeAtScale(
        ctx,
        schedule,
        effectiveLayout,
        stage,
        fontFamily,
        fontWeight,
        lineHeightRatio,
        rF,
        bF,
        sF,
        nodePadXFactor,
        nodePadYFactor,
        gap,
        nodeAlign,
        custom.textDirection
      );

      if (!attempt.hasOverlap && !attempt.hasOverflow) {
        return {
          rects: attempt.rects,
          rootFont: rF,
          branchFont: bF,
          subFont: sF,
          hasOverlap: false,
          hasOverflow: false,
          fitsLegibly: sF >= minSubFont && bF >= minBranchFont,
        };
      }

      if (
        !bestResult ||
        (!attempt.hasOverlap && bestResult.hasOverlap) ||
        (!attempt.hasOverflow && bestResult.hasOverflow)
      ) {
        bestResult = {
          rects: attempt.rects,
          rootFont: rF,
          branchFont: bF,
          subFont: sF,
          hasOverlap: attempt.hasOverlap,
          hasOverflow: attempt.hasOverflow,
        };
      }
    }

    return {
      ...bestResult!,
      fitsLegibly: false,
    };
  };

  let cameraEnabled = false;
  let stage = baseStage;
  let solved = solveForStage(baseStage, false);

  if (cameraMode === 'follow') {
    cameraEnabled = true;
    // Keep baseStage when it already fits legibly so full-tree wide shot stays crisp;
    // expand stage only when dense trees need extra room for legible text & zero overlap.
    if (!solved.fitsLegibly) {
      const totalNodes =
        1 +
        schedule.tree.branches.length +
        schedule.tree.branches.reduce((acc, b) => acc + b.subs.length, 0);
      const boost = clamp(1.26 + totalNodes * 0.02, 1.3, 1.72);
      const sw = Math.round(boxW * boost);
      const sh = Math.round(boxH * boost);
      stage = {
        x: Math.round(boxX + (boxW - sw) * 0.5),
        y: Math.round(boxY + (boxH - sh) * 0.5),
        w: sw,
        h: sh,
      };
      solved = solveForStage(stage, true);
    }
  } else if (cameraMode === 'auto' && !solved.fitsLegibly) {
    cameraEnabled = true;
    // Recompute schedule with camera end-hold extension when auto camera activates
    schedule = computeBranchSchedule(
      custom.branchData ?? DEFAULT_BRANCH_DATA,
      custom.branchTiming ?? DEFAULT_BRANCH_TIMING,
      { cameraActive: true }
    );
    const totalNodes =
      1 +
      schedule.tree.branches.length +
      schedule.tree.branches.reduce((acc, b) => acc + b.subs.length, 0);
    const boost = clamp(1.38 + totalNodes * 0.025, 1.42, 1.88);
    const sw = Math.round(boxW * boost);
    const sh = Math.round(boxH * boost);
    stage = {
      x: Math.round(boxX + (boxW - sw) * 0.5),
      y: Math.round(boxY + (boxH - sh) * 0.5),
      w: sw,
      h: sh,
    };
    solved = solveForStage(stage, true);
  } else if (!solved.fitsLegibly) {
    // Camera is explicitly 'off': shrink further until zero overlap & zero overflow inside box
    solved = solveForStage(baseStage, true);
  }

  // Convert PlacedRects into full BranchNodeGeometry objects with final positioned layouts
  const allNodes: BranchNodeGeometry[] = [];
  const allKeywordTimes: number[] = [];
  let rootGeom!: BranchNodeGeometry;
  const branchGeoms: BranchNodeGeometry[] = [];
  const subGeoms: BranchNodeGeometry[][] = schedule.tree.branches.map(() => []);

  for (const r of solved.rects) {
    const x = Math.round(r.cx - r.w * 0.5);
    const y = Math.round(r.cy - r.h * 0.5);
    const align: 'right' | 'center' | 'left' =
      r.level === 'root' ? 'center' : nodeAlign;

    const layout = repositionLayoutInsideBox(
      ctx,
      r.text,
      fontFamily,
      fontWeight,
      r.fontSize,
      lineHeightRatio,
      x,
      y,
      r.w,
      r.h,
      r.padX,
      r.padY,
      align,
      r.direction
    );

    let connectorStart = 0;
    let connectorEnd = 0;
    let popTime = schedule.rootTime;
    let settledTime = schedule.introDuration;

    if (r.level === 'branch') {
      const sb = schedule.branches[r.branchIndex];
      connectorStart = sb.connectorStart;
      connectorEnd = sb.connectorEnd;
      popTime = sb.popTime;
      settledTime = sb.settledTime;
    } else if (r.level === 'sub') {
      const ss = schedule.branches[r.branchIndex].subs[r.subIndex];
      connectorStart = ss.connectorStart;
      connectorEnd = ss.connectorEnd;
      popTime = ss.popTime;
      settledTime = ss.settledTime;
    }

    const keywordTimes: number[] = [];
    for (let k = 0; k < layout.keywordGroups.length; k++) {
      const kt = Number((popTime + keywordOffsetSec + k * 0.18).toFixed(3));
      keywordTimes.push(kt);
      allKeywordTimes.push(kt);
    }

    const geom: BranchNodeGeometry = {
      id: r.id,
      level: r.level,
      branchIndex: r.branchIndex,
      subIndex: r.subIndex,
      text: r.text,
      direction: r.direction,
      cx: r.cx,
      cy: r.cy,
      x,
      y,
      w: r.w,
      h: r.h,
      padX: r.padX,
      padY: r.padY,
      anchorX: r.cx,
      anchorY: r.cy,
      fontSize: r.fontSize,
      layout,
      sectorAngle: r.sectorAngle,
      connectorStart,
      connectorEnd,
      popTime,
      settledTime,
      keywordTimes,
    };

    allNodes.push(geom);
    if (r.level === 'root') {
      rootGeom = geom;
    } else if (r.level === 'branch') {
      branchGeoms[r.branchIndex] = geom;
    } else {
      subGeoms[r.branchIndex][r.subIndex] = geom;
    }
  }

  // Build connectors
  const connectors: BranchConnectorGeometry[] = [];
  for (let bi = 0; bi < branchGeoms.length; bi++) {
    const bg = branchGeoms[bi];
    connectors.push(
      buildConnectorCubic(
        rootGeom,
        bg,
        effectiveLayout,
        'branch',
        bi,
        -1,
        bg.connectorStart,
        bg.connectorEnd
      )
    );
    for (let si = 0; si < subGeoms[bi].length; si++) {
      const sg = subGeoms[bi][si];
      connectors.push(
        buildConnectorCubic(
          bg,
          sg,
          effectiveLayout,
          'sub',
          bi,
          si,
          sg.connectorStart,
          sg.connectorEnd
        )
      );
    }
  }

  allKeywordTimes.sort((a, b) => a - b);

  return {
    schedule,
    effectiveLayout,
    effectivePosition: posBox.effectivePosition,
    boxX,
    boxY,
    boxW,
    boxH,
    frameW: W,
    frameH: H,
    stageX: stage.x,
    stageY: stage.y,
    stageW: stage.w,
    stageH: stage.h,
    cameraMode,
    cameraZoom,
    cameraEnabled,
    root: rootGeom,
    branches: branchGeoms,
    subs: subGeoms,
    allNodes,
    connectors,
    rootFontSize: solved.rootFont,
    branchFontSize: solved.branchFont,
    subFontSize: solved.subFont,
    fontFamily,
    fontWeight,
    allKeywordTimes,
    hasOverlap: solved.hasOverlap,
    hasOverflow: solved.hasOverflow,
  };
}

/**
 * Computes the effective camera viewport respecting BOTH the position region and the 6% safe margin.
 */
function getEffectiveBranchCameraBox(plan: BranchTreeLayoutPlan): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const safeMx = Math.round(plan.frameW * 0.06);
  const safeMy = Math.round(plan.frameH * 0.06);
  const safeRight = plan.frameW - safeMx;
  const safeBottom = plan.frameH - safeMy;
  const x1 = Math.max(plan.boxX, safeMx);
  const y1 = Math.max(plan.boxY, safeMy);
  const x2 = Math.min(plan.boxX + plan.boxW, safeRight);
  const y2 = Math.min(plan.boxY + plan.boxH, safeBottom);
  if (x2 - x1 >= 100 && y2 - y1 >= 100) {
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  return { x: plan.boxX, y: plan.boxY, w: plan.boxW, h: plan.boxH };
}

/**
 * Deterministic pan/zoom camera for Branching Points mode.
 * - Pure deterministic function of t.
 * - In "تتبع" (and triggered "تلقائي"): when each branch starts appearing, glides (easeInOutCubic, ~0.9s)
 *   to frame that branch node together with its sub-points (NOT pulling back mid-reveal), stays while its
 *   sub-points appear, then glides to the next branch.
 * - Pulls back to full tree ONLY after the last node settles: hold ~0.6s -> ease out ~1.0s -> full view >= 1.5s.
 * - Clamps camera so no node in the active cluster (or full tree) is cut off and the 6% safe margin holds.
 */
export function sampleBranchCamera(
  plan: BranchTreeLayoutPlan,
  t: number
): BranchCameraTransform {
  const effBox = getEffectiveBranchCameraBox(plan);
  const vpCx = effBox.x + effBox.w * 0.5;
  const vpCy = effBox.y + effBox.h * 0.5;

  if (!plan.cameraEnabled) {
    return {
      active: false,
      scale: 1,
      focusX: vpCx,
      focusY: vpCy,
      viewportCenterX: vpCx,
      viewportCenterY: vpCy,
    };
  }

  const maxZoom = clamp(plan.cameraZoom || DEFAULT_BRANCH_CAMERA_ZOOM, BRANCH_CAMERA_MIN_ZOOM, BRANCH_CAMERA_MAX_ZOOM);

  // Full-tree bounding rect
  let treeMinX = Infinity;
  let treeMinY = Infinity;
  let treeMaxX = -Infinity;
  let treeMaxY = -Infinity;
  for (const n of plan.allNodes) {
    treeMinX = Math.min(treeMinX, n.x);
    treeMinY = Math.min(treeMinY, n.y);
    treeMaxX = Math.max(treeMaxX, n.x + n.w);
    treeMaxY = Math.max(treeMaxY, n.y + n.h);
  }
  const treePad = 18;
  const fullLeft = treeMinX - treePad;
  const fullRight = treeMaxX + treePad;
  const fullTop = treeMinY - treePad;
  const fullBottom = treeMaxY + treePad;

  // Computes a clamped view framing `nodes` cleanly inside effBox (zero cutoff, respects 6% safe margin)
  const computeBoundsView = (
    nodes: BranchNodeGeometry[],
    padPx: number,
    desiredMaxScale: number,
    clampInsideTree: boolean
  ) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const reqW = Math.max(110, maxX - minX + padPx * 2);
    const reqH = Math.max(80, maxY - minY + padPx * 2);
    const fitScale = Math.min(effBox.w / reqW, effBox.h / reqH);
    const scale = clamp(Math.min(desiredMaxScale, fitScale), 0.38, desiredMaxScale);

    const halfVisW = (effBox.w * 0.5) / scale;
    const halfVisH = (effBox.h * 0.5) / scale;

    let focusX = (minX + maxX) * 0.5;
    let focusY = (minY + maxY) * 0.5;

    if (clampInsideTree) {
      if (fullRight - fullLeft > halfVisW * 2) {
        focusX = clamp(focusX, fullLeft + halfVisW, fullRight - halfVisW);
      } else {
        focusX = (fullLeft + fullRight) * 0.5;
      }
      if (fullBottom - fullTop > halfVisH * 2) {
        focusY = clamp(focusY, fullTop + halfVisH, fullBottom - halfVisH);
      } else {
        focusY = (fullTop + fullBottom) * 0.5;
      }

      // Hard guarantee: no node in the active cluster is ever cut off outside effBox
      const reqMinFx = maxX + padPx - halfVisW;
      const reqMaxFx = minX - padPx + halfVisW;
      if (reqMinFx <= reqMaxFx) {
        focusX = clamp(focusX, reqMinFx, reqMaxFx);
      } else {
        focusX = (minX + maxX) * 0.5;
      }
      const reqMinFy = maxY + padPx - halfVisH;
      const reqMaxFy = minY - padPx + halfVisH;
      if (reqMinFy <= reqMaxFy) {
        focusY = clamp(focusY, reqMinFy, reqMaxFy);
      } else {
        focusY = (minY + maxY) * 0.5;
      }
    }

    return { focusX, focusY, scale };
  };

  // Wide full-tree view (used ONLY during end hold after all nodes finish appearing)
  const fullView = computeBoundsView(plan.allNodes, 20, 1.0, false);

  // Intro view frames the root node smoothly before branch 0 begins (never wider than fullView)
  const rawRootView = computeBoundsView([plan.root], 48, maxZoom, true);
  const rootView =
    rawRootView.scale < fullView.scale
      ? computeBoundsView([plan.root], 18, maxZoom, true)
      : rawRootView;

  // Per-branch view frames THAT branch node together with its sub-points (active cluster).
  // Padding (18px) <= fullView padding (20px) guarantees cluster scale is always >= fullView.scale
  // while keeping every cluster node comfortably inside the 6% safe margin.
  const branchViews = plan.branches.map((b, bi) =>
    computeBoundsView([b, ...plan.subs[bi]], 18, maxZoom, true)
  );

  interface CamKeyframe {
    time: number;
    focusX: number;
    focusY: number;
    scale: number;
  }

  const keys: CamKeyframe[] = [{ time: 0, ...rootView }];

  const pushKey = (time: number, view: { focusX: number; focusY: number; scale: number }) => {
    const prev = keys[keys.length - 1];
    const safeT = Math.max(prev.time + 0.002, time);
    keys.push({ time: safeT, ...view });
  };

  const pullBackStart =
    plan.schedule.pullBackStart ?? Number((plan.schedule.lastNodeSettledTime + 0.6).toFixed(3));
  const pullBackEnd =
    plan.schedule.pullBackEnd ?? Number((pullBackStart + 1.0).toFixed(3));

  for (let bi = 0; bi < plan.schedule.branches.length; bi++) {
    const sb = plan.schedule.branches[bi];
    const bv = branchViews[bi];
    const nextStart =
      bi + 1 < plan.schedule.branches.length
        ? plan.schedule.branches[bi + 1].connectorStart
        : pullBackStart;

    const moveStart = sb.connectorStart;
    const prevView = bi === 0 ? rootView : branchViews[bi - 1];
    if (moveStart > keys[keys.length - 1].time + 0.01) {
      pushKey(moveStart, prevView);
    }

    // Glide ~0.9s (easeInOutCubic) to frame the active branch + its sub-points
    const availSpan = Math.max(0.22, nextStart - moveStart);
    const glideDur = Math.min(0.9, availSpan * 0.78);
    const arriveT = moveStart + glideDur;
    pushKey(arriveT, bv);

    // Stay focused on this branch cluster while all its sub-points appear (NO mid-tree pull-back)
    const holdUntil =
      bi + 1 < plan.schedule.branches.length ? nextStart : pullBackStart;
    if (holdUntil > arriveT + 0.01) {
      pushKey(holdUntil, bv);
    }
  }

  // Pull back to full view ONLY after the last node settles + ~0.6s hold -> ~1.0s ease-out
  const effectivePullStart = Math.max(keys[keys.length - 1].time, pullBackStart);
  if (effectivePullStart > keys[keys.length - 1].time + 0.005 && branchViews.length > 0) {
    pushKey(effectivePullStart, branchViews[branchViews.length - 1]);
  }
  const effectivePullEnd = Math.max(effectivePullStart + 0.25, pullBackEnd);
  pushKey(effectivePullEnd, fullView);
  pushKey(Math.max(effectivePullEnd + 0.5, plan.schedule.totalDuration + 1), fullView);

  // Evaluate piecewise easeInOutCubic interpolation
  if (t <= keys[0].time) {
    return {
      active: true,
      scale: keys[0].scale,
      focusX: keys[0].focusX,
      focusY: keys[0].focusY,
      viewportCenterX: vpCx,
      viewportCenterY: vpCy,
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
  };
}

/**
 * Applies a BranchCameraTransform to the canvas context.
 * Defaults to unclipped full-screen coordinates so nodes/connectors never vanish before the screen edge.
 */
export function beginBranchCameraTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  plan: BranchTreeLayoutPlan,
  cam: BranchCameraTransform,
  clipToPositionBox: boolean = false
): void {
  ctx.save();
  if (clipToPositionBox && cam.active) {
    const effBox = getEffectiveBranchCameraBox(plan);
    ctx.beginPath();
    ctx.rect(effBox.x, effBox.y, effBox.w, effBox.h);
    ctx.clip();
  }
  if (cam.active) {
    ctx.translate(cam.viewportCenterX, cam.viewportCenterY);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.focusX, -cam.focusY);
  }
}

/**
 * Executes a Branching camera content layer pass without premature inner-box clipping:
 * - In 'style' and 'black' modes: renders on a cached offscreen layer and applies a soft 4-edge
 *   alpha feather near the actual screen borders (~4.8%, safely outside the 6% safe margin).
 * - In 'green' mode: draws directly to full screen bounds with zero inner clip and zero soft alpha
 *   feathering so chroma-key edges stay 100% crisp.
 */
export function withBranchCameraLayer(
  mainCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  plan: BranchTreeLayoutPlan,
  cam: BranchCameraTransform,
  bgMode: BackgroundMode,
  drawFn: (drawCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void,
  pixelScale?: number
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
      frameW: plan.frameW,
      frameH: plan.frameH,
      pixelScale,
      clipToBox: false,
      featherScreenEdges: true,
      bgMode,
    },
    drawFn
  );
}

/**
 * Returns opacity multiplier for a branch when "تمييز الفرع الحالي" is toggled on.
 * Current branch = 1.0, previous branches = 0.45, and all branches return to 1.0 as camera pulls back to full view.
 */
export function getBranchHighlightAlpha(
  t: number,
  branchIndex: number,
  schedule: BranchScheduleResult,
  highlightCurrent: boolean
): number {
  if (!highlightCurrent || branchIndex < 0) return 1;

  const brightenStart = schedule.pullBackStart ?? schedule.fullTreeVisibleStart;
  const brightenDur = schedule.pullBackStart !== undefined ? 0.65 : 0.32;

  // At the end pull-back, everything returns smoothly to 100% brightness
  if (t >= brightenStart) {
    const brightenP = easeOutCubic(
      progress(t, brightenStart, brightenStart + brightenDur)
    );
    const isLast = branchIndex === schedule.branches.length - 1;
    return isLast ? 1 : lerp(0.45, 1, brightenP);
  }

  // Determine active branch index
  let activeIdx = -1;
  for (let i = 0; i < schedule.branches.length; i++) {
    if (t >= schedule.branches[i].connectorStart) {
      activeIdx = i;
    }
  }

  if (activeIdx === -1 || branchIndex >= activeIdx) {
    return 1;
  }

  // Smoothly dim previous branch right after the next branch starts
  const nextStart = schedule.branches[branchIndex + 1]?.connectorStart ?? schedule.fullTreeVisibleStart;
  const dimP = easeOutCubic(progress(t, nextStart, nextStart + 0.26));
  return lerp(1, 0.45, dimP);
}

/**
 * Samples a point on a cubic Bezier curve at parameter u in [0, 1].
 */
export function sampleCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  u: number
): Point2D {
  const t = clamp(u, 0, 1);
  const inv = 1 - t;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * t;
  const b2 = 3 * inv * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
}

/**
 * Samples a cubic Bezier into an array of evenly-spaced polyline points.
 */
export function sampleCubicPolyline(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  steps: number = 28
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push(sampleCubicBezier(p0, p1, p2, p3, i / steps));
  }
  return pts;
}

/**
 * Evaluates a smooth Catmull-Rom spline chain through control points.
 */
export function sampleCatmullRomPolyline(
  ctrlPts: Point2D[],
  samplesPerSegment: number = 14
): Point2D[] {
  if (ctrlPts.length <= 2) return ctrlPts.slice();
  const out: Point2D[] = [];
  for (let i = 0; i < ctrlPts.length - 1; i++) {
    const p0 = ctrlPts[Math.max(0, i - 1)];
    const p1 = ctrlPts[i];
    const p2 = ctrlPts[i + 1];
    const p3 = ctrlPts[Math.min(ctrlPts.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      const u = s / samplesPerSegment;
      const u2 = u * u;
      const u3 = u2 * u;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
      out.push({ x, y });
    }
  }
  out.push(ctrlPts[ctrlPts.length - 1]);
  return out;
}

/**
 * Computes cumulative arc lengths for a polyline.
 */
export function computePolylineLengths(pts: Point2D[]): {
  cumLen: number[];
  totalLen: number;
} {
  const cumLen = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    cumLen.push(total);
  }
  return { cumLen, totalLen: total };
}

/**
 * Samples a point along a polyline by normalized arc-length fraction u in [0, 1].
 */
export function samplePolylineAtFraction(pts: Point2D[], u: number): Point2D {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1 || u <= 0) return pts[0];
  if (u >= 1) return pts[pts.length - 1];

  const { cumLen, totalLen } = computePolylineLengths(pts);
  if (totalLen <= 0.001) return pts[0];
  const target = clamp(u, 0, 1) * totalLen;

  for (let i = 1; i < pts.length; i++) {
    if (cumLen[i] >= target) {
      const segLen = Math.max(0.0001, cumLen[i] - cumLen[i - 1]);
      const local = (target - cumLen[i - 1]) / segLen;
      return {
        x: lerp(pts[i - 1].x, pts[i].x, local),
        y: lerp(pts[i - 1].y, pts[i].y, local),
      };
    }
  }
  return pts[pts.length - 1];
}

/**
 * Traces a trimmed polyline path onto `ctx` from fraction 0 to `revealFrac` (by arc length).
 * Returns the tip point at `revealFrac`.
 */
export function traceTrimmedPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pts: Point2D[],
  revealFrac: number
): Point2D {
  const f = clamp(revealFrac, 0, 1);
  if (pts.length === 0 || f <= 0.001) {
    return pts[0] || { x: 0, y: 0 };
  }
  const { cumLen, totalLen } = computePolylineLengths(pts);
  const target = f * totalLen;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  let tip = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (cumLen[i] <= target) {
      ctx.lineTo(pts[i].x, pts[i].y);
      tip = pts[i];
    } else {
      const segLen = Math.max(0.0001, cumLen[i] - cumLen[i - 1]);
      const local = clamp((target - cumLen[i - 1]) / segLen, 0, 1);
      tip = {
        x: lerp(pts[i - 1].x, pts[i].x, local),
        y: lerp(pts[i - 1].y, pts[i].y, local),
      };
      ctx.lineTo(tip.x, tip.y);
      break;
    }
  }

  return tip;
}

/**
 * Traces a trimmed cubic Bezier curve from 0 to `revealFrac`.
 */
export function traceTrimmedCubicBezier(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  revealFrac: number,
  steps: number = 28
): Point2D {
  const pts = sampleCubicPolyline(p0, p1, p2, p3, steps);
  return traceTrimmedPolyline(ctx, pts, revealFrac);
}

export interface DrawBranchTextOptions {
  textColor: string;
  keywordColor: string;
  t: number;
  revealProgress?: number; // 0..1 RTL line-by-line clip reveal (default 1 = fully shown)
  underlineKeywords?: boolean;
  underlineWidth?: number;
  highlighterMode?: 'none' | 'multiply' | 'flat';
  highlighterColor?: string;
  hardOutlineColor?: string;
  hardOutlineWidth?: number;
  seed?: number;
}

/**
 * Renders a BranchNodeGeometry's Arabic/Bidi text using intact drawBidiWord (never splitting Arabic into chars).
 * Supports RTL clip reveal, keyword color + thin underline (no glyph width change),
 * optional rough-end yellow highlighter, and hard dark outlines for Chroma Key green mode.
 */
export function drawBranchNodeText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  node: BranchNodeGeometry,
  opts: DrawBranchTextOptions
): void {
  const {
    textColor,
    keywordColor,
    t,
    revealProgress = 1,
    underlineKeywords = true,
    underlineWidth = Math.max(2, Math.round(node.fontSize * 0.085)),
    highlighterMode = 'none',
    highlighterColor = '#FFE45C',
    hardOutlineColor,
    hardOutlineWidth = 0,
    seed = 42,
  } = opts;

  const layout = node.layout;
  const lineCount = layout.lines.length;
  if (lineCount === 0 || revealProgress <= 0.001) return;

  ctx.save();
  applyStudioCanvasTextProps(
    ctx,
    layout.fontFamily,
    layout.fontWeight,
    layout.fontSize,
    layout.direction
  );
  ctx.textBaseline = 'alphabetic';

  const isLtr = layout.direction === 'ltr';

  // Helper to get per-line reveal fraction (sequential across lines)
  const getLineReveal = (li: number): number => {
    if (revealProgress >= 0.999) return 1;
    const span = 1 / lineCount;
    return clamp((revealProgress - li * span) / span, 0, 1);
  };

  // Optional flat highlighter BEHIND ink (for green mode mindmap)
  if (highlighterMode === 'flat' && layout.keywordLineRects.length > 0) {
    drawRoughKeywordHighlights(
      ctx,
      node,
      highlighterColor,
      'source-over',
      t,
      getLineReveal,
      seed
    );
  }

  for (let li = 0; li < lineCount; li++) {
    const line = layout.lines[li];
    const lineRev = getLineReveal(li);
    if (lineRev <= 0.001) continue;

    ctx.save();
    if (lineRev < 0.999) {
      const pad = Math.max(8, layout.fontSize * 0.35);
      const clipTop = line.topY - pad;
      const clipH = line.bottomY - line.topY + pad * 2;
      const totalSpan = Math.max(4, line.rightX - line.leftX + pad * 2);
      const revW = totalSpan * lineRev;

      ctx.beginPath();
      if (isLtr) {
        ctx.rect(line.leftX - pad, clipTop, revW, clipH);
      } else {
        ctx.rect(line.rightX + pad - revW, clipTop, revW, clipH);
      }
      ctx.clip();
    }

    // Draw words intact via drawBidiWord
    for (const w of line.words) {
      const kwIdx = w.groupId ?? 0;
      const kwTime = node.keywordTimes[kwIdx] ?? node.popTime + 0.2;
      const kwActive = w.isKeyword && t >= kwTime;
      const fill = kwActive ? keywordColor : textColor;

      if (hardOutlineColor && hardOutlineWidth > 0) {
        ctx.save();
        ctx.textAlign = 'right';
        ctx.strokeStyle = hardOutlineColor;
        ctx.lineWidth = hardOutlineWidth;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(w.text, w.x, w.y);
        ctx.restore();
      }

      ctx.fillStyle = fill;
      drawBidiWord(ctx, w.text, w.x, w.y, layout.direction);
    }

    // Thin underline under active keywords (no glyph width change!)
    if (underlineKeywords && layout.keywordLineRects.length > 0) {
      for (const rect of layout.keywordLineRects) {
        if (rect.lineIndex !== li) continue;
        const kwTime = node.keywordTimes[rect.groupId] ?? node.popTime + 0.2;
        const up = easeOutCubic(progress(t, kwTime, kwTime + 0.26));
        if (up <= 0.01) continue;

        const yLine = rect.baselineY + Math.max(4, layout.fontSize * 0.19);
        ctx.save();
        ctx.strokeStyle = keywordColor;
        ctx.lineWidth = underlineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (isLtr) {
          ctx.moveTo(rect.leftX, yLine);
          ctx.lineTo(lerp(rect.leftX, rect.rightX, up), yLine);
        } else {
          ctx.moveTo(rect.rightX, yLine);
          ctx.lineTo(lerp(rect.rightX, rect.leftX, up), yLine);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // Optional multiply highlighter OVER ink (for style-background cream paper mindmap)
  if (highlighterMode === 'multiply' && layout.keywordLineRects.length > 0) {
    drawRoughKeywordHighlights(
      ctx,
      node,
      highlighterColor,
      'multiply',
      t,
      getLineReveal,
      seed
    );
  }

  ctx.restore();
}

function drawRoughKeywordHighlights(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  node: BranchNodeGeometry,
  color: string,
  composite: GlobalCompositeOperation,
  t: number,
  getLineReveal: (li: number) => number,
  seed: number
): void {
  const layout = node.layout;
  const isLtr = layout.direction === 'ltr';

  ctx.save();
  ctx.globalCompositeOperation = composite;

  for (let i = 0; i < layout.keywordLineRects.length; i++) {
    const rect = layout.keywordLineRects[i];
    const lineRev = getLineReveal(rect.lineIndex);
    if (lineRev <= 0.05) continue;

    const kwTime = node.keywordTimes[rect.groupId] ?? node.popTime + 0.16;
    const hp = easeOutCubic(progress(t, kwTime, kwTime + 0.28));
    if (hp <= 0.01) continue;

    const rng = mulberry32(combineSeed(seed, 9100 + i * 37 + node.branchIndex * 11));
    const padX = Math.max(4, layout.fontSize * 0.16);
    const bandTop = rect.baselineY - layout.fontSize * 0.72;
    const bandBot = rect.baselineY + layout.fontSize * 0.24;
    const xStart = isLtr ? rect.leftX - padX : rect.rightX + padX;
    const xEndFull = isLtr ? rect.rightX + padX : rect.leftX - padX;
    const xEnd = lerp(xStart, xEndFull, hp);

    const jag1 = (rng() - 0.5) * 4;
    const jag2 = (rng() - 0.5) * 4;
    const jag3 = (rng() - 0.5) * 4;

    ctx.fillStyle = composite === 'multiply' ? hexToRgba(color, 0.85) : color;
    ctx.beginPath();
    ctx.moveTo(xStart, bandTop + jag1);
    ctx.lineTo(xEnd, bandTop - jag2);
    ctx.lineTo(xEnd + (isLtr ? 3 : -3), (bandTop + bandBot) * 0.5 + jag3);
    ctx.lineTo(xEnd - (isLtr ? 2 : -2), bandBot + jag1);
    ctx.lineTo(xStart + (isLtr ? -2 : 2), bandBot - jag2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Standard SceneEventTimes builder shared by all Branching Points styles.
 */
export function buildBranchSceneEventTimes(
  plan: BranchTreeLayoutPlan,
  nodeSfxStyle: 'pop' | 'chime'
): SceneEventTimes {
  return {
    enterStart: 0,
    rootTime: plan.schedule.rootTime,
    branchTimes: [...plan.schedule.branchTimes],
    subTimes: plan.schedule.subTimes.map((arr) => [...arr]),
    keywordTimes: [...plan.allKeywordTimes],
    nodeSfxStyle,
  };
}

/**
 * Convenience helper to compute event times directly from buildBranchTreeLayout params.
 */
export function getStandardBranchEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize,
  styleConfig: Omit<BuildBranchLayoutParams, 'ctx' | 'custom' | 'size'>,
  nodeSfxStyle: 'pop' | 'chime'
): SceneEventTimes {
  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...styleConfig,
  });
  return buildBranchSceneEventTimes(plan, nodeSfxStyle);
}
