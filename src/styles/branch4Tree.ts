import {
  BackgroundMode,
  BranchLayoutMode,
  BranchTreeTheme,
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

export const BR_TREE_CONFIG = {
  id: 'br_tree' as const,
  mode: 'branch' as const,
  nameAr: 'الشجرة النامية',
  nameEn: 'Growing Tree',
  descriptionAr:
    'شجرة عضوية متفرعة بأربعة ثيمات كاملة (ربيعي، خريفي، ليلي، ربيعي ليلي) تغيّر السماء واللحاء والأزهار والفوانيس والأرضية والجسيمات',
  defaultAccent: '#FF9EC4',
  defaultKeywordColor: '#EC4899',
  defaultQuoteFont: 'Amiri' as const,
  defaultAuthorFont: 'Cairo' as const,
  defaultEnglishQuoteFont: 'Lora' as const,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as const,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: {
    textPrimary: '#FFFFFF',
    textSecondary: '#F1F5F9',
    accent: '#FF9EC4',
    keyword: '#FDE047',
    surfaceBg: 'rgba(15, 23, 42, 0.25)',
    border: '#FF9EC4',
  },
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedBranchLayouts: ['auto', 'radial', 'horizontal', 'vertical'] as BranchLayoutMode[],
  hideBranchLayoutSelector: false,
};

export interface TreeThemeSpec {
  id: BranchTreeTheme;
  skyStops: [string, string, string];
  barkColor: string;
  barkHighlight: string;
  barkOutlineBlack: string;
  barkWidthScale: number;
  barkTextureLines: boolean;
  barkRimGlow: string | null;
  blossomColors: string[];
  blackBlossomColors: string[];
  clusterDensity: number;
  clusterShape: 'cherry' | 'maple' | 'biolum';
  chipFill: string;
  chipBorder: string;
  chipText: string;
  chipShape: 'blossom' | 'leaf' | 'glass';
  greenChipFill: string;
  greenChipBorder: string;
  greenChipText: string;
  keywordMode: 'pink-ring' | 'amber-highlight' | 'glow-underline' | 'pink-ring-underline';
  defaultKeywordColor: string;
  groundFill: string;
  groundSecondary: string;
}

export const TREE_THEMES: Record<BranchTreeTheme, TreeThemeSpec> = {
  spring: {
    id: 'spring',
    skyStops: ['#FDE8F0', '#FFD9C7', '#CFE8FF'],
    barkColor: '#9B6B4A',
    barkHighlight: '#C99672',
    barkOutlineBlack: '#F9C6D9',
    barkWidthScale: 0.94,
    barkTextureLines: false,
    barkRimGlow: null,
    // Zero green foliage: cherry blossoms in pink, blush & soft white
    blossomColors: ['#FF9EC4', '#FFD1E6', '#FFF7FA', '#F472B6'],
    blackBlossomColors: ['#FF9EC4', '#FFE4F0', '#F9A8D4', '#FFFFFF'],
    clusterDensity: 1.25,
    clusterShape: 'cherry',
    chipFill: 'rgba(255, 248, 252, 0.90)',
    chipBorder: '#F9A8D4',
    chipText: '#4A2B3A',
    chipShape: 'blossom',
    greenChipFill: '#FFF5FA',
    greenChipBorder: '#D9468F',
    greenChipText: '#4A2B3A',
    keywordMode: 'pink-ring',
    defaultKeywordColor: '#DB2777',
    groundFill: '#E6C2CE',
    groundSecondary: '#F3D6DF',
  },
  autumn: {
    id: 'autumn',
    skyStops: ['#3A1C12', '#B5532A', '#F2A65A'],
    barkColor: '#5A3A28',
    barkHighlight: '#7E543B',
    barkOutlineBlack: '#FDBA74',
    barkWidthScale: 1.24,
    barkTextureLines: true,
    barkRimGlow: null,
    // Zero green foliage: amber, orange & crimson autumn leaves
    blossomColors: ['#FFC857', '#F28C28', '#C8472B', '#E86A33'],
    blackBlossomColors: ['#FDE047', '#FB923C', '#F87171', '#FFC857'],
    clusterDensity: 0.85,
    clusterShape: 'maple',
    chipFill: 'rgba(56, 26, 16, 0.88)',
    chipBorder: '#F28C28',
    chipText: '#FFF4E0',
    chipShape: 'leaf',
    greenChipFill: '#452014',
    greenChipBorder: '#F59E0B',
    greenChipText: '#FFF4E0',
    keywordMode: 'amber-highlight',
    defaultKeywordColor: '#FFC857',
    groundFill: '#4A2416',
    groundSecondary: '#7C361C',
  },
  night: {
    id: 'night',
    skyStops: ['#050B1F', '#0B1D3D', '#12305C'],
    barkColor: '#1B2440',
    barkHighlight: '#6FD3FF',
    barkOutlineBlack: '#7DD3FC',
    barkWidthScale: 1.02,
    barkTextureLines: false,
    barkRimGlow: '#6FD3FF',
    // Zero green foliage: glowing bioluminescent cyan & violet blossoms
    blossomColors: ['#6FD3FF', '#B79CFF', '#A5F3FC', '#D8B4FE'],
    blackBlossomColors: ['#7DD3FC', '#C4B5FD', '#E0F2FE', '#E9D5FF'],
    clusterDensity: 1.05,
    clusterShape: 'biolum',
    chipFill: 'rgba(13, 24, 52, 0.72)',
    chipBorder: '#6FD3FF',
    chipText: '#F8FAFC',
    chipShape: 'glass',
    greenChipFill: '#121D38',
    greenChipBorder: '#6FD3FF',
    greenChipText: '#F8FAFC',
    keywordMode: 'glow-underline',
    defaultKeywordColor: '#6FD3FF',
    groundFill: '#0A1530',
    groundSecondary: '#16305E',
  },
  'night-spring': {
    id: 'night-spring',
    skyStops: ['#0B1030', '#1A1542', '#2A1B4D'],
    barkColor: '#36223C',
    barkHighlight: '#D8B4FE',
    barkOutlineBlack: '#F9C6D9',
    barkWidthScale: 0.94, // Same spring bark structure
    barkTextureLines: false,
    barkRimGlow: '#E9D5FF', // Gentle moonlight rim light
    // Zero green foliage: cherry blossoms in pink & moonlit white
    blossomColors: ['#FF9EC4', '#FFF7FA', '#FFD1E6', '#F9A8D4'],
    blackBlossomColors: ['#FF9EC4', '#FFFFFF', '#FFE4F0', '#F9A8D4'],
    clusterDensity: 1.25,
    clusterShape: 'cherry',
    chipFill: 'rgba(20, 14, 44, 0.80)',
    chipBorder: '#FF9EC4',
    chipText: '#FAF5FF',
    chipShape: 'blossom',
    greenChipFill: '#1E1538',
    greenChipBorder: '#FF9EC4',
    greenChipText: '#FAF5FF',
    keywordMode: 'pink-ring-underline',
    defaultKeywordColor: '#FF9EC4',
    groundFill: '#140E2A',
    groundSecondary: '#241845',
  },
};

export function resolveBranchTreeTheme(
  custom?: Partial<StyleCustomization> | BranchTreeTheme | null
): BranchTreeTheme {
  const raw =
    typeof custom === 'string'
      ? custom
      : custom?.branchTreeTheme || custom?.branchLeafPalette;
  if (raw === 'autumn' || raw === 'night' || raw === 'spring' || raw === 'night-spring') {
    return raw;
  }
  return 'spring';
}

const BR_TREE_LAYOUT_OPTS = {
  styleId: 'br_tree' as const,
  allowedArabicFonts: NON_MONO_ARABIC_FONTS,
  defaultArabicFont: 'Amiri' as const,
  defaultEnglishFont: 'Lora' as const,
  fontWeight: 700,
  lineHeightRatio: 1.46,
  minRootFont: 26,
  maxRootFont: 44,
  minBranchFont: 20,
  maxBranchFont: 32,
  minSubFont: 15,
  maxSubFont: 24,
  supportedLayouts: ['radial', 'horizontal', 'vertical'] as ('radial' | 'horizontal' | 'vertical')[],
  nodePadXFactor: 0.8,
  nodePadYFactor: 0.44,
  minNodeGap: 16,
  keywordOffsetSec: 0.2,
};

// Cached static themed sky + ground backdrop
let treeBgCacheKey = '';
let treeBgCache: HTMLCanvasElement | OffscreenCanvas | null = null;

function drawTreeStaticBackdrop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  theme: TreeThemeSpec,
  seed: number
): void {
  const themeSeedOffset =
    theme.id === 'spring'
      ? 101
      : theme.id === 'autumn'
        ? 202
        : theme.id === 'night'
          ? 303
          : 404;
  const rng = mulberry32(combineSeed(seed, themeSeedOffset));
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, theme.skyStops[0]);
  sky.addColorStop(0.55, theme.skyStops[1]);
  sky.addColorStop(1, theme.skyStops[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (theme.id === 'spring') {
    // Soft diagonal dawn light rays
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const rx = W * (0.14 + i * 0.24);
      const rayW = W * 0.14;
      const rg = ctx.createLinearGradient(rx, 0, rx + rayW * 0.7, H * 0.85);
      rg.addColorStop(0, 'rgba(255, 252, 245, 0.26)');
      rg.addColorStop(0.6, 'rgba(255, 232, 242, 0.08)');
      rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + rayW, 0);
      ctx.lineTo(rx + rayW * 1.45, H * 0.9);
      ctx.lineTo(rx + rayW * 0.25, H * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Soft grass-free dawn ground mound
    const moundGrad = ctx.createLinearGradient(0, H * 0.86, 0, H);
    moundGrad.addColorStop(0, theme.groundSecondary);
    moundGrad.addColorStop(1, theme.groundFill);
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.quadraticCurveTo(W * 0.5, H * 0.85, W, H);
    ctx.closePath();
    ctx.fill();
  } else if (theme.id === 'autumn') {
    // Warm setting sun glow behind clouds
    const sunGrad = ctx.createRadialGradient(W * 0.76, H * 0.28, 12, W * 0.76, H * 0.28, Math.min(W, H) * 0.42);
    sunGrad.addColorStop(0, 'rgba(255, 224, 150, 0.42)');
    sunGrad.addColorStop(0.45, 'rgba(242, 140, 40, 0.18)');
    sunGrad.addColorStop(1, 'rgba(181, 83, 42, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, W, H);

    // Low warm horizon mist
    const mist = ctx.createLinearGradient(0, H * 0.7, 0, H);
    mist.addColorStop(0, 'rgba(242, 166, 90, 0)');
    mist.addColorStop(0.6, 'rgba(242, 166, 90, 0.16)');
    mist.addColorStop(1, 'rgba(58, 28, 18, 0.35)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);

    // Earth mound + fallen autumn leaves pile at base
    ctx.fillStyle = theme.groundFill;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.quadraticCurveTo(W * 0.5, H * 0.87, W, H);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 42; i++) {
      const lx = W * (0.08 + rng() * 0.84);
      const baseCurveY = H - Math.sin(((lx / W) * Math.PI)) * (H * 0.065);
      const ly = baseCurveY + rng() * (H * 0.055);
      const lr = 4 + rng() * 6;
      const rot = (rng() - 0.5) * Math.PI;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.fillStyle = theme.blossomColors[i % theme.blossomColors.length];
      ctx.globalAlpha = 0.72 + rng() * 0.24;
      ctx.beginPath();
      ctx.ellipse(0, 0, lr * 1.4, lr * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (theme.id === 'night-spring') {
    // Night Spring: deep indigo-to-plum sky with faint stars, large soft moon, and light mist
    for (let i = 0; i < 82; i++) {
      const sx = rng() * W;
      const sy = rng() * H * 0.72;
      const sr = 0.65 + rng() * 1.45;
      ctx.fillStyle = i % 4 === 0 ? '#F9D8EC' : i % 3 === 0 ? '#E9D5FF' : '#FFFFFF';
      ctx.globalAlpha = 0.16 + rng() * 0.48;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Large soft luminous moon in upper-left sky
    const moonX = W * 0.2;
    const moonY = H * 0.2;
    const moonR = Math.min(W, H) * 0.074;
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.55, moonX, moonY, moonR * 4.2);
    moonHalo.addColorStop(0, 'rgba(255, 240, 248, 0.34)');
    moonHalo.addColorStop(0.42, 'rgba(233, 213, 255, 0.14)');
    moonHalo.addColorStop(1, 'rgba(42, 27, 77, 0)');
    ctx.fillStyle = moonHalo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4.2, 0, Math.PI * 2);
    ctx.fill();

    const moonDisk = ctx.createRadialGradient(
      moonX - moonR * 0.2,
      moonY - moonR * 0.2,
      moonR * 0.08,
      moonX,
      moonY,
      moonR
    );
    moonDisk.addColorStop(0, '#FFFDF9');
    moonDisk.addColorStop(0.68, '#F8ECF8');
    moonDisk.addColorStop(1, '#E9D5FF');
    ctx.fillStyle = moonDisk;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Soft lavender-plum horizon mist
    const mist = ctx.createLinearGradient(0, H * 0.68, 0, H);
    mist.addColorStop(0, 'rgba(216, 180, 254, 0)');
    mist.addColorStop(0.65, 'rgba(255, 158, 196, 0.08)');
    mist.addColorStop(1, 'rgba(216, 180, 254, 0.16)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.68, W, H * 0.32);

    // Shadowy plum ground mound (zero green)
    const moundGrad = ctx.createLinearGradient(0, H * 0.86, 0, H);
    moundGrad.addColorStop(0, theme.groundSecondary);
    moundGrad.addColorStop(1, theme.groundFill);
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.quadraticCurveTo(W * 0.5, H * 0.87, W, H);
    ctx.closePath();
    ctx.fill();
  } else {
    // Night: seeded stars + large soft moon + faint cyan mist
    for (let i = 0; i < 95; i++) {
      const sx = rng() * W;
      const sy = rng() * H * 0.76;
      const sr = 0.7 + rng() * 1.65;
      ctx.fillStyle = i % 5 === 0 ? '#BAE6FD' : '#FFFFFF';
      ctx.globalAlpha = 0.22 + rng() * 0.65;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Large soft moon in upper-left sky
    const moonX = W * 0.18;
    const moonY = H * 0.2;
    const moonR = Math.min(W, H) * 0.068;
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR * 0.6, moonX, moonY, moonR * 3.8);
    moonHalo.addColorStop(0, 'rgba(186, 230, 253, 0.34)');
    moonHalo.addColorStop(0.45, 'rgba(111, 211, 255, 0.12)');
    moonHalo.addColorStop(1, 'rgba(18, 48, 92, 0)');
    ctx.fillStyle = moonHalo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.8, 0, Math.PI * 2);
    ctx.fill();

    const moonDisk = ctx.createRadialGradient(
      moonX - moonR * 0.22,
      moonY - moonR * 0.22,
      moonR * 0.1,
      moonX,
      moonY,
      moonR
    );
    moonDisk.addColorStop(0, '#FFFFFF');
    moonDisk.addColorStop(0.7, '#E0F2FE');
    moonDisk.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = moonDisk;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Faint bioluminescent mist near base
    const mist = ctx.createLinearGradient(0, H * 0.76, 0, H);
    mist.addColorStop(0, 'rgba(111, 211, 255, 0)');
    mist.addColorStop(1, 'rgba(111, 211, 255, 0.14)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.76, W, H * 0.24);

    // Shadowy moonlit ground mound
    ctx.fillStyle = theme.groundFill;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.quadraticCurveTo(W * 0.5, H * 0.87, W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTreeBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  theme: TreeThemeSpec,
  seed: number
): void {
  const key = `tree_v2_${theme.id}_${W}x${H}_${seed}`;
  if (treeBgCache && treeBgCacheKey === key) {
    ctx.drawImage(treeBgCache as CanvasImageSource, 0, 0, W, H);
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
        drawTreeStaticBackdrop(cctx, W, H, theme, seed);
        treeBgCache = canvas;
        treeBgCacheKey = key;
        ctx.drawImage(canvas as CanvasImageSource, 0, 0, W, H);
        return;
      }
    }
  } catch {
    // Direct draw fallback
  }
  drawTreeStaticBackdrop(ctx, W, H, theme, seed);
}

/**
 * Draws theme-specific deterministic drifting particles (only in style mode).
 */
function drawTreeThemeParticles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  theme: TreeThemeSpec,
  seed: number,
  masterAlpha: number
): void {
  const rng = mulberry32(combineSeed(seed, 5401 + theme.id.length * 97));
  ctx.save();
  if (theme.id === 'spring') {
    // Falling cherry-blossom petals
    for (let i = 0; i < 24; i++) {
      const x0 = rng() * W;
      const y0 = rng() * H;
      const vy = 22 + rng() * 26;
      const vx = -10 - rng() * 14;
      const swayAmp = 14 + rng() * 18;
      const swayFreq = 0.65 + rng() * 0.6;
      const phase = rng() * Math.PI * 2;
      const px = ((x0 + vx * t + Math.sin(t * swayFreq + phase) * swayAmp) % (W + 40) + (W + 40)) % (W + 40) - 20;
      const py = ((y0 + vy * t) % (H + 40)) - 20;
      const sz = 3.5 + rng() * 3.8;
      const rot = t * (0.6 + rng() * 0.7) + phase;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = (0.45 + rng() * 0.35) * masterAlpha;
      ctx.fillStyle = theme.blossomColors[i % theme.blossomColors.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 1.25, sz * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (theme.id === 'autumn') {
    // Swirling falling autumn leaves
    for (let i = 0; i < 20; i++) {
      const x0 = rng() * W;
      const y0 = rng() * H;
      const vy = 26 + rng() * 28;
      const vx = -14 + rng() * 8;
      const swirlAmp = 24 + rng() * 24;
      const phase = rng() * Math.PI * 2;
      const px = ((x0 + vx * t + Math.sin(t * 0.9 + phase) * swirlAmp) % (W + 50) + (W + 50)) % (W + 50) - 25;
      const py = ((y0 + vy * t) % (H + 50)) - 25;
      const sz = 5 + rng() * 4.5;
      const rot = t * (0.9 + rng() * 0.8) + phase;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = (0.55 + rng() * 0.32) * masterAlpha;
      ctx.fillStyle = theme.blossomColors[i % theme.blossomColors.length];
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.quadraticCurveTo(sz * 0.9, -sz * 0.2, 0, sz);
      ctx.quadraticCurveTo(-sz * 0.9, -sz * 0.2, 0, -sz);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (theme.id === 'night-spring') {
    // Falling cherry-blossom petals glowing faintly in moonlight
    for (let i = 0; i < 26; i++) {
      const x0 = rng() * W;
      const y0 = rng() * H;
      const vy = 19 + rng() * 24;
      const vx = -9 - rng() * 13;
      const swayAmp = 14 + rng() * 20;
      const swayFreq = 0.6 + rng() * 0.55;
      const phase = rng() * Math.PI * 2;
      const px = ((x0 + vx * t + Math.sin(t * swayFreq + phase) * swayAmp) % (W + 40) + (W + 40)) % (W + 40) - 20;
      const py = ((y0 + vy * t) % (H + 40)) - 20;
      const sz = 3.6 + rng() * 3.8;
      const rot = t * (0.55 + rng() * 0.65) + phase;
      const col = theme.blossomColors[i % theme.blossomColors.length];
      const glowPulse = 0.65 + 0.35 * Math.sin(t * 1.4 + phase);

      // Faint moonlight glow aura around falling petal
      const haloR = sz * 3.1;
      const g = ctx.createRadialGradient(px, py, 0, px, py, haloR);
      g.addColorStop(0, hexToRgba(col, 0.42 * glowPulse * masterAlpha));
      g.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, haloR, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = (0.55 + rng() * 0.35) * masterAlpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 1.25, sz * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Floating bioluminescent fireflies
    for (let i = 0; i < 22; i++) {
      const x0 = rng() * W;
      const y0 = H * (0.14 + rng() * 0.76);
      const phase = rng() * Math.PI * 2;
      const px = x0 + Math.sin(t * (0.35 + rng() * 0.3) + phase) * (24 + rng() * 28);
      const py = y0 + Math.cos(t * (0.4 + rng() * 0.32) + phase * 1.2) * (16 + rng() * 20);
      const blink = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (1.2 + rng() * 1.1) + phase));
      const r = 2 + rng() * 2.4;
      const col = i % 3 === 0 ? '#B79CFF' : '#6FD3FF';

      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 4.2);
      g.addColorStop(0, `rgba(255, 255, 255, ${(blink * masterAlpha).toFixed(3)})`);
      g.addColorStop(0.4, hexToRgba(col, blink * 0.58 * masterAlpha));
      g.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Draws a tapered organic tree branch with theme-specific bark thickness, highlights/texture,
 * rim light (night), or bright outline (black mode).
 */
function drawThemedTreeBranch(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  trimT: number,
  startWidth: number,
  endWidth: number,
  theme: TreeThemeSpec,
  isGreen: boolean,
  isBlack: boolean
): void {
  const t = clamp(trimT, 0, 1);
  if (t <= 0.005) return;

  const steps = 20;
  const wScale = theme.barkWidthScale;
  const sw = startWidth * wScale;
  const ew = endWidth * wScale;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 0;

  for (let i = 0; i < steps; i++) {
    const u0 = (i / steps) * t;
    const u1 = ((i + 1) / steps) * t;
    const a = sampleCubicBezier(p0, p1, p2, p3, u0);
    const b = sampleCubicBezier(p0, p1, p2, p3, u1);
    const segW = lerp(sw, ew, (u0 + u1) * 0.5);

    if (isBlack) {
      // BLACK mode: bark rendered as crisp bright themed outlines
      ctx.strokeStyle = theme.barkOutlineBlack;
      ctx.lineWidth = Math.max(2.2, segW * 0.56);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      continue;
    }

    // Night cyan rim light pass on outer silhouette
    if (!isGreen && theme.barkRimGlow) {
      ctx.strokeStyle = hexToRgba(theme.barkRimGlow, 0.45);
      ctx.lineWidth = segW + 2.6;
      ctx.beginPath();
      ctx.moveTo(a.x - 1, a.y - 1);
      ctx.lineTo(b.x - 1, b.y - 1);
      ctx.stroke();
    }

    // Main bark stroke
    ctx.strokeStyle = theme.barkColor;
    ctx.lineWidth = segW;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Theme highlight / rough texture grain lines (omitted in flat green mode)
    if (!isGreen && segW >= 5.5) {
      ctx.strokeStyle =
        theme.id === 'night'
          ? hexToRgba(theme.barkHighlight, 0.35)
          : hexToRgba(theme.barkHighlight, theme.barkTextureLines ? 0.48 : 0.42);
      ctx.lineWidth = Math.max(1.2, segW * (theme.barkTextureLines ? 0.16 : 0.24));
      ctx.beginPath();
      ctx.moveTo(a.x - segW * 0.16, a.y - segW * 0.16);
      ctx.lineTo(b.x - segW * 0.16, b.y - segW * 0.16);
      ctx.stroke();

      if (theme.barkTextureLines && i % 2 === 0) {
        ctx.strokeStyle = 'rgba(34, 18, 10, 0.45)';
        ctx.lineWidth = Math.max(1, segW * 0.12);
        ctx.beginPath();
        ctx.moveTo(a.x + segW * 0.18, a.y + segW * 0.1);
        ctx.lineTo(b.x + segW * 0.14, b.y + segW * 0.16);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * Draws theme-specific blossom/leaf cluster at branch joints or node edges (ZERO green foliage).
 */
function drawThemedBlossomCluster(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  scaleP: number,
  theme: TreeThemeSpec,
  seed: number,
  isGreen: boolean,
  isBlack: boolean
): void {
  if (scaleP <= 0.02) return;
  const rng = mulberry32(seed);
  const colors = isBlack ? theme.blackBlossomColors : theme.blossomColors;
  const count = Math.max(3, Math.round(5 * theme.clusterDensity));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleP, scaleP);
  ctx.shadowBlur = 0;

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.45;
    const dist = 4 + rng() * 9;
    const px = Math.cos(ang) * dist;
    const py = Math.sin(ang) * dist;
    const col = colors[i % colors.length];

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);

    if (theme.clusterShape === 'cherry') {
      // 5-petal cherry blossom cluster (with gentle moonlight halo + rim light in night-spring)
      const r = 4.6 + rng() * 2.8;
      if (theme.id === 'night-spring' && !isGreen) {
        const moonHalo = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.4);
        moonHalo.addColorStop(0, hexToRgba('#FFF7FA', 0.42));
        moonHalo.addColorStop(0.48, hexToRgba('#FF9EC4', 0.24));
        moonHalo.addColorStop(1, 'rgba(255, 158, 196, 0)');
        ctx.fillStyle = moonHalo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(
          Math.cos(pa) * r * 0.55,
          Math.sin(pa) * r * 0.55,
          r * 0.55,
          r * 0.36,
          pa,
          0,
          Math.PI * 2
        );
        ctx.fill();
        if (theme.id === 'night-spring' && !isGreen) {
          ctx.strokeStyle = 'rgba(255, 247, 250, 0.58)';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme.clusterShape === 'maple') {
      // Pointed autumn maple/leaf cluster
      const r = 6.2 + rng() * 3.4;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(r * 0.45, -r * 0.35);
      ctx.lineTo(r * 0.95, -r * 0.15);
      ctx.lineTo(r * 0.4, r * 0.35);
      ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.4, r * 0.35);
      ctx.lineTo(-r * 0.95, -r * 0.15);
      ctx.lineTo(-r * 0.45, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      if (isGreen) {
        ctx.strokeStyle = '#2B140B';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    } else {
      // Glowing bioluminescent night blossom
      const r = 5.0 + rng() * 3.0;
      if (!isGreen) {
        const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.6);
        halo.addColorStop(0, hexToRgba('#FFFFFF', 0.85));
        halo.addColorStop(0.4, hexToRgba(col, 0.5));
        halo.addColorStop(1, hexToRgba(col, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col;
      for (let p = 0; p < 4; p++) {
        const pa = (p / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(
          Math.cos(pa) * r * 0.55,
          Math.sin(pa) * r * 0.55,
          r * 0.58,
          r * 0.3,
          pa,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws a warm glowing amber paper lantern hanging from a branch (night-spring theme).
 * GREEN mode: flat amber disc with crisp outline, ZERO shadowBlur/glow.
 */
function drawHangingPaperLantern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  attachX: number,
  attachY: number,
  scaleP: number,
  t: number,
  seed: number,
  isGreen: boolean,
  isBlack: boolean
): void {
  if (scaleP <= 0.02) return;
  const rng = mulberry32(seed);
  const cordLen = 14 + rng() * 10;
  const lanternRx = 7.5 + rng() * 2.2;
  const lanternRy = 9.5 + rng() * 2.6;
  const phase = rng() * Math.PI * 2;
  const sway = Math.sin(t * 1.15 + phase) * 0.075;
  const flicker = 0.88 + 0.12 * Math.sin(t * 2.6 + phase);

  ctx.save();
  ctx.translate(attachX, attachY);
  ctx.rotate(sway);
  ctx.scale(scaleP, scaleP);
  ctx.shadowBlur = 0;

  // Hanging cord
  ctx.strokeStyle = isBlack ? '#FDE68A' : isGreen ? '#1E1538' : '#7C5A82';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, cordLen);
  ctx.stroke();

  const cy = cordLen + lanternRy;

  if (isGreen) {
    // GREEN mode: flat crisp amber disc, zero glow, zero shadowBlur
    ctx.fillStyle = '#FFC857';
    ctx.beginPath();
    ctx.arc(0, cy, lanternRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1E1538';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Soft warm amber radial halo
  const haloR = lanternRy * 3.4;
  const halo = ctx.createRadialGradient(0, cy, 1, 0, cy, haloR);
  halo.addColorStop(0, hexToRgba('#FFF7D6', 0.65 * flicker));
  halo.addColorStop(0.32, hexToRgba('#FFC857', 0.36 * flicker));
  halo.addColorStop(0.7, hexToRgba('#F59E0B', 0.12 * flicker));
  halo.addColorStop(1, 'rgba(255, 200, 87, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Translucent amber paper lantern body
  const bodyGrad = ctx.createRadialGradient(0, cy - lanternRy * 0.15, 1, 0, cy, lanternRy * 1.15);
  bodyGrad.addColorStop(0, '#FFFBEB');
  bodyGrad.addColorStop(0.45, '#FFC857');
  bodyGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, cy, lanternRx, lanternRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Delicate lantern outline & horizontal rib
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-lanternRx * 0.85, cy);
  ctx.lineTo(lanternRx * 0.85, cy);
  ctx.stroke();

  // Top & bottom lantern caps + short tassel
  ctx.fillStyle = '#2A1838';
  ctx.fillRect(-lanternRx * 0.42, cordLen - 1, lanternRx * 0.84, 3);
  ctx.fillRect(-lanternRx * 0.38, cy + lanternRy - 2, lanternRx * 0.76, 3);
  ctx.strokeStyle = '#FFC857';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, cy + lanternRy + 1);
  ctx.lineTo(0, cy + lanternRy + 6);
  ctx.stroke();

  ctx.restore();
}

/**
 * Traces the theme-specific label chip path:
 * - spring: soft blossom-rounded pill
 * - autumn: pointed maple/leaf-shaped chip
 * - night: sleek rounded glass chip
 */
function traceThemedChipPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: TreeThemeSpec['chipShape'],
  isRoot: boolean
): void {
  if (shape === 'blossom') {
    const r = Math.min(h * 0.48, isRoot ? 26 : 20);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else if (shape === 'leaf') {
    // Pointed leaf-shaped plaque (gentle leaf tip on right & left edges)
    const tip = Math.min(18, h * 0.32);
    const cy = y + h * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + tip, y);
    ctx.lineTo(x + w - tip, y);
    ctx.quadraticCurveTo(x + w + tip * 0.25, cy, x + w - tip, y + h);
    ctx.lineTo(x + tip, y + h);
    ctx.quadraticCurveTo(x - tip * 0.25, cy, x + tip, y);
    ctx.closePath();
  } else {
    const r = isRoot ? 18 : 13;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
}

/**
 * Draws theme-specific keyword emphasis (spring: pink ring; autumn: amber highlight; night: glowing underline).
 */
function drawTreeKeywordTreatment(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  node: BranchNodeGeometry,
  t: number,
  theme: TreeThemeSpec,
  keywordColor: string,
  isGreen: boolean,
  phase: 'behind' | 'over'
): void {
  const { layout } = node;
  if (layout.keywordLineRects.length === 0) return;

  for (let i = 0; i < layout.keywordLineRects.length; i++) {
    const rect = layout.keywordLineRects[i];
    const kwT = node.keywordTimes[rect.groupId] ?? node.popTime + 0.18;
    const p = easeOutCubic(progress(t, kwT, kwT + 0.26));
    if (p <= 0.01) continue;

    const absLeft = rect.leftX;
    const absRight = rect.rightX;
    const absTop = rect.topY;
    const absBot = rect.bottomY;
    const kwW = Math.max(8, absRight - absLeft);
    const kwH = Math.max(12, absBot - absTop);

    if (theme.keywordMode === 'amber-highlight' && phase === 'behind') {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isGreen ? '#F59E0B' : hexToRgba(keywordColor, 0.34);
      const padX = 5;
      const fillW = (kwW + padX * 2) * p;
      const startX =
        layout.direction === 'ltr' ? absLeft - padX : absRight + padX - fillW;
      ctx.beginPath();
      ctx.roundRect(startX, absTop - 2, fillW, kwH + 4, 5);
      ctx.fill();
      ctx.restore();
    } else if (theme.keywordMode === 'pink-ring' && phase === 'over') {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isGreen ? '#DB2777' : keywordColor;
      ctx.lineWidth = isGreen ? 2.2 : 2.0;
      const cx = (absLeft + absRight) * 0.5;
      const cy = (absTop + absBot) * 0.5;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        kwW * 0.56 + 6,
        kwH * 0.62 + 3,
        0,
        -Math.PI * 0.5,
        -Math.PI * 0.5 + Math.PI * 2 * p
      );
      ctx.stroke();
      ctx.restore();
    } else if (theme.keywordMode === 'glow-underline' && phase === 'over') {
      ctx.save();
      const ulY = rect.baselineY + Math.max(4, node.fontSize * 0.22);
      const xStart = layout.direction === 'ltr' ? absLeft : absRight;
      const xEnd = layout.direction === 'ltr' ? absRight : absLeft;
      const xCur = lerp(xStart, xEnd, p);
      if (!isGreen) {
        ctx.shadowColor = hexToRgba(keywordColor, 0.78);
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = keywordColor;
      ctx.lineWidth = isGreen ? 2.2 : Math.max(2, node.fontSize * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xStart, ulY);
      ctx.lineTo(xCur, ulY);
      ctx.stroke();
      ctx.restore();
    } else if (theme.keywordMode === 'pink-ring-underline' && phase === 'over') {
      // Glowing pink ring first, then glowing pink underline
      const ringP = easeOutCubic(progress(t, kwT, kwT + 0.24));
      const ulP = easeOutCubic(progress(t, kwT + 0.14, kwT + 0.38));

      ctx.save();
      if (!isGreen) {
        ctx.shadowColor = hexToRgba(keywordColor, 0.75);
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = keywordColor;
      ctx.lineCap = 'round';

      if (ringP > 0.01) {
        ctx.lineWidth = isGreen ? 2.1 : 1.9;
        const cx = (absLeft + absRight) * 0.5;
        const cy = (absTop + absBot) * 0.5;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          kwW * 0.56 + 6,
          kwH * 0.62 + 3,
          0,
          -Math.PI * 0.5,
          -Math.PI * 0.5 + Math.PI * 2 * ringP
        );
        ctx.stroke();
      }

      if (ulP > 0.01) {
        const ulY = rect.baselineY + Math.max(5, node.fontSize * 0.24);
        const xStart = layout.direction === 'ltr' ? absLeft : absRight;
        const xEnd = layout.direction === 'ltr' ? absRight : absLeft;
        const xCur = lerp(xStart, xEnd, ulP);
        ctx.lineWidth = isGreen ? 2.2 : Math.max(2, node.fontSize * 0.08);
        ctx.beginPath();
        ctx.moveTo(xStart, ulY);
        ctx.lineTo(xCur, ulY);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export function getBrTreeEventTimes(
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
    BR_TREE_LAYOUT_OPTS,
    'pop'
  );
}

export const renderBrTree: PureStyleRenderer = (
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

  const themeId = resolveBranchTreeTheme(custom);
  const theme = TREE_THEMES[themeId];

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    drawTreeBackground(ctx, W, H, theme, custom.seed);
  }

  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...BR_TREE_LAYOUT_OPTS,
  });

  const { schedule } = plan;
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);
  if (masterAlpha <= 0.005) return;

  // Theme particles in style mode ONLY (zero particles in green/black)
  if (!isGreen && !isBlack) {
    drawTreeThemeParticles(ctx, W, H, t, theme, custom.seed, masterAlpha);
  }

  const cam = sampleBranchCamera(plan, t);
  const highlightCurrent = custom.branchHighlightCurrent !== false;
  const kwColor =
    custom.keywordColor &&
    custom.keywordColor !== BR_TREE_CONFIG.defaultKeywordColor
      ? custom.keywordColor
      : theme.defaultKeywordColor;

  withBranchCameraLayer(ctx, plan, cam, bgMode, (ctx) => {

  // 1. Growing organic tree branches with theme-specific bark thickness & style
  for (let i = 0; i < plan.connectors.length; i++) {
    const conn = plan.connectors[i];
    const growP = easeInOutCubic(progress(t, conn.startTime, conn.endTime));
    if (growP <= 0.005) continue;

    const focusAlpha = getBranchHighlightAlpha(t, conn.branchIndex, schedule, highlightCurrent);
    ctx.save();
    ctx.globalAlpha = isGreen
      ? masterAlpha > 0.2
        ? 1
        : 0
      : clamp(focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      drawThemedTreeBranch(
        ctx,
        conn.p0,
        conn.p1,
        conn.p2,
        conn.p3,
        growP,
        conn.level === 'branch' ? 12 : 6.2,
        conn.level === 'branch' ? 5.2 : 2.6,
        theme,
        isGreen,
        isBlack
      );

      // Mid-branch blossom / leaf cluster
      if (growP > 0.56) {
        const midPt = sampleCubicBezier(conn.p0, conn.p1, conn.p2, conn.p3, 0.58);
        const clusterP = easeOutBack(progress(growP, 0.56, 1), 1.4);
        drawThemedBlossomCluster(
          ctx,
          midPt.x,
          midPt.y - 6,
          clusterP * (conn.level === 'branch' ? 0.92 : 0.72),
          theme,
          combineSeed(custom.seed, 6100 + i * 29),
          isGreen,
          isBlack
        );

        // Glowing amber paper lanterns hanging from branches in night-spring theme
        if (theme.id === 'night-spring' && (conn.level === 'branch' || i % 2 === 0)) {
          const lanternAttach = sampleCubicBezier(conn.p0, conn.p1, conn.p2, conn.p3, 0.72);
          drawHangingPaperLantern(
            ctx,
            lanternAttach.x,
            lanternAttach.y + 2,
            clusterP * (conn.level === 'branch' ? 1.0 : 0.78),
            t,
            combineSeed(custom.seed, 8300 + i * 37),
            isGreen,
            isBlack
          );
        }
      }
    }
    ctx.restore();
  }

  // 2. Nodes (themed chip shapes + blossom clusters + theme keyword treatment)
  for (let i = 0; i < plan.allNodes.length; i++) {
    const node = plan.allNodes[i];
    const popP = progress(t, node.popTime, node.popTime + 0.36);
    if (popP <= 0.005) continue;

    const scalePop = lerp(0.86, 1.0, easeOutBack(popP, 1.38));
    const focusAlpha = getBranchHighlightAlpha(t, node.branchIndex, schedule, highlightCurrent);
    const isDimGreen = isGreen && highlightCurrent && focusAlpha < 0.7;

    const nx = node.cx - node.w * 0.5;
    const ny = node.cy - node.h * 0.5;

    ctx.save();
    ctx.globalAlpha = isGreen
      ? popP >= 0.2 && masterAlpha > 0.2
        ? 1
        : 0
      : clamp(easeOutCubic(popP) * focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      ctx.translate(node.cx, node.cy);
      ctx.scale(scalePop, scalePop);
      ctx.translate(-node.cx, -node.cy);

      // Blossom/leaf accent cluster tucked on top-right corner of chip
      const cornerClusterP = easeOutBack(
        progress(t, node.popTime + 0.1, node.popTime + 0.42),
        1.5
      );
      drawThemedBlossomCluster(
        ctx,
        nx + node.w - 6,
        ny + 3,
        cornerClusterP * (node.level === 'root' ? 1.12 : 0.85),
        theme,
        combineSeed(custom.seed, 7100 + i * 43),
        isGreen,
        isBlack
      );

      // Themed chip surface
      if (isGreen) {
        ctx.shadowBlur = 0;
        // Hard offset shadow
        ctx.fillStyle = '#070B14';
        traceThemedChipPath(ctx, nx + 4, ny + 4, node.w, node.h, theme.chipShape, node.level === 'root');
        ctx.fill();

        // Flat solid theme chip
        ctx.fillStyle = isDimGreen
          ? theme.id === 'spring'
            ? '#E5D5DE'
            : '#2A1D1B'
          : theme.greenChipFill;
        traceThemedChipPath(ctx, nx, ny, node.w, node.h, theme.chipShape, node.level === 'root');
        ctx.fill();

        ctx.strokeStyle = isDimGreen ? '#64748B' : theme.greenChipBorder;
        ctx.lineWidth = node.level === 'root' ? 2.5 : 2;
        ctx.stroke();
      } else if (isBlack) {
        // BLACK mode: bright theme lightPalette outline, no dark fill
        const borderCol =
          theme.blackBlossomColors[Math.max(0, node.branchIndex) % theme.blackBlossomColors.length];
        ctx.save();
        if (focusAlpha > 0.7) {
          ctx.shadowColor = hexToRgba(borderCol, 0.45);
          ctx.shadowBlur = node.level === 'root' ? 16 : 10;
        }
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = node.level === 'root' ? 2.4 : 1.7;
        traceThemedChipPath(ctx, nx, ny, node.w, node.h, theme.chipShape, node.level === 'root');
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        if (theme.id === 'night' || theme.id === 'night-spring') {
          ctx.shadowColor = hexToRgba(theme.chipBorder, node.level === 'root' ? 0.42 : 0.24);
          ctx.shadowBlur = node.level === 'root' ? 20 : 12;
        } else {
          ctx.shadowColor =
            theme.id === 'spring'
              ? 'rgba(131, 45, 86, 0.14)'
              : 'rgba(20, 8, 4, 0.36)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 5;
        }
        ctx.fillStyle = theme.chipFill;
        traceThemedChipPath(ctx, nx, ny, node.w, node.h, theme.chipShape, node.level === 'root');
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle =
          node.level === 'root'
            ? theme.chipBorder
            : hexToRgba(theme.chipBorder, theme.id === 'night' || theme.id === 'night-spring' ? 0.72 : 0.78);
        ctx.lineWidth = node.level === 'root' ? 2.2 : 1.5;
        traceThemedChipPath(ctx, nx, ny, node.w, node.h, theme.chipShape, node.level === 'root');
        ctx.stroke();
      }

      // Behind-text keyword highlight (autumn amber highlight)
      drawTreeKeywordTreatment(ctx, node, t, theme, kwColor, isGreen, 'behind');

      const nodeTextCol = isBlack
        ? '#FFFFFF'
        : isGreen
          ? isDimGreen
            ? theme.id === 'spring'
              ? '#644956'
              : '#CBD5E1'
            : theme.greenChipText
          : theme.chipText;

      const textKwCol =
        isBlack
          ? theme.blackBlossomColors[0]
          : theme.id === 'autumn'
            ? '#FFF4E0'
            : kwColor;

      drawBranchNodeText(ctx, node, {
        t,
        revealProgress: easeOutCubic(popP),
        textColor: nodeTextCol,
        keywordColor: textKwCol,
        underlineKeywords: false,
      });

      // Over-text keyword treatment (spring pink ring / night glowing underline)
      drawTreeKeywordTreatment(
        ctx,
        node,
        t,
        theme,
        isBlack ? theme.blackBlossomColors[0] : kwColor,
        isGreen,
        'over'
      );
    }
    ctx.restore();
  }

  }, size.scale);
};
