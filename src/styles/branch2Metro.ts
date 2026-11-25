import {
  BackgroundMode,
  BranchLayoutMode,
  BranchMetroPalette,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import {
  buildBranchTreeLayout,
  BranchNodeGeometry,
  BranchTreeLayoutPlan,
  drawBranchNodeText,
  getBranchHighlightAlpha,
  getStandardBranchEventTimes,
  Point2D,
  sampleBranchCamera,
  withBranchCameraLayer,
} from './branchCore';
import { FLYER_ENGLISH_FONTS, NON_MONO_ARABIC_FONTS } from './flyer_core';

export const BR_METRO_CONFIG = {
  id: 'br_metro' as const,
  mode: 'branch' as const,
  nameAr: 'خطوط المترو',
  nameEn: 'Metro Transit Lines',
  descriptionAr:
    'خريطة مترو أنيقة بمسارات متدرجة وزوايا 45 درجة ومحطات مضيئة مع 3 لوحات ألوان متناغمة',
  defaultAccent: '#22D3EE',
  defaultKeywordColor: '#FBBF24',
  defaultQuoteFont: 'Cairo' as const,
  defaultAuthorFont: 'Cairo' as const,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as const,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as const,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: {
    textPrimary: '#FFFFFF',
    textSecondary: '#E2E8F0',
    accent: '#22D3EE',
    keyword: '#FDE047',
    surfaceBg: 'rgba(15, 23, 42, 0.25)',
    border: '#67E8F9',
  },
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedBranchLayouts: ['auto', 'radial', 'horizontal', 'vertical'] as BranchLayoutMode[],
};

export const METRO_NEON_PALETTE = [
  '#22D3EE',
  '#A78BFA',
  '#F472B6',
  '#FBBF24',
  '#FB923C',
  '#5EEAD4',
] as const;

export const METRO_PASTEL_PALETTE = [
  '#7DD3FC',
  '#C4B5FD',
  '#F9A8D4',
  '#FDE68A',
  '#FDBA74',
  '#99F6E4',
] as const;

// Non-green flat equivalents used in GREEN chroma-key mode so lines never key out
const METRO_GREEN_SAFE_PALETTE = [
  '#38BDF8',
  '#A78BFA',
  '#F472B6',
  '#FBBF24',
  '#FB923C',
  '#60A5FA',
] as const;

export function resolveBranchMetroPalette(
  custom?: Partial<StyleCustomization> | BranchMetroPalette | null
): BranchMetroPalette {
  const raw =
    typeof custom === 'string'
      ? custom
      : custom?.branchMetroPalette;
  if (raw === 'pastel' || raw === 'duotone' || raw === 'neon') {
    return raw;
  }
  return 'neon';
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '#22D3EE').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return [34, 211, 238];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const ch = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function mixHex(hexA: string, hexB: string, ratio: number): string {
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  return rgbToHex(lerp(r1, r2, ratio), lerp(g1, g2, ratio), lerp(b1, b2, ratio));
}

function isGreenishHex(hex: string): boolean {
  const [r, g, b] = parseHexRgb(hex);
  return g > 145 && g > r * 1.18 && g >= b * 0.95;
}

export function getMetroLineColors(
  paletteMode: BranchMetroPalette,
  accentColor: string,
  isGreen: boolean,
  isBlack: boolean
): string[] {
  let base: string[];
  if (paletteMode === 'pastel') {
    base = [...METRO_PASTEL_PALETTE];
  } else if (paletteMode === 'duotone') {
    const safeAccent = isGreen && isGreenishHex(accentColor) ? '#38BDF8' : accentColor || '#22D3EE';
    const lightTint = mixHex(safeAccent, '#FFFFFF', 0.42);
    const coolTint = mixHex(safeAccent, '#C4B5FD', 0.45);
    const warmTint = mixHex(safeAccent, '#FDE68A', 0.36);
    const softTint = mixHex(safeAccent, '#E0F2FE', 0.56);
    const deepTint = mixHex(safeAccent, '#60A5FA', 0.38);
    base = [safeAccent, lightTint, coolTint, softTint, deepTint, warmTint];
  } else {
    base = [...METRO_NEON_PALETTE];
  }

  if (isGreen) {
    return base.map((c, idx) =>
      isGreenishHex(c) ? METRO_GREEN_SAFE_PALETTE[idx % METRO_GREEN_SAFE_PALETTE.length] : c
    );
  }
  if (isBlack) {
    return base.map((c) => mixHex(c, '#FFFFFF', 0.16));
  }
  return base;
}

const BR_METRO_LAYOUT_OPTS = {
  styleId: 'br_metro' as const,
  allowedArabicFonts: NON_MONO_ARABIC_FONTS,
  defaultArabicFont: 'Cairo' as const,
  defaultEnglishFont: 'Plus Jakarta Sans' as const,
  fontWeight: 700,
  lineHeightRatio: 1.42,
  minRootFont: 26,
  maxRootFont: 44,
  minBranchFont: 20,
  maxBranchFont: 31,
  minSubFont: 15,
  maxSubFont: 23,
  supportedLayouts: ['radial', 'horizontal', 'vertical'] as ('radial' | 'horizontal' | 'vertical')[],
  nodePadXFactor: 0.78,
  nodePadYFactor: 0.42,
  minNodeGap: 18,
  keywordOffsetSec: 0.18,
};

// Cached deep metro backdrop (#070B14 -> #0E1426 + faint dotted map grid + very soft vignette)
let metroBackdropCacheKey = '';
let metroBackdropCache: HTMLCanvasElement | OffscreenCanvas | null = null;

function drawMetroBackdropContent(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number
): void {
  const grad = ctx.createLinearGradient(0, 0, W * 0.65, H);
  grad.addColorStop(0, '#070B14');
  grad.addColorStop(1, '#0E1426');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Faint dotted map grid
  const step = 34;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.11)';
  for (let y = step * 0.5; y < H; y += step) {
    for (let x = step * 0.5; x < W; x += step) {
      ctx.fillRect(x - 0.85, y - 0.85, 1.7, 1.7);
    }
  }

  // Subtle architectural transit guide ticks every 4 grid cells
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step * 4; x < W; x += step * 4) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step * 4; y < H; y += step * 4) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // Very soft radial vignette
  const vig = ctx.createRadialGradient(
    W * 0.5,
    H * 0.48,
    Math.min(W, H) * 0.24,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.72
  );
  vig.addColorStop(0, 'rgba(7, 11, 20, 0)');
  vig.addColorStop(1, 'rgba(3, 6, 14, 0.44)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawMetroBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number
): void {
  const key = `metro_v2_${W}x${H}`;
  if (metroBackdropCache && metroBackdropCacheKey === key) {
    ctx.drawImage(metroBackdropCache as CanvasImageSource, 0, 0, W, H);
    return;
  }
  try {
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(W, H);
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      canvas = c;
    }
    if (canvas) {
      const cctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      if (cctx) {
        drawMetroBackdropContent(cctx, W, H);
        metroBackdropCache = canvas;
        metroBackdropCacheKey = key;
        ctx.drawImage(canvas as CanvasImageSource, 0, 0, W, H);
        return;
      }
    }
  } catch {
    // Fallback to direct drawing in headless mock contexts
  }
  drawMetroBackdropContent(ctx, W, H);
}

/**
 * Generates an iconic metro 45-degree chamfered polyline route between two station centers.
 */
function buildMetroRoutePoints(from: Point2D, to: Point2D): Point2D[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 6 || ay < 6) {
    return [from, to];
  }
  const diag = Math.min(ax, ay);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (ax >= ay) {
    const straight = (ax - diag) * 0.5;
    const p1 = { x: from.x + sx * straight, y: from.y };
    const p2 = { x: p1.x + sx * diag, y: to.y };
    return [from, p1, p2, to];
  } else {
    const straight = (ay - diag) * 0.5;
    const p1 = { x: from.x, y: from.y + sy * straight };
    const p2 = { x: to.x, y: p1.y + sy * diag };
    return [from, p1, p2, to];
  }
}

function traceTrimmedRoundedPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pts: Point2D[],
  trimT: number
): void {
  const t = clamp(trimT, 0, 1);
  if (t <= 0.002 || pts.length < 2) return;

  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen <= 0.5) return;

  let remaining = totalLen * t;
  const trimmed: Point2D[] = [pts[0]];
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (remaining >= len) {
      trimmed.push(pts[i + 1]);
      remaining -= len;
    } else {
      const frac = len > 0 ? remaining / len : 0;
      trimmed.push({
        x: lerp(pts[i].x, pts[i + 1].x, frac),
        y: lerp(pts[i].y, pts[i + 1].y, frac),
      });
      break;
    }
  }

  ctx.beginPath();
  ctx.moveTo(trimmed[0].x, trimmed[0].y);
  for (let i = 1; i < trimmed.length - 1; i++) {
    const prev = trimmed[i - 1];
    const curr = trimmed[i];
    const next = trimmed[i + 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(18, d1 * 0.42, d2 * 0.42);
    if (r > 2 && typeof ctx.arcTo === 'function') {
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  const last = trimmed[trimmed.length - 1];
  ctx.lineTo(last.x, last.y);
}

function getStationDotPosition(node: BranchNodeGeometry, plan: BranchTreeLayoutPlan): Point2D {
  if (node.level === 'root') {
    return { x: node.cx, y: node.cy - node.h * 0.5 - 10 };
  }
  const isLtr = node.layout.direction === 'ltr';
  if (plan.effectiveLayout === 'horizontal') {
    return {
      x: isLtr ? node.cx - node.w * 0.5 - 8 : node.cx + node.w * 0.5 + 8,
      y: node.cy,
    };
  }
  return { x: node.cx, y: node.cy - node.h * 0.5 - 8 };
}

export function getBrMetroEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  return getStandardBranchEventTimes(
    ctx,
    content,
    timeline,
    custom,
    size,
    BR_METRO_LAYOUT_OPTS,
    'pop'
  );
}

export const renderBrMetro: PureStyleRenderer = (
  ctx,
  t,
  _content,
  _timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    drawMetroBackground(ctx, W, H);
  }

  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...BR_METRO_LAYOUT_OPTS,
  });

  const { schedule } = plan;
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);
  if (masterAlpha <= 0.005) return;

  const paletteMode = resolveBranchMetroPalette(custom);
  const lineColors = getMetroLineColors(
    paletteMode,
    custom.accentColor || BR_METRO_CONFIG.defaultAccent,
    isGreen,
    isBlack
  );

  const cam = sampleBranchCamera(plan, t);
  const highlightCurrent = custom.branchHighlightCurrent !== false;
  const rawKw = custom.keywordColor || BR_METRO_CONFIG.defaultKeywordColor;
  const keywordColor = isGreen && isGreenishHex(rawKw) ? '#FBBF24' : rawKw;

  const dotMap = new Map<string, Point2D>();
  for (let i = 0; i < plan.allNodes.length; i++) {
    const n = plan.allNodes[i];
    dotMap.set(n.id, getStationDotPosition(n, plan));
  }

  withBranchCameraLayer(ctx, plan, cam, bgMode, (ctx) => {

  // 1. Thick metro lines with smooth gradient along length + thin darker outline
  for (let i = 0; i < plan.connectors.length; i++) {
    const conn = plan.connectors[i];
    const drawP = easeInOutCubic(progress(t, conn.startTime, conn.endTime));
    if (drawP <= 0.005) continue;

    const fromPt = dotMap.get(conn.fromNodeId) || conn.p0;
    const toPt = dotMap.get(conn.toNodeId) || conn.p3;
    const route = buildMetroRoutePoints(fromPt, toPt);
    const lineColor = lineColors[conn.branchIndex % lineColors.length];
    const lighterTint = mixHex(lineColor, '#FFFFFF', 0.42);
    const darkerOutline = mixHex(lineColor, '#040812', 0.68);
    const focusAlpha = getBranchHighlightAlpha(t, conn.branchIndex, schedule, highlightCurrent);
    const innerWidth = conn.level === 'branch' ? 8.5 : 5.8;
    const outlineWidth = innerWidth + 3.2;

    ctx.save();
    ctx.globalAlpha = isGreen
      ? masterAlpha > 0.2
        ? 1
        : 0
      : clamp(focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Thin darker outline pass
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = isGreen ? '#070B14' : darkerOutline;
      ctx.lineWidth = outlineWidth;
      traceTrimmedRoundedPolyline(ctx, route, drawP);
      ctx.stroke();

      // Main thick line pass (smooth gradient along length in style/black, flat solid in green)
      if (isGreen) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lineColor;
      } else {
        const lineGrad = ctx.createLinearGradient(fromPt.x, fromPt.y, toPt.x, toPt.y);
        lineGrad.addColorStop(0, lineColor);
        lineGrad.addColorStop(1, lighterTint);
        ctx.strokeStyle = lineGrad;
        if (focusAlpha > 0.72) {
          ctx.shadowColor = hexToRgba(lineColor, isBlack ? 0.52 : 0.34);
          ctx.shadowBlur = isBlack ? 14 : 10;
        }
      }
      ctx.lineWidth = innerWidth;
      traceTrimmedRoundedPolyline(ctx, route, drawP);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Station discs + translucent dark label chips with thin colored left accent
  for (let i = 0; i < plan.allNodes.length; i++) {
    const node = plan.allNodes[i];
    const popP = progress(t, node.popTime, node.popTime + 0.32);
    if (popP <= 0.005) continue;

    const focusAlpha = getBranchHighlightAlpha(t, node.branchIndex, schedule, highlightCurrent);
    const isDimGreen = isGreen && highlightCurrent && focusAlpha < 0.7;
    const lineColor =
      node.level === 'root'
        ? lineColors[0]
        : lineColors[node.branchIndex % lineColors.length];
    const isTerminal =
      node.level === 'sub' ||
      (node.level === 'branch' && (plan.subs[node.branchIndex]?.length ?? 0) === 0);

    const dot = dotMap.get(node.id) || { x: node.cx, y: node.cy };
    const dotScale = easeOutBack(popP, 1.55);
    const dotR = node.level === 'root' ? 14 : node.level === 'branch' ? 9.5 : 7.5;

    ctx.save();
    ctx.globalAlpha = isGreen
      ? popP >= 0.2 && masterAlpha > 0.2
        ? 1
        : 0
      : clamp(easeOutCubic(popP) * focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      // 2a. Station Disc (white disc + colored ring + small inner dot; root & terminals get double ring)
      ctx.save();
      ctx.translate(dot.x, dot.y);
      ctx.scale(dotScale, dotScale);

      if (!isGreen && focusAlpha > 0.7) {
        ctx.shadowColor = hexToRgba(lineColor, isBlack ? 0.58 : 0.4);
        ctx.shadowBlur = node.level === 'root' ? 16 : 10;
      } else {
        ctx.shadowBlur = 0;
      }

      if (node.level === 'root') {
        // Larger double-ring interchange hub
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isGreen ? '#070B14' : lineColor;
        ctx.lineWidth = 4.2;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isDimGreen ? '#64748B' : lineColors[1 % lineColors.length];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, dotR - 4.2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isGreen ? '#070B14' : lineColor;
        ctx.beginPath();
        ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Standard white station disc + colored ring + small inner dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isDimGreen ? '#64748B' : lineColor;
        ctx.lineWidth = node.level === 'branch' ? 3.5 : 2.8;
        ctx.stroke();

        // Line terminals get an outer double ring / rounded terminal halo
        if (isTerminal) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isDimGreen
            ? '#64748B'
            : isGreen
              ? '#070B14'
              : hexToRgba(lineColor, 0.72);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, dotR + 3.6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Small inner dot
        ctx.shadowBlur = 0;
        ctx.fillStyle = isDimGreen ? '#475569' : lineColor;
        ctx.beginPath();
        ctx.arc(0, 0, node.level === 'branch' ? 2.8 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2b. Label chip (translucent dark chip + thin colored left accent + white text; bold badge for root)
      const labelP = easeOutCubic(progress(t, node.popTime + 0.05, node.popTime + 0.34));
      if (labelP > 0.01) {
        const nx = node.cx - node.w * 0.5;
        const ny = node.cy - node.h * 0.5;
        const r = node.level === 'root' ? 14 : 10;
        const accentStripeW = node.level === 'root' ? 5 : 3.5;

        ctx.save();
        ctx.translate(node.cx, node.cy + (1 - labelP) * 6);
        ctx.translate(-node.cx, -node.cy);

        if (isGreen) {
          ctx.shadowBlur = 0;
          // Hard offset shadow
          ctx.fillStyle = '#070B14';
          ctx.beginPath();
          ctx.roundRect(nx + 4, ny + 4, node.w, node.h, r);
          ctx.fill();

          // Flat dark opaque chip
          ctx.fillStyle = isDimGreen ? '#162033' : '#0B1220';
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.fill();

          ctx.strokeStyle = isDimGreen ? '#64748B' : lineColor;
          ctx.lineWidth = node.level === 'root' ? 2.4 : 1.8;
          ctx.stroke();

          // Left colored accent stripe
          ctx.fillStyle = isDimGreen ? '#64748B' : lineColor;
          ctx.beginPath();
          ctx.roundRect(nx + 2, ny + 5, accentStripeW, Math.max(8, node.h - 10), 2);
          ctx.fill();
        } else if (isBlack) {
          // Bright outlined chip on black background
          ctx.save();
          if (focusAlpha > 0.72) {
            ctx.shadowColor = hexToRgba(lineColor, 0.36);
            ctx.shadowBlur = node.level === 'root' ? 14 : 9;
          }
          ctx.strokeStyle = node.level === 'root' ? lineColor : hexToRgba(lineColor, 0.85);
          ctx.lineWidth = node.level === 'root' ? 2.2 : 1.5;
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.stroke();
          ctx.restore();

          // Thin bright left accent bar
          ctx.fillStyle = lineColor;
          ctx.beginPath();
          ctx.roundRect(nx + 2, ny + 5, accentStripeW, Math.max(8, node.h - 10), 2);
          ctx.fill();
        } else {
          // Small translucent dark chip with thin colored left accent
          ctx.save();
          if (node.level === 'root') {
            ctx.shadowColor = hexToRgba(lineColor, 0.28);
            ctx.shadowBlur = 16;
          }
          ctx.fillStyle =
            node.level === 'root'
              ? 'rgba(10, 17, 34, 0.88)'
              : 'rgba(11, 18, 34, 0.76)';
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle =
            node.level === 'root'
              ? hexToRgba(lineColor, 0.8)
              : 'rgba(226, 232, 240, 0.14)';
          ctx.lineWidth = node.level === 'root' ? 1.8 : 1.1;
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.stroke();

          // Thin colored left accent bar
          ctx.fillStyle = lineColor;
          ctx.beginPath();
          ctx.roundRect(nx + 2.5, ny + 5, accentStripeW, Math.max(8, node.h - 10), 2);
          ctx.fill();
        }

        drawBranchNodeText(ctx, node, {
          t,
          revealProgress: labelP,
          textColor: isDimGreen ? '#CBD5E1' : '#FFFFFF',
          keywordColor: isDimGreen ? '#FDE68A' : keywordColor,
          underlineKeywords: true,
        });

        ctx.restore();
      }
    }
    ctx.restore();
  }

  }, size.scale);
};
