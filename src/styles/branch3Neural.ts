import {
  BackgroundMode,
  BranchLayoutMode,
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
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  buildBranchTreeLayout,
  BranchNodeGeometry,
  drawBranchNodeText,
  getBranchHighlightAlpha,
  getStandardBranchEventTimes,
  Point2D,
  sampleBranchCamera,
  sampleCubicBezier,
  withBranchCameraLayer,
} from './branchCore';
import { FLYER_ENGLISH_FONTS, NON_MONO_ARABIC_FONTS } from './flyer_core';

export const BR_NEURAL_CONFIG = {
  id: 'br_neural' as const,
  mode: 'branch' as const,
  nameAr: 'كوكبة',
  nameEn: 'Constellation',
  descriptionAr:
    'كوكبة سماوية متدرجة مع نجمة جذرية بمدارين وسديم ملون لكل فرع ونبضات ضوء ونجوم خلفية بثلاث طبقات بارالاكس',
  defaultAccent: '#6FD3FF',
  defaultKeywordColor: '#FFC857',
  defaultQuoteFont: 'Cairo' as const,
  defaultAuthorFont: 'Cairo' as const,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as const,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as const,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: {
    textPrimary: '#FFFFFF',
    textSecondary: '#E2E8F0',
    accent: '#6FD3FF',
    keyword: '#FFC857',
    surfaceBg: 'rgba(15, 23, 42, 0.25)',
    border: '#6FD3FF',
  },
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedBranchLayouts: ['auto', 'radial', 'horizontal', 'vertical'] as BranchLayoutMode[],
};

export const NEURAL_BRANCH_HUES = [
  '#6FD3FF',
  '#B79CFF',
  '#FF8FB8',
  '#FFC857',
  '#FF8A6B',
  '#BFE3FF',
] as const;

const BR_NEURAL_LAYOUT_OPTS = {
  styleId: 'br_neural' as const,
  allowedArabicFonts: NON_MONO_ARABIC_FONTS,
  defaultArabicFont: 'Cairo' as const,
  defaultEnglishFont: 'Plus Jakarta Sans' as const,
  fontWeight: 700,
  lineHeightRatio: 1.44,
  minRootFont: 27,
  maxRootFont: 45,
  minBranchFont: 20,
  maxBranchFont: 32,
  minSubFont: 15,
  maxSubFont: 23,
  supportedLayouts: ['radial', 'horizontal', 'vertical'] as ('radial' | 'horizontal' | 'vertical')[],
  nodePadXFactor: 0.78,
  nodePadYFactor: 0.42,
  minNodeGap: 18,
  keywordOffsetSec: 0.2,
};

// Cached 3-layer parallax starfield + deep cosmos backdrop
interface CachedStarfieldLayers {
  key: string;
  base: HTMLCanvasElement | OffscreenCanvas;
  farLayer: HTMLCanvasElement | OffscreenCanvas;
  midLayer: HTMLCanvasElement | OffscreenCanvas;
  nearLayer: HTMLCanvasElement | OffscreenCanvas;
}
let neuralStarfieldCache: CachedStarfieldLayers | null = null;

function createOffscreenSurface(W: number, H: number): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(W, H);
    }
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    }
  } catch {
    return null;
  }
  return null;
}

function getNeuralStarfieldLayers(
  W: number,
  H: number,
  seed: number
): CachedStarfieldLayers | null {
  const key = `neural_stars_v2_${W}x${H}_${seed}`;
  if (neuralStarfieldCache && neuralStarfieldCache.key === key) {
    return neuralStarfieldCache;
  }
  const base = createOffscreenSurface(W, H);
  const farLayer = createOffscreenSurface(W, H);
  const midLayer = createOffscreenSurface(W, H);
  const nearLayer = createOffscreenSurface(W, H);
  if (!base || !farLayer || !midLayer || !nearLayer) return null;

  const bctx = base.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const fctx = farLayer.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const mctx = midLayer.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const nctx = nearLayer.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!bctx || !fctx || !mctx || !nctx) return null;

  // Deep cosmos base gradient
  const bg = bctx.createRadialGradient(
    W * 0.5,
    H * 0.45,
    Math.min(W, H) * 0.08,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.78
  );
  bg.addColorStop(0, '#0C1634');
  bg.addColorStop(0.55, '#070E24');
  bg.addColorStop(1, '#030612');
  bctx.fillStyle = bg;
  bctx.fillRect(0, 0, W, H);

  const rng = mulberry32(combineSeed(seed, 4242));

  // Layer 1 (Far): tiny soft depth-blurred stars
  for (let i = 0; i < 85; i++) {
    const sx = rng() * W;
    const sy = rng() * H;
    const r = 1.6 + rng() * 1.9;
    const col = i % 4 === 0 ? '#BFE3FF' : i % 7 === 0 ? '#D8B4FE' : '#FFFFFF';
    const g = fctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2);
    g.addColorStop(0, hexToRgba(col, 0.34 + rng() * 0.25));
    g.addColorStop(0.5, hexToRgba(col, 0.12));
    g.addColorStop(1, hexToRgba(col, 0));
    fctx.fillStyle = g;
    fctx.beginPath();
    fctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
    fctx.fill();
  }

  // Layer 2 (Mid): crisp medium stars
  for (let i = 0; i < 58; i++) {
    const sx = rng() * W;
    const sy = rng() * H;
    const r = 0.8 + rng() * 1.25;
    mctx.fillStyle = i % 3 === 0 ? '#BAE6FD' : '#F8FAFC';
    mctx.globalAlpha = 0.35 + rng() * 0.48;
    mctx.beginPath();
    mctx.arc(sx, sy, r, 0, Math.PI * 2);
    mctx.fill();
  }

  // Layer 3 (Near): bright stars with delicate micro-halo
  for (let i = 0; i < 24; i++) {
    const sx = rng() * W;
    const sy = rng() * H;
    const r = 1.3 + rng() * 1.4;
    const col = NEURAL_BRANCH_HUES[i % NEURAL_BRANCH_HUES.length];
    const g = nctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.4);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    g.addColorStop(0.45, hexToRgba(col, 0.35));
    g.addColorStop(1, hexToRgba(col, 0));
    nctx.fillStyle = g;
    nctx.beginPath();
    nctx.arc(sx, sy, r * 3.4, 0, Math.PI * 2);
    nctx.fill();
  }

  neuralStarfieldCache = { key, base, farLayer, midLayer, nearLayer };
  return neuralStarfieldCache;
}

function drawTiledParallaxLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: HTMLCanvasElement | OffscreenCanvas,
  W: number,
  H: number,
  offsetX: number,
  offsetY: number
): void {
  const ox = ((offsetX % W) + W) % W;
  const oy = ((offsetY % H) + H) % H;
  ctx.drawImage(layer as CanvasImageSource, ox - W, oy - H, W, H);
  ctx.drawImage(layer as CanvasImageSource, ox, oy - H, W, H);
  ctx.drawImage(layer as CanvasImageSource, ox - W, oy, W, H);
  ctx.drawImage(layer as CanvasImageSource, ox, oy, W, H);
}

// Cached soft per-branch nebula cloud sprite (recolored per branch hue, cached by hue)
const nebulaSpriteCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function getCachedNebulaCloudSprite(hue: string): HTMLCanvasElement | OffscreenCanvas | null {
  if (nebulaSpriteCache.has(hue)) {
    return nebulaSpriteCache.get(hue)!;
  }
  const sz = 256;
  const surf = createOffscreenSurface(sz, sz);
  if (!surf) return null;
  const sctx = surf.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!sctx) return null;

  const blobs = [
    { x: sz * 0.5, y: sz * 0.5, r: sz * 0.46, a: 0.2 },
    { x: sz * 0.36, y: sz * 0.44, r: sz * 0.32, a: 0.14 },
    { x: sz * 0.64, y: sz * 0.58, r: sz * 0.3, a: 0.14 },
  ];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const g = sctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r);
    g.addColorStop(0, hexToRgba(hue, b.a));
    g.addColorStop(0.55, hexToRgba(hue, b.a * 0.36));
    g.addColorStop(1, hexToRgba(hue, 0));
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    sctx.fill();
  }

  if (nebulaSpriteCache.size > 16) {
    nebulaSpriteCache.clear();
  }
  nebulaSpriteCache.set(hue, surf);
  return surf;
}

function drawNeuralBackdrop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  seed: number
): void {
  const cached = getNeuralStarfieldLayers(W, H, seed);
  if (cached) {
    ctx.drawImage(cached.base as CanvasImageSource, 0, 0, W, H);
    // 3 parallax layers drifting slowly in deterministic motion
    drawTiledParallaxLayer(ctx, cached.farLayer, W, H, t * 3.5, t * 1.4);
    drawTiledParallaxLayer(ctx, cached.midLayer, W, H, t * 8.5, t * 3.2);
    drawTiledParallaxLayer(ctx, cached.nearLayer, W, H, t * 15.5, t * 5.8);
  } else {
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.48, 30, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    bg.addColorStop(0, '#0C1634');
    bg.addColorStop(1, '#030612');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Occasional seeded shooting star (every ~4.6 seconds, lasts ~0.65 s)
  const period = 4.6;
  const cycleIdx = Math.floor(t / period);
  const localT = t - cycleIdx * period;
  if (localT >= 1.1 && localT <= 1.75) {
    const u = (localT - 1.1) / 0.65;
    const rng = mulberry32(combineSeed(seed, 9001 + cycleIdx * 73));
    const x0 = W * (0.18 + rng() * 0.68);
    const y0 = H * (0.08 + rng() * 0.34);
    const dx = -(180 + rng() * 140);
    const dy = 70 + rng() * 80;
    const hx = x0 + dx * u;
    const hy = y0 + dy * u;
    const tx = x0 + dx * Math.max(0, u - 0.24);
    const ty = y0 + dy * Math.max(0, u - 0.24);
    const alpha = Math.sin(u * Math.PI) * 0.72;

    ctx.save();
    const g = ctx.createLinearGradient(hx, hy, tx, ty);
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(186, 230, 253, ${(alpha * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(111, 211, 255, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }
}

function getStarAnchorForNode(node: BranchNodeGeometry): Point2D {
  if (node.level === 'root') {
    return { x: node.cx, y: node.cy - node.h * 0.5 - 16 };
  }
  return { x: node.cx, y: node.cy - node.h * 0.5 - 11 };
}

function drawStarFlare(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  hue: string,
  level: 'root' | 'branch' | 'sub',
  t: number,
  isGreen: boolean
): void {
  ctx.save();
  ctx.translate(cx, cy);

  if (isGreen) {
    // GREEN mode: crisp flat star disc, zero glow/blur
    ctx.shadowBlur = 0;
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070B14';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.2, radius * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const pulse = 1 + 0.08 * Math.sin(t * 2.2 + radius);

  // Soft outer halo
  const haloR = radius * (level === 'root' ? 4.4 : level === 'branch' ? 3.4 : 2.8) * pulse;
  const halo = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, haloR);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  halo.addColorStop(0.28, hexToRgba(hue, 0.7));
  halo.addColorStop(0.62, hexToRgba(hue, 0.2));
  halo.addColorStop(1, hexToRgba(hue, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Root star gets 2 thin tilted orbit rings
  if (level === 'root') {
    ctx.save();
    ctx.strokeStyle = hexToRgba(hue, 0.42);
    ctx.lineWidth = 1.25;
    ctx.rotate(t * 0.16);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 2.35, radius * 1.12, 0.35, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba('#FFFFFF', 0.32);
    ctx.lineWidth = 1.0;
    ctx.rotate(-t * 0.28);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 3.1, radius * 1.48, -0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4-point star diffraction flare spikes (root & branches)
  if (level !== 'sub') {
    const spikeLen = radius * (level === 'root' ? 3.5 : 2.35) * pulse;
    ctx.strokeStyle = hexToRgba('#FFFFFF', level === 'root' ? 0.85 : 0.6);
    ctx.lineWidth = level === 'root' ? 1.8 : 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-spikeLen, 0);
    ctx.lineTo(spikeLen, 0);
    ctx.moveTo(0, -spikeLen * 0.88);
    ctx.lineTo(0, spikeLen * 0.88);
    ctx.stroke();
  }

  // Bright star core
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function getBrNeuralEventTimes(
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
    BR_NEURAL_LAYOUT_OPTS,
    'chime'
  );
}

export const renderBrNeural: PureStyleRenderer = (
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
    drawNeuralBackdrop(ctx, W, H, t, custom.seed);
  }

  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...BR_NEURAL_LAYOUT_OPTS,
  });

  const { schedule } = plan;
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);
  if (masterAlpha <= 0.005) return;

  const rootHue = custom.accentColor || BR_NEURAL_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || BR_NEURAL_CONFIG.defaultKeywordColor;
  const cam = sampleBranchCamera(plan, t);
  const highlightCurrent = custom.branchHighlightCurrent !== false;

  const starMap = new Map<string, Point2D>();
  for (let i = 0; i < plan.allNodes.length; i++) {
    const n = plan.allNodes[i];
    starMap.set(n.id, getStarAnchorForNode(n));
  }

  const getBranchHue = (bi: number): string =>
    NEURAL_BRANCH_HUES[Math.max(0, bi) % NEURAL_BRANCH_HUES.length];

  withBranchCameraLayer(ctx, plan, cam, bgMode, (ctx) => {

  // 1. Faint concentric orbit rings behind radial layout (omitted in GREEN mode)
  if (!isGreen && plan.effectiveLayout === 'radial') {
    const rootStar = starMap.get(plan.root.id) || { x: plan.root.cx, y: plan.root.cy };
    const ringAlpha = easeOutCubic(progress(t, schedule.rootTime, schedule.rootTime + 0.55)) * masterAlpha;
    if (ringAlpha > 0.01) {
      let avgBranchDist = 0;
      for (let bi = 0; bi < plan.branches.length; bi++) {
        const bs = starMap.get(plan.branches[bi].id) || plan.branches[bi];
        avgBranchDist += Math.hypot(bs.x - rootStar.x, bs.y - rootStar.y);
      }
      avgBranchDist = plan.branches.length > 0 ? avgBranchDist / plan.branches.length : 180;

      let avgSubDist = 0;
      let subCount = 0;
      for (let bi = 0; bi < plan.subs.length; bi++) {
        const subs = plan.subs[bi];
        for (let si = 0; si < subs.length; si++) {
          const ss = starMap.get(subs[si].id) || subs[si];
          avgSubDist += Math.hypot(ss.x - rootStar.x, ss.y - rootStar.y);
          subCount++;
        }
      }
      avgSubDist = subCount > 0 ? avgSubDist / subCount : avgBranchDist * 1.65;

      ctx.save();
      ctx.globalAlpha = ringAlpha * (isBlack ? 0.22 : 0.16);
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(rootStar.x, rootStar.y, Math.max(40, avgBranchDist), 0, Math.PI * 2);
      ctx.stroke();
      if (subCount > 0) {
        ctx.beginPath();
        ctx.arc(rootStar.x, rootStar.y, Math.max(avgBranchDist + 40, avgSubDist), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 2. Soft cached nebula cloud behind each branch cluster (style/black ONLY, zero in GREEN)
  if (!isGreen) {
    for (let bi = 0; bi < plan.branches.length; bi++) {
      const br = plan.branches[bi];
      const appearP = easeOutCubic(progress(t, br.popTime - 0.18, br.popTime + 0.45));
      if (appearP <= 0.01) continue;

      const hue = getBranchHue(bi);
      const focusAlpha = getBranchHighlightAlpha(t, bi, schedule, highlightCurrent);
      const subs = plan.subs[bi] || [];
      const members = [br, ...subs];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let m = 0; m < members.length; m++) {
        const n = members[m];
        minX = Math.min(minX, n.cx - n.w * 0.55);
        maxX = Math.max(maxX, n.cx + n.w * 0.55);
        minY = Math.min(minY, n.cy - n.h * 0.65);
        maxY = Math.max(maxY, n.cy + n.h * 0.55);
      }

      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const nw = Math.max(180, (maxX - minX) * 1.48);
      const nh = Math.max(150, (maxY - minY) * 1.56);

      ctx.save();
      ctx.globalAlpha = clamp(appearP * focusAlpha * masterAlpha * (isBlack ? 0.55 : 0.78), 0, 1);
      const sprite = getCachedNebulaCloudSprite(hue);
      if (sprite && typeof ctx.drawImage === 'function') {
        ctx.drawImage(sprite as CanvasImageSource, cx - nw * 0.5, cy - nh * 0.5, nw, nh);
      } else {
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(nw, nh) * 0.5);
        g.addColorStop(0, hexToRgba(hue, 0.18));
        g.addColorStop(1, hexToRgba(hue, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(nw, nh) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 3. Smooth curved cubic arcs with parent->child gradient + tiny star dots + traveling light pulse
  for (let i = 0; i < plan.connectors.length; i++) {
    const conn = plan.connectors[i];
    const drawP = easeInOutSine(progress(t, conn.startTime, conn.endTime));
    if (drawP <= 0.005) continue;

    const fromPt = starMap.get(conn.fromNodeId) || conn.p0;
    const toPt = starMap.get(conn.toNodeId) || conn.p3;
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const perpX = -dy * 0.13;
    const perpY = dx * 0.13;
    const cp1 = { x: fromPt.x + dx * 0.34 + perpX, y: fromPt.y + dy * 0.34 + perpY };
    const cp2 = { x: fromPt.x + dx * 0.68 - perpX * 0.4, y: fromPt.y + dy * 0.68 - perpY * 0.4 };

    const branchHue = getBranchHue(conn.branchIndex);
    const parentHue = conn.level === 'branch' ? rootHue : branchHue;
    const childHue = branchHue;
    const focusAlpha = getBranchHighlightAlpha(t, conn.branchIndex, schedule, highlightCurrent);

    ctx.save();
    ctx.globalAlpha = isGreen
      ? masterAlpha > 0.2
        ? 1
        : 0
      : clamp(focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      const steps = 24;
      ctx.beginPath();
      ctx.moveTo(fromPt.x, fromPt.y);
      for (let s = 1; s <= steps; s++) {
        const pt = sampleCubicBezier(fromPt, cp1, cp2, toPt, (s / steps) * drawP);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = conn.level === 'branch' ? 2.4 : 1.75;

      if (isGreen) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = childHue;
        ctx.stroke();
      } else {
        const grad = ctx.createLinearGradient(fromPt.x, fromPt.y, toPt.x, toPt.y);
        grad.addColorStop(0, hexToRgba(parentHue, 0.85));
        grad.addColorStop(1, hexToRgba(childHue, 0.92));
        ctx.strokeStyle = grad;
        ctx.shadowColor = hexToRgba(childHue, 0.45);
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Tiny star dots along the drawn constellation arc
        const dotSlots = conn.level === 'branch' ? 5 : 3;
        for (let d = 1; d <= dotSlots; d++) {
          const frac = d / (dotSlots + 1);
          if (frac > drawP) break;
          const pt = sampleCubicBezier(fromPt, cp1, cp2, toPt, frac);
          ctx.fillStyle = hexToRgba('#FFFFFF', 0.72);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, conn.level === 'branch' ? 1.7 : 1.35, 0, Math.PI * 2);
          ctx.fill();
        }

        // Light pulse traveling to the node just before it blooms
        const pulseWindowStart = conn.startTime;
        const pulseWindowEnd = conn.endTime + 0.14;
        if (t >= pulseWindowStart && t <= pulseWindowEnd) {
          const pu = easeInOutSine(progress(t, pulseWindowStart, pulseWindowEnd));
          const pt = sampleCubicBezier(fromPt, cp1, cp2, toPt, pu);
          const pulseAlpha = Math.sin(pu * Math.PI);
          const pg = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, 13);
          pg.addColorStop(0, `rgba(255, 255, 255, ${pulseAlpha.toFixed(3)})`);
          pg.addColorStop(0.45, hexToRgba(childHue, pulseAlpha * 0.72));
          pg.addColorStop(1, hexToRgba(childHue, 0));
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // 4. Hierarchical Stars + Translucent Glass Label Chips
  for (let i = 0; i < plan.allNodes.length; i++) {
    const node = plan.allNodes[i];
    const popP = progress(t, node.popTime, node.popTime + 0.34);
    if (popP <= 0.005) continue;

    const focusAlpha = getBranchHighlightAlpha(t, node.branchIndex, schedule, highlightCurrent);
    const isDimGreen = isGreen && highlightCurrent && focusAlpha < 0.7;
    const hue = node.level === 'root' ? rootHue : getBranchHue(node.branchIndex);
    const starPt = starMap.get(node.id) || { x: node.cx, y: node.cy };
    const starR = node.level === 'root' ? 11.5 : node.level === 'branch' ? 7.8 : 5.2;
    const starScale = easeOutBack(popP, 1.48);

    ctx.save();
    ctx.globalAlpha = isGreen
      ? popP >= 0.2 && masterAlpha > 0.2
        ? 1
        : 0
      : clamp(easeOutCubic(popP) * focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      // 4a. Star node
      drawStarFlare(
        ctx,
        starPt.x,
        starPt.y,
        starR * starScale,
        isDimGreen ? '#64748B' : hue,
        node.level,
        t,
        isGreen
      );

      // 4b. Small translucent glass label chip
      const labelP = easeOutCubic(progress(t, node.popTime + 0.06, node.popTime + 0.34));
      if (labelP > 0.01) {
        const nx = node.cx - node.w * 0.5;
        const ny = node.cy - node.h * 0.5;
        const r = node.level === 'root' ? 15 : 11;

        ctx.save();
        ctx.translate(node.cx, node.cy + (1 - labelP) * 5);
        ctx.translate(-node.cx, -node.cy);

        if (isGreen) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#070B14';
          ctx.beginPath();
          ctx.roundRect(nx + 4, ny + 4, node.w, node.h, r);
          ctx.fill();

          ctx.fillStyle = isDimGreen ? '#162033' : '#0B1222';
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.fill();

          ctx.strokeStyle = isDimGreen ? '#64748B' : hue;
          ctx.lineWidth = node.level === 'root' ? 2.4 : 1.8;
          ctx.stroke();
        } else if (isBlack) {
          ctx.save();
          if (focusAlpha > 0.72) {
            ctx.shadowColor = hexToRgba(hue, 0.42);
            ctx.shadowBlur = node.level === 'root' ? 14 : 9;
          }
          ctx.strokeStyle = hexToRgba(hue, node.level === 'root' ? 0.95 : 0.78);
          ctx.lineWidth = node.level === 'root' ? 2.1 : 1.4;
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.stroke();
          ctx.restore();
        } else {
          // Small translucent glass chip
          const chipGrad = ctx.createLinearGradient(nx, ny, nx + node.w, ny + node.h);
          chipGrad.addColorStop(0, 'rgba(13, 23, 48, 0.72)');
          chipGrad.addColorStop(1, hexToRgba(hue, node.level === 'root' ? 0.18 : 0.1));
          ctx.fillStyle = chipGrad;
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.fill();

          ctx.strokeStyle = hexToRgba(hue, node.level === 'root' ? 0.72 : 0.42);
          ctx.lineWidth = node.level === 'root' ? 1.8 : 1.15;
          ctx.beginPath();
          ctx.roundRect(nx, ny, node.w, node.h, r);
          ctx.stroke();
        }

        drawBranchNodeText(ctx, node, {
          t,
          revealProgress: labelP,
          textColor: isDimGreen ? '#CBD5E1' : '#F8FAFC',
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
