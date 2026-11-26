import {
  ArabicFontFamily,
  BackgroundMode,
  CalmStyleTheme,
  EnglishFontFamily,
  FlyerCreatureId,
  PointsFlyerLayout,
  PointsItem,
  PointsMarkerType,
  PointsTimingConfig,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  computePointsSchedule,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  detectTextDirection,
  easeInCubic,
  easeInOutCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  formatPointMarker,
  getEffectiveTimeline,
  getPhrasePositionBox,
  getPointsPositionBox,
  hexToRgba,
  lerp,
  mixHexColor as mixHex,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  ScheduledPointItem,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
  getPointHighlightAlpha,
} from './points1Clean';
import {
  computeUnionBox,
  isPointsCameraActive,
  PointsCameraItemBox,
  resolvePointsCameraMode,
  resolvePointsCameraZoom,
  samplePointsCamera,
  withPointsCameraLayer,
} from './pointsCamera';

export interface FlyerCreatureMetadata {
  id: FlyerCreatureId;
  labelAr: string;
  labelEn: string;
  defaultAccent: string;
  defaultKeyword: string;
}

export const FLYER_CREATURES: readonly FlyerCreatureMetadata[] = [
  {
    id: 'orb',
    labelAr: 'فراشة البرقوق (ليلي)',
    labelEn: 'Night Plum Butterfly',
    defaultAccent: '#F472B6',
    defaultKeyword: '#FDE68A',
  },
  {
    id: 'butterfly',
    labelAr: 'فراشة',
    labelEn: 'Butterfly',
    defaultAccent: '#FF8FB8',
    defaultKeyword: '#FDE047',
  },
  {
    id: 'bat',
    labelAr: 'خفاش',
    labelEn: 'Night Bat',
    defaultAccent: '#B79CFF',
    defaultKeyword: '#FDE047',
  },
  {
    id: 'firefly',
    labelAr: 'يراعة',
    labelEn: 'Firefly',
    defaultAccent: '#FFC857',
    defaultKeyword: '#FFF3B0',
  },
] as const;

export const FLYER_DEFAULT_TINTS: Record<FlyerCreatureId, string> = {
  orb: '#F472B6',
  butterfly: '#FF8FB8',
  bat: '#B79CFF',
  firefly: '#FFC857',
};

export function resolveFlyerCreature(creature?: string | null): FlyerCreatureId {
  if (
    creature === 'orb' ||
    creature === 'butterfly' ||
    creature === 'bat' ||
    creature === 'firefly'
  ) {
    return creature;
  }
  return 'orb';
}

export function getFlyerCreatureMeta(creature?: string | null): FlyerCreatureMetadata {
  const id = resolveFlyerCreature(creature);
  return FLYER_CREATURES.find((c) => c.id === id) || FLYER_CREATURES[0];
}

export function isFlyerStyleId(styleId?: string | null): boolean {
  return (
    styleId === 'phrase_flyer' ||
    styleId === 'pts_flyer' ||
    styleId === 'br_flyer'
  );
}

export function resolveFlyerTheme(custom: StyleCustomization): CalmStyleTheme {
  const t = custom.flyerTheme ?? custom.styleTheme;
  return t === 'light' ? 'light' : 'dark';
}

export const DEFAULT_FLYER_FLIGHT_SPEED = 0.42;
export const DEFAULT_CALM_FLYER_SPEED = 0.6;

export function resolveFlyerFlightSpeed(custom?: Partial<StyleCustomization>): number {
  const raw = custom?.flyerFlightSpeed;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(raw, 0.25, 1.25);
  }
  return DEFAULT_FLYER_FLIGHT_SPEED;
}

export function isCalmFlyerStyle(custom?: Partial<StyleCustomization> | null): boolean {
  if (!custom) return false;
  if (
    custom.mode === 'branch' &&
    (custom.branchStyleId === 'br_flyer' ||
      (!custom.branchStyleId && custom.styleId === 'br_flyer'))
  ) {
    return true;
  }
  if (custom.styleId === 'br_flyer') return true;
  if (
    (custom.styleId === 'pts_flyer' ||
      (custom.mode === 'points' && custom.pointsStyleId === 'pts_flyer')) &&
    resolvePointsFlyerLayout(custom) === 'horizontal-cards'
  ) {
    return true;
  }
  return false;
}

export function resolveCalmFlyerSpeed(custom?: Partial<StyleCustomization>): number {
  const raw = custom?.flyerFlightSpeed;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(raw, 0.4, 1.4);
  }
  return DEFAULT_CALM_FLYER_SPEED;
}

export const NON_MONO_ARABIC_FONTS: ArabicFontFamily[] = [
  'Cairo',
  'Tajawal',
  'Readex Pro',
  'IBM Plex Sans Arabic',
  'Almarai',
  'Almarai Bold',
  'Almarai ExtraBold',
  'Changa',
  'El Messiri',
  'Reem Kufi',
  'Amiri',
  'Aref Ruqaa',
  'Aref Ruqaa Ink',
  'Noto Naskh Arabic',
  'Noto Kufi Arabic',
  'Lalezar',
  'Rakkas',
  'Katibeh',
  'KOMission Black',
  'Zain Rounded instance mob',
  '29LT Azahar Display AL TN Trial Bold',
  'Lifta Swash Fixed Regular',
  'Palestine Regular',
];

export const FLYER_ENGLISH_FONTS: EnglishFontFamily[] = [
  'Plus Jakarta Sans',
  'Outfit',
  'Manrope',
  'Playfair Display',
  'Cormorant Garamond',
  'Lora',
  'Cinzel',
  'Oswald',
];

export const FLYER_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  accent: '#FFC857',
  keyword: '#FFF3B0',
  surfaceBg: 'rgba(15, 23, 42, 0.72)',
  border: '#FFC857',
};

export const PHRASE_FLYER_CONFIG = {
  id: 'phrase_flyer' as const,
  mode: 'phrase' as const,
  nameAr: 'الكائن الطائر المضيء',
  nameEn: 'Luminous Flyer',
  descriptionAr:
    'كائن طائر مضيء (بتلات البرقوق (ليلي) / فراشة / خفاش / يراعة) يحلّق بانسيابية ليكشف الكلمات ويتوقف متوهجاً عند الكلمات المفتاحية',
  defaultAccent: '#F472B6',
  defaultKeywordColor: '#FDE68A',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: FLYER_LIGHT_PALETTE,
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
};

export const PTS_FLYER_CONFIG = {
  id: 'pts_flyer' as const,
  mode: 'points' as const,
  nameAr: 'نقاط الكائن الطائر',
  nameEn: 'Flyer Points',
  descriptionAr:
    'كائن طائر مضيء (بتلات البرقوق (ليلي) / فراشة / خفاش / يراعة) يتنقل بين النقاط ليكشفها تباعاً مع أثر ضوئي متناسق',
  defaultAccent: '#F472B6',
  defaultKeywordColor: '#FDE68A',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: FLYER_LIGHT_PALETTE,
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedMarkerTypes: [
    'arabic-indic',
    'western',
    'bullets',
    'checks',
    'none',
  ] as PointsMarkerType[],
  defaultMarkerType: 'arabic-indic' as PointsMarkerType,
};

// ============================================================================
// DETERMINISTIC GLOW RHYTHM FOR FIREFLY & CREATURES
// ============================================================================

/**
 * Computes the deterministic glow intensity (0.25 .. 1.65) for the firefly lantern.
 * - Slow breathing pulse at ~0.8 Hz
 * - Quick deterministic double-blink every 3..4 seconds (seeded)
 * - Boosted while hovering on a keyword
 */
export function computeFireflyGlowIntensity(
  t: number,
  seed: number,
  hoverBoost: number
): number {
  const slowPulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.8));

  // Deterministic cycle period between 3.15s and 3.85s based on seed
  const rng = mulberry32(combineSeed(seed, 0x51f15e));
  const cyclePeriod = 3.2 + rng() * 0.65;
  const phaseOffset = rng() * cyclePeriod;
  const localT = ((t + phaseOffset) % cyclePeriod + cyclePeriod) % cyclePeriod;

  // Double-blink window near 1.1s..1.42s in each cycle: two crisp peaks
  let blinkFactor = 1.0;
  const b1 = Math.exp(-Math.pow((localT - 1.12) / 0.042, 2));
  const b2 = Math.exp(-Math.pow((localT - 1.28) / 0.045, 2));
  const dip1 = Math.exp(-Math.pow((localT - 1.04) / 0.032, 2));
  const dip2 = Math.exp(-Math.pow((localT - 1.2) / 0.032, 2));
  blinkFactor = clamp(1.0 + 0.55 * (b1 + b2) - 0.52 * (dip1 + dip2), 0.35, 1.55);

  return clamp(slowPulse * blinkFactor + hoverBoost * 0.48, 0.3, 1.75);
}

// ============================================================================
// CACHED STATIC BODY SPRITES (60 FPS PERFORMANCE)
// ============================================================================

const SPRITE_SIZE = 160;
const SPRITE_HALF = SPRITE_SIZE / 2;

/**
 * Traces an authentic organic plum-blossom petal (Prunus mume) centered at (0, 0),
 * pointing right with a tapered base on the left and a softly rounded, gently notched apex on the right.
 */
function tracePlumPetalPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  len: number,
  wid: number
): void {
  const halfL = len * 0.5;
  const halfW = wid * 0.5;
  ctx.beginPath();
  // Tapered petal base (left)
  ctx.moveTo(-halfL, 0);
  // Upper full rounded curve toward gently notched apex
  ctx.bezierCurveTo(
    -halfL * 0.42,
    -halfW * 1.12,
    halfL * 0.58,
    -halfW * 1.16,
    halfL * 0.96,
    -halfW * 0.24
  );
  // Subtle plum-blossom apex cleft
  ctx.quadraticCurveTo(halfL * 0.84, 0, halfL * 0.96, halfW * 0.24);
  // Lower symmetrical rounded curve back to base
  ctx.bezierCurveTo(
    halfL * 0.58,
    halfW * 1.16,
    -halfL * 0.42,
    halfW * 1.12,
    -halfL,
    0
  );
  ctx.closePath();
}

/**
 * Draws a delicate miniature plum-blossom petal for trailing wakes, orbiting companions, and night skies.
 * In GREEN mode: crisp flat solid petal with dark outline, zero glow/shadowBlur.
 */
function drawMiniPlumPetal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  color: string,
  tipColor: string,
  isGreen: boolean,
  alpha: number,
  glowRadius: number = 0
): void {
  if (alpha <= 0.01 || size <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowBlur = 0;

  if (isGreen) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1E1028';
    ctx.lineWidth = Math.max(0.85, size * 0.14);
    tracePlumPetalPath(ctx, size * 1.75, size * 1.18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (glowRadius > 0.5) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
    g.addColorStop(0, hexToRgba(tipColor, alpha * 0.58));
    g.addColorStop(0.5, hexToRgba(color, alpha * 0.28));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = clamp(alpha, 0, 1);
  const pLen = size * 1.85;
  const pWid = size * 1.24;
  const pGrad = ctx.createLinearGradient(-pLen * 0.5, 0, pLen * 0.5, 0);
  pGrad.addColorStop(0, color);
  pGrad.addColorStop(0.65, tipColor);
  pGrad.addColorStop(1, '#FFF1F7');
  ctx.fillStyle = pGrad;
  tracePlumPetalPath(ctx, pLen, pWid);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 241, 247, 0.55)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function getCachedCreatureBodySprite(
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  theme: CalmStyleTheme = 'dark'
): HTMLCanvasElement | OffscreenCanvas {
  const key = `flyer-body-sprite:v6:${creature}:${accentColor}:${bgMode}:${theme}`;
  return getOrGenerateCachedCanvas(key, SPRITE_SIZE, SPRITE_SIZE, (sCtx) => {
    sCtx.save();
    sCtx.translate(SPRITE_HALF, SPRITE_HALF);
    const isLightStyle = bgMode === 'style' && theme === 'light';

    if (creature === 'orb') {
      // Hero Luminous Night Plum Blossom Petal ("بتلة برقوق كبيرة مضيئة")
      const deepCrimson = mixHex(accentColor, '#881337', 0.48);
      const midRose = accentColor;
      const blushTip = mixHex(accentColor, '#FFF1F7', 0.62);

      if (bgMode === 'green') {
        // Hard-edged crisp large plum petal with dark outline & 3 crisp mini petals (zero blur)
        sCtx.fillStyle = midRose;
        sCtx.strokeStyle = '#1E1028';
        sCtx.lineWidth = 1.8;
        tracePlumPetalPath(sCtx, 34, 23);
        sCtx.fill();
        sCtx.stroke();

        // Crisp inner blush lobe
        sCtx.fillStyle = blushTip;
        sCtx.save();
        sCtx.translate(3, 0);
        tracePlumPetalPath(sCtx, 21, 13.5);
        sCtx.fill();
        sCtx.restore();

        // Crisp delicate central vein
        sCtx.strokeStyle = deepCrimson;
        sCtx.lineWidth = 1.25;
        sCtx.lineCap = 'round';
        sCtx.beginPath();
        sCtx.moveTo(-14, 0);
        sCtx.quadraticCurveTo(-1, -1.2, 10, 0);
        sCtx.stroke();

        // 3 crisp companion miniature petals
        drawMiniPlumPetal(sCtx, -22, -10, 4.4, -0.45, midRose, blushTip, true, 1);
        drawMiniPlumPetal(sCtx, -20, 12, 3.8, 0.55, blushTip, '#FFF1F7', true, 1);
        drawMiniPlumPetal(sCtx, 15, -17, 3.3, -0.25, midRose, blushTip, true, 1);
      } else {
        // Soft moonlit rose-crimson cushion behind the hero plum petal
        const cushionR = isLightStyle ? 30 : 28;
        const cushionGrad = sCtx.createRadialGradient(2, 0, 3, 0, 0, cushionR);
        cushionGrad.addColorStop(0, hexToRgba(midRose, isLightStyle ? 0.36 : 0.44));
        cushionGrad.addColorStop(0.55, hexToRgba(deepCrimson, isLightStyle ? 0.16 : 0.22));
        cushionGrad.addColorStop(1, hexToRgba(midRose, 0));
        sCtx.fillStyle = cushionGrad;
        sCtx.beginPath();
        sCtx.arc(0, 0, cushionR, 0, Math.PI * 2);
        sCtx.fill();

        // Translucent luminous plum-blossom petal body (deep crimson base -> radiant rose -> moonlit blush rim)
        const petalGrad = sCtx.createLinearGradient(-18, -3, 19, 3);
        petalGrad.addColorStop(0, deepCrimson);
        petalGrad.addColorStop(0.36, midRose);
        petalGrad.addColorStop(0.78, blushTip);
        petalGrad.addColorStop(1, '#FFF7FB');
        sCtx.fillStyle = petalGrad;
        tracePlumPetalPath(sCtx, 37, 25);
        sCtx.fill();

        // Soft inner pearl-moonlight sheen across upper curve of petal
        const sheenGrad = sCtx.createRadialGradient(4, -4, 1, 2, -2, 17);
        sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
        sheenGrad.addColorStop(0.55, 'rgba(255, 228, 240, 0.22)');
        sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        sCtx.fillStyle = sheenGrad;
        tracePlumPetalPath(sCtx, 35, 23);
        sCtx.fill();

        // Fine radiating translucent plum-petal veins
        sCtx.save();
        sCtx.strokeStyle = isLightStyle
          ? 'rgba(157, 23, 77, 0.24)'
          : 'rgba(255, 241, 247, 0.42)';
        sCtx.lineCap = 'round';
        sCtx.lineWidth = 0.85;
        sCtx.beginPath();
        sCtx.moveTo(-16.5, 0);
        sCtx.quadraticCurveTo(-2, -0.8, 12.5, 0);
        sCtx.stroke();

        sCtx.lineWidth = 0.65;
        for (const dir of [-1, 1]) {
          sCtx.beginPath();
          sCtx.moveTo(-13, dir * 0.4);
          sCtx.quadraticCurveTo(-1, dir * 5.2, 11.5, dir * 6.4);
          sCtx.stroke();

          sCtx.beginPath();
          sCtx.moveTo(-9, dir * 1.1);
          sCtx.quadraticCurveTo(1, dir * 8.2, 9.5, dir * 9.2);
          sCtx.stroke();
        }
        sCtx.restore();

        // Moonlit luminous rim edge
        sCtx.strokeStyle = isLightStyle
          ? hexToRgba(deepCrimson, 0.42)
          : 'rgba(255, 245, 250, 0.78)';
        sCtx.lineWidth = 1.15;
        tracePlumPetalPath(sCtx, 37, 25);
        sCtx.stroke();

        // Warm moonlit nectar/stamen glow point nestled near the petal base
        const coreGlow = sCtx.createRadialGradient(-12.5, 0, 0.5, -12.5, 0, 7.5);
        coreGlow.addColorStop(0, '#FFFBEB');
        coreGlow.addColorStop(0.45, 'rgba(253, 230, 138, 0.52)');
        coreGlow.addColorStop(1, 'rgba(253, 230, 138, 0)');
        sCtx.fillStyle = coreGlow;
        sCtx.beginPath();
        sCtx.arc(-12.5, 0, 7.5, 0, Math.PI * 2);
        sCtx.fill();
      }
    } else if (creature === 'butterfly') {
      // Polished Butterfly thorax, abdomen, head, antennae, and pearly body highlight
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyDark = isBlack ? '#F3E8FF' : '#23192D';
      const bodyMid = isBlack ? '#FFFFFF' : '#3E2C4F';

      // Delicate antennae
      sCtx.strokeStyle = isGreen ? '#1E1B24' : isBlack ? '#FFFFFF' : hexToRgba(accentColor, 0.9);
      sCtx.lineWidth = 1.5;
      sCtx.lineCap = 'round';
      sCtx.beginPath();
      sCtx.moveTo(8, -4);
      sCtx.quadraticCurveTo(18, -15, 23, -12);
      sCtx.moveTo(8, -1);
      sCtx.quadraticCurveTo(19, -8, 24, -4);
      sCtx.stroke();

      // Antenna tips
      sCtx.fillStyle = isGreen ? accentColor : '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(23, -12, 1.8, 0, Math.PI * 2);
      sCtx.arc(24, -4, 1.8, 0, Math.PI * 2);
      sCtx.fill();

      // Abdomen + thorax
      sCtx.save();
      sCtx.rotate(-0.18);
      if (isGreen) {
        sCtx.fillStyle = '#2A1E35';
      } else {
        const bodyGrad = sCtx.createLinearGradient(-16, -4, 12, 4);
        bodyGrad.addColorStop(0, bodyDark);
        bodyGrad.addColorStop(0.5, bodyMid);
        bodyGrad.addColorStop(1, bodyDark);
        sCtx.fillStyle = bodyGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-5, 2, 11, 3.2, 0, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.beginPath();
      sCtx.ellipse(4, 0, 5.5, 3.8, 0, 0, Math.PI * 2);
      sCtx.fill();

      // Head
      sCtx.beginPath();
      sCtx.arc(10.5, -1, 3.2, 0, Math.PI * 2);
      sCtx.fill();

      // Pearly body highlight & rim light
      sCtx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)';
      sCtx.lineWidth = 1.3;
      sCtx.beginPath();
      sCtx.moveTo(-13, 0.5);
      sCtx.quadraticCurveTo(-1, -2.2, 11, -2.2);
      sCtx.stroke();
      sCtx.restore();
    } else if (creature === 'bat') {
      // Polished Bat torso, ears, edge rim light, and softly glowing eyes
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyFill = isBlack ? '#E2D9F3' : '#1E162B';
      const bodyShade = isBlack ? '#C4B5FD' : '#120D1B';

      // Pointed ears
      sCtx.fillStyle = isGreen ? '#231934' : bodyFill;
      sCtx.beginPath();
      sCtx.moveTo(4, -5);
      sCtx.lineTo(8, -16);
      sCtx.lineTo(11, -6);
      sCtx.closePath();
      sCtx.moveTo(9, -4);
      sCtx.lineTo(14, -14);
      sCtx.lineTo(15, -3);
      sCtx.closePath();
      sCtx.fill();

      // Inner ear shade
      sCtx.fillStyle = isGreen ? accentColor : hexToRgba(accentColor, 0.55);
      sCtx.beginPath();
      sCtx.moveTo(6, -6);
      sCtx.lineTo(8, -13);
      sCtx.lineTo(10, -6);
      sCtx.closePath();
      sCtx.fill();

      // Torso & head
      if (isGreen) {
        sCtx.fillStyle = '#1E162B';
      } else {
        const torsoGrad = sCtx.createLinearGradient(-12, -8, 12, 8);
        torsoGrad.addColorStop(0, bodyFill);
        torsoGrad.addColorStop(1, bodyShade);
        sCtx.fillStyle = torsoGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-2, 2, 10.5, 5.8, -0.15, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.beginPath();
      sCtx.arc(8.5, -2.5, 5.4, 0, Math.PI * 2);
      sCtx.fill();

      // Subtle edge rim light on lit top side
      sCtx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.72)';
      sCtx.lineWidth = 1.25;
      sCtx.beginPath();
      sCtx.arc(8.5, -2.5, 5.2, -Math.PI * 0.85, -Math.PI * 0.1);
      sCtx.stroke();

      // Softly glowing eyes
      if (!isGreen) {
        const eyeGlow = sCtx.createRadialGradient(10.8, -3.2, 0.2, 10.8, -3.2, 4.5);
        eyeGlow.addColorStop(0, '#FFFFFF');
        eyeGlow.addColorStop(0.4, accentColor);
        eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = eyeGlow;
        sCtx.beginPath();
        sCtx.arc(10.8, -3.2, 4.5, 0, Math.PI * 2);
        sCtx.fill();
      }
      sCtx.fillStyle = '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(10.8, -3.2, 1.45, 0, Math.PI * 2);
      sCtx.fill();
    } else if (creature === 'firefly') {
      // FIREFLY ("يراعة") static body sprite: side-top view
      // - Slim dark-brown body (#2A1B12 in style mode; #E8D9B0 in black mode) with subtle highlight line
      // - Rounded head with two tiny antennae and a small dark eye
      // - Pale-orange pronotum plate (#F2A65A)
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyPrimary = isBlack ? '#E8D9B0' : '#2C1B12';
      const bodySecondary = isBlack ? '#CBB682' : '#1A0F0A';
      const pronotumColor = isBlack ? '#FFD28A' : '#F2A65A';

      sCtx.save();
      sCtx.rotate(-0.12);

      // Two tiny antennae from rounded head
      sCtx.strokeStyle = isBlack ? '#FFF3D1' : isGreen ? '#2C1B12' : '#5C3D28';
      sCtx.lineWidth = 1.4;
      sCtx.lineCap = 'round';
      sCtx.beginPath();
      sCtx.moveTo(15, -3);
      sCtx.quadraticCurveTo(22, -10, 26, -8);
      sCtx.moveTo(16, -1);
      sCtx.quadraticCurveTo(23, -4, 27, -1.5);
      sCtx.stroke();

      // Antenna tiny tips
      sCtx.fillStyle = isBlack ? '#FFFFFF' : '#F2A65A';
      sCtx.beginPath();
      sCtx.arc(26, -8, 1.3, 0, Math.PI * 2);
      sCtx.arc(27, -1.5, 1.3, 0, Math.PI * 2);
      sCtx.fill();

      // Slim segmented abdomen body (side-top view)
      if (isGreen) {
        sCtx.fillStyle = bodyPrimary;
      } else {
        const abGrad = sCtx.createLinearGradient(-18, -6, 6, 7);
        abGrad.addColorStop(0, bodyPrimary);
        abGrad.addColorStop(0.6, bodySecondary);
        abGrad.addColorStop(1, bodyPrimary);
        sCtx.fillStyle = abGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-5, 1.5, 13.5, 5.2, 0, 0, Math.PI * 2);
      sCtx.fill();

      if (isBlack) {
        sCtx.strokeStyle = '#FFF8E7';
        sCtx.lineWidth = 1.1;
        sCtx.stroke();
      }

      // Subtle abdominal segment lines
      sCtx.strokeStyle = isBlack
        ? 'rgba(92, 64, 35, 0.38)'
        : 'rgba(255, 235, 200, 0.16)';
      sCtx.lineWidth = 1;
      for (const segX of [-11, -6.5, -2]) {
        sCtx.beginPath();
        sCtx.moveTo(segX, -3.2);
        sCtx.quadraticCurveTo(segX - 1.2, 1.5, segX, 6.1);
        sCtx.stroke();
      }

      // Rounded head
      sCtx.fillStyle = isBlack ? '#DFC99B' : '#23140D';
      sCtx.beginPath();
      sCtx.arc(13.2, -0.8, 4.4, 0, Math.PI * 2);
      sCtx.fill();

      // Pale-orange pronotum plate shield over thorax
      if (isGreen) {
        sCtx.fillStyle = pronotumColor;
      } else {
        const proGrad = sCtx.createLinearGradient(3, -6, 12, 5);
        proGrad.addColorStop(0, '#FFE0B2');
        proGrad.addColorStop(0.45, pronotumColor);
        proGrad.addColorStop(1, '#C97A32');
        sCtx.fillStyle = proGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(7.5, -0.5, 5.6, 4.6, 0, 0, Math.PI * 2);
      sCtx.fill();

      // Subtle highlight line along the dorsal body & pronotum
      sCtx.strokeStyle = isGreen ? '#FFF8E7' : 'rgba(255, 248, 231, 0.78)';
      sCtx.lineWidth = 1.25;
      sCtx.beginPath();
      sCtx.moveTo(-12, -1.8);
      sCtx.quadraticCurveTo(0, -4.1, 12, -2.8);
      sCtx.stroke();

      // Small dark eye on the rounded head with tiny specular glint
      sCtx.fillStyle = '#120A06';
      sCtx.beginPath();
      sCtx.arc(15.2, -1.6, 1.65, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.fillStyle = '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(15.6, -2.1, 0.65, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.restore();
    }

    sCtx.restore();
  });
}

// ============================================================================
// STYLE BACKGROUNDS (WITH DEEP FOREST NIGHT FOR FIREFLY)
// ============================================================================

function traceCrescentMoonPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  r: number,
  innerFactor: number = 0.31
): void {
  const c = 0.55228475;
  const kx = r * innerFactor;
  ctx.beginPath();
  // Outer sunlit semicircle on the left side (-x)
  ctx.arc(0, 0, r, -Math.PI * 0.5, Math.PI * 0.5, true);
  // Smooth elliptical inner terminator returning from (0, +r) through (-kx, 0) to (0, -r)
  ctx.bezierCurveTo(-kx * c, r, -kx, r * c, -kx, 0);
  ctx.bezierCurveTo(-kx, -r * c, -kx * c, -r, 0, -r);
  ctx.closePath();
}

function drawMoonSoftGlow(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  moonX: number,
  moonY: number,
  moonR: number,
  accentColor: string,
  theme: CalmStyleTheme,
  t: number,
  bgPace: number = 0.72
): void {
  const isLight = theme === 'light';
  const primaryWave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.19 * bgPace);
  const secondaryWave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.11 * bgPace + 1.15);
  const glowLevel = primaryWave * 0.7 + secondaryWave * 0.3;

  // Offset slightly toward the sunlit crescent belly (matching -0.54 rad tilt)
  const litX = moonX - moonR * 0.18;
  const litY = moonY + moonR * 0.1;

  ctx.save();
  if (!isLight) {
    ctx.globalCompositeOperation = 'screen';
  }

  // 1. Wide atmospheric moonlight scattering veil that expands & dims gradually
  const wideR = moonR * (4.9 + 1.35 * glowLevel);
  const wideGrad = ctx.createRadialGradient(litX, litY, moonR * 0.25, moonX, moonY, wideR);
  if (isLight) {
    const a1 = 0.065 + 0.075 * glowLevel;
    const a2 = 0.028 + 0.036 * glowLevel;
    wideGrad.addColorStop(0, `rgba(199, 210, 254, ${a1.toFixed(3)})`);
    wideGrad.addColorStop(0.38, hexToRgba(accentColor, a2));
    wideGrad.addColorStop(0.72, `rgba(224, 231, 255, ${(a2 * 0.4).toFixed(3)})`);
    wideGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const a1 = 0.08 + 0.115 * glowLevel;
    const a2 = 0.04 + 0.065 * glowLevel;
    wideGrad.addColorStop(0, `rgba(226, 232, 240, ${a1.toFixed(3)})`);
    wideGrad.addColorStop(0.28, hexToRgba(accentColor, a2));
    wideGrad.addColorStop(0.62, hexToRgba(accentColor, a2 * 0.34));
    wideGrad.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = wideGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, wideR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Mid silky lunar halation around the moon perimeter
  const midR = moonR * (2.45 + 0.55 * glowLevel);
  const midGrad = ctx.createRadialGradient(litX, litY, moonR * 0.1, litX, litY, midR);
  if (isLight) {
    const b1 = 0.16 + 0.18 * glowLevel;
    midGrad.addColorStop(0, `rgba(255, 255, 255, ${b1.toFixed(3)})`);
    midGrad.addColorStop(0.45, `rgba(199, 210, 254, ${(b1 * 0.42).toFixed(3)})`);
    midGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const b1 = 0.10 + 0.15 * glowLevel;
    midGrad.addColorStop(0, `rgba(255, 252, 242, ${b1.toFixed(3)})`);
    midGrad.addColorStop(0.38, `rgba(226, 232, 240, ${(b1 * 0.52).toFixed(3)})`);
    midGrad.addColorStop(0.75, hexToRgba(accentColor, b1 * 0.18));
    midGrad.addColorStop(1, 'rgba(16, 13, 40, 0)');
  }
  ctx.fillStyle = midGrad;
  ctx.beginPath();
  ctx.arc(litX, litY, midR, 0, Math.PI * 2);
  ctx.fill();

  // 3. Soft inner limb mist bloom hugging the sunlit curve for natural edge diffusion
  const coreR = moonR * (1.32 + 0.24 * secondaryWave);
  const coreX = moonX - moonR * 0.34;
  const coreY = moonY + moonR * 0.18;
  const coreGrad = ctx.createRadialGradient(coreX, coreY, moonR * 0.06, coreX, coreY, coreR);
  if (isLight) {
    const c1 = 0.14 + 0.14 * secondaryWave;
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${c1.toFixed(3)})`);
    coreGrad.addColorStop(0.6, `rgba(224, 231, 255, ${(c1 * 0.35).toFixed(3)})`);
    coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const c1 = 0.085 + 0.125 * secondaryWave;
    coreGrad.addColorStop(0, `rgba(255, 254, 248, ${c1.toFixed(3)})`);
    coreGrad.addColorStop(0.55, `rgba(226, 232, 240, ${(c1 * 0.38).toFixed(3)})`);
    coreGrad.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPolishedCrescentMoon(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  moonX: number,
  moonY: number,
  moonR: number,
  accentColor: string,
  theme: CalmStyleTheme
): void {
  const isLight = theme === 'light';
  const tiltAngle = -0.54;

  // 1. Soft atmospheric ambient mist behind the moon
  const outerCoronaR = moonR * 3.9;
  const outerCorona = ctx.createRadialGradient(
    moonX - moonR * 0.22,
    moonY + moonR * 0.12,
    moonR * 0.2,
    moonX,
    moonY,
    outerCoronaR
  );
  if (isLight) {
    outerCorona.addColorStop(0, 'rgba(199, 210, 254, 0.24)');
    outerCorona.addColorStop(0.36, hexToRgba(accentColor, 0.10));
    outerCorona.addColorStop(0.75, 'rgba(224, 231, 255, 0.03)');
    outerCorona.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    outerCorona.addColorStop(0, 'rgba(241, 245, 249, 0.15)');
    outerCorona.addColorStop(0.28, hexToRgba(accentColor, 0.11));
    outerCorona.addColorStop(0.65, hexToRgba(accentColor, 0.03));
    outerCorona.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = outerCorona;
  ctx.beginPath();
  ctx.arc(moonX, moonY, outerCoronaR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(moonX, moonY);
  ctx.rotate(tiltAngle);

  // 2. Feathered translucent earthshine ("ashen light") — fades softly past rim with ZERO hard circle outline
  const earthshine = ctx.createRadialGradient(-moonR * 0.22, 0, moonR * 0.08, 0, 0, moonR * 1.05);
  if (isLight) {
    earthshine.addColorStop(0, 'rgba(129, 140, 248, 0.048)');
    earthshine.addColorStop(0.68, 'rgba(165, 180, 252, 0.022)');
    earthshine.addColorStop(1, 'rgba(199, 210, 254, 0)');
  } else {
    earthshine.addColorStop(0, 'rgba(199, 210, 254, 0.055)');
    earthshine.addColorStop(0.68, 'rgba(148, 163, 184, 0.022)');
    earthshine.addColorStop(1, 'rgba(148, 163, 184, 0)');
  }
  ctx.fillStyle = earthshine;
  ctx.beginPath();
  ctx.arc(0, 0, moonR * 1.05, 0, Math.PI * 2);
  ctx.fill();

  // 3. Multi-shell feathered atmospheric edge halos (dissolves the crisp vector edge into soft moonlight)
  const featherShells: Array<[number, number, number, number]> = [
    // [radiusScale, innerFactor, featherStrokeWidthRatio, alpha]
    [1.08, 0.29, 0.13, 0.055],
    [1.045, 0.30, 0.085, 0.105],
    [1.022, 0.31, 0.052, 0.165],
    [1.006, 0.315, 0.028, 0.235],
  ];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [rScale, innerF, strokeRatio, shellAlpha] of featherShells) {
    const shellGrad = ctx.createRadialGradient(
      -moonR * 0.48,
      0,
      moonR * 0.06,
      -moonR * 0.18,
      0,
      moonR * 1.24 * rScale
    );
    if (isLight) {
      shellGrad.addColorStop(0, `rgba(129, 140, 248, ${(shellAlpha * 0.72).toFixed(3)})`);
      shellGrad.addColorStop(0.6, hexToRgba(accentColor, shellAlpha * 0.52));
      shellGrad.addColorStop(1, 'rgba(224, 231, 255, 0)');
    } else {
      shellGrad.addColorStop(0, `rgba(255, 253, 246, ${shellAlpha.toFixed(3)})`);
      shellGrad.addColorStop(0.55, `rgba(226, 232, 240, ${(shellAlpha * 0.72).toFixed(3)})`);
      shellGrad.addColorStop(1, hexToRgba(accentColor, shellAlpha * 0.28));
    }
    traceCrescentMoonPath(ctx, moonR * rScale, innerF);
    ctx.fillStyle = shellGrad;
    ctx.fill();
    ctx.strokeStyle = isLight
      ? `rgba(199, 210, 254, ${(shellAlpha * 0.42).toFixed(3)})`
      : `rgba(241, 245, 249, ${(shellAlpha * 0.38).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, moonR * strokeRatio);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Main soft-limb illuminated crescent body (bright inset core tapering smoothly toward the rim)
  const crescentGrad = ctx.createRadialGradient(
    -moonR * 0.54,
    -moonR * 0.04,
    moonR * 0.05,
    -moonR * 0.24,
    0,
    moonR * 1.12
  );
  if (isLight) {
    crescentGrad.addColorStop(0, 'rgba(129, 140, 248, 0.46)');
    crescentGrad.addColorStop(0.45, hexToRgba(accentColor, 0.34));
    crescentGrad.addColorStop(0.82, 'rgba(199, 210, 254, 0.20)');
    crescentGrad.addColorStop(1, 'rgba(224, 231, 255, 0.06)');
  } else {
    crescentGrad.addColorStop(0, 'rgba(255, 253, 246, 0.90)');
    crescentGrad.addColorStop(0.42, 'rgba(241, 245, 249, 0.78)');
    crescentGrad.addColorStop(0.78, 'rgba(216, 224, 246, 0.46)');
    crescentGrad.addColorStop(1, hexToRgba(accentColor, 0.16));
  }
  ctx.fillStyle = crescentGrad;
  traceCrescentMoonPath(ctx, moonR * 0.992, 0.32);
  ctx.fill();

  // 5. Clipped soft radial lunar maria, diffused crater basins, and wide multi-pass terminator dissolution
  ctx.save();
  traceCrescentMoonPath(ctx, moonR * 0.992, 0.32);
  ctx.clip();

  const mariaSpots: Array<[number, number, number, number]> = [
    [-moonR * 0.62, -moonR * 0.22, moonR * 0.24, 0.12],
    [-moonR * 0.68, moonR * 0.14, moonR * 0.27, 0.10],
    [-moonR * 0.50, moonR * 0.42, moonR * 0.18, 0.085],
  ];
  for (const [mx, my, mr, alpha] of mariaSpots) {
    const mGrad = ctx.createRadialGradient(mx, my, mr * 0.08, mx, my, mr);
    const col = isLight ? `rgba(79, 70, 229, ${(alpha * 0.72).toFixed(3)})` : `rgba(100, 116, 139, ${alpha.toFixed(3)})`;
    mGrad.addColorStop(0, col);
    mGrad.addColorStop(0.62, isLight ? `rgba(79, 70, 229, ${(alpha * 0.35).toFixed(3)})` : `rgba(100, 116, 139, ${(alpha * 0.45).toFixed(3)})`);
    mGrad.addColorStop(1, 'rgba(100, 116, 139, 0)');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft diffused crater basins (no hard stroke rings)
  const craters: Array<[number, number, number]> = [
    [-moonR * 0.74, -moonR * 0.04, moonR * 0.07],
    [-moonR * 0.56, moonR * 0.28, moonR * 0.055],
    [-moonR * 0.54, -moonR * 0.40, moonR * 0.048],
  ];
  for (const [cx, cy, cr] of craters) {
    const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cGrad.addColorStop(0, isLight ? 'rgba(99, 102, 241, 0.075)' : 'rgba(71, 85, 105, 0.11)');
    cGrad.addColorStop(0.7, isLight ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)');
    cGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Multi-pass soft gradient feather along the inner terminator so shadow wraps naturally around the sphere
  const c = 0.55228475;
  const kx = moonR * 0.32;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const terminatorPasses: Array<[number, number]> = [
    [0.34, 0.06],
    [0.22, 0.08],
    [0.13, 0.10],
    [0.06, 0.12],
  ];
  for (const [wRatio, tAlpha] of terminatorPasses) {
    ctx.strokeStyle = isLight
      ? `rgba(99, 102, 241, ${(tAlpha * 0.78).toFixed(3)})`
      : `rgba(20, 17, 54, ${tAlpha.toFixed(3)})`;
    ctx.lineWidth = moonR * wRatio;
    ctx.beginPath();
    ctx.moveTo(0, moonR);
    ctx.bezierCurveTo(-kx * c, moonR, -kx, moonR * c, -kx, 0);
    ctx.bezierCurveTo(-kx, -moonR * c, -kx * c, -moonR, 0, -moonR);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function getCachedFlyerStyleBackdrop(
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  seed: number,
  theme: CalmStyleTheme = 'dark'
): HTMLCanvasElement | OffscreenCanvas {
  const key = `flyer-backdrop:v7:${width}x${height}:${creature}:${accentColor}:${seed}:${theme}`;
  return getOrGenerateCachedCanvas(key, width, height, (bCtx) => {
    const rng = mulberry32(combineSeed(seed, 0x77a11b));

    if (theme === 'light') {
      // Calm snow-white gradient tailored gently to each creature's habitat
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(
        0.55,
        creature === 'butterfly' || creature === 'orb' ? '#FFFBFD' : '#F8FAFC'
      );
      bgGrad.addColorStop(
        1,
        creature === 'firefly'
          ? '#F0FDF4'
          : creature === 'bat'
            ? '#EEF2FF'
            : creature === 'butterfly'
              ? '#FDF2F8'
              : '#FCE7F3'
      );
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Soft pastel radial halo from the chosen accent color
      const pastelHalo = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.44,
        height * 0.04,
        width * 0.5,
        height * 0.44,
        Math.max(width, height) * 0.62
      );
      pastelHalo.addColorStop(0, hexToRgba(accentColor, 0.18));
      pastelHalo.addColorStop(0.52, hexToRgba(accentColor, 0.07));
      pastelHalo.addColorStop(1, 'rgba(255, 255, 255, 0)');
      bCtx.fillStyle = pastelHalo;
      bCtx.fillRect(0, 0, width, height);

      // Secondary habitat pastel aura
      const auraX = creature === 'bat' ? width * 0.22 : width * 0.26;
      const auraY = creature === 'bat' ? height * 0.22 : height * 0.72;
      const cornerAura = bCtx.createRadialGradient(
        auraX,
        auraY,
        height * 0.03,
        auraX,
        auraY,
        Math.max(width, height) * 0.48
      );
      cornerAura.addColorStop(
        0,
        creature === 'firefly'
          ? 'rgba(16, 185, 129, 0.09)'
          : creature === 'bat'
            ? 'rgba(129, 140, 248, 0.10)'
            : creature === 'butterfly'
              ? 'rgba(251, 191, 36, 0.08)'
              : 'rgba(244, 114, 182, 0.11)'
      );
      cornerAura.addColorStop(1, 'rgba(255, 255, 255, 0)');
      bCtx.fillStyle = cornerAura;
      bCtx.fillRect(0, 0, width, height);

      if (creature === 'firefly') {
        // Delicate pastel botanical reed silhouettes at the bottom
        const reedCount = Math.round(width / 28);
        bCtx.save();
        bCtx.lineCap = 'round';
        for (let i = 0; i < reedCount; i++) {
          const rx = (i / reedCount) * width + (rng() - 0.5) * 24;
          const reedH = height * (0.06 + rng() * 0.11);
          const lean = (rng() - 0.45) * 34;
          const alpha = 0.08 + rng() * 0.09;
          bCtx.strokeStyle = `rgba(15, 118, 110, ${alpha.toFixed(3)})`;
          bCtx.lineWidth = 1.5 + rng() * 1.8;
          bCtx.beginPath();
          bCtx.moveTo(rx, height + 4);
          bCtx.quadraticCurveTo(
            rx + lean * 0.45,
            height - reedH * 0.55,
            rx + lean,
            height - reedH
          );
          bCtx.stroke();
        }
        bCtx.restore();
      } else if (creature === 'bat') {
        // Soft morning twilight silhouettes & mist curve at bottom
        bCtx.save();
        bCtx.fillStyle = 'rgba(99, 102, 241, 0.045)';
        bCtx.beginPath();
        bCtx.moveTo(0, height);
        bCtx.quadraticCurveTo(width * 0.3, height * 0.91, width * 0.62, height * 0.94);
        bCtx.quadraticCurveTo(width * 0.85, height * 0.96, width, height * 0.9);
        bCtx.lineTo(width, height);
        bCtx.closePath();
        bCtx.fill();

        const moonX = width * 0.2;
        const moonY = height * 0.19;
        const moonR = Math.min(width, height) * 0.044;
        drawPolishedCrescentMoon(bCtx, moonX, moonY, moonR, accentColor, 'light');
        bCtx.restore();
      } else if (creature === 'butterfly') {
        // Delicate pastel garden stems and soft buds at bottom
        const stemCount = Math.round(width / 36);
        bCtx.save();
        bCtx.lineCap = 'round';
        for (let i = 0; i < stemCount; i++) {
          const sx = (i / stemCount) * width + (rng() - 0.5) * 26;
          const stemH = height * (0.055 + rng() * 0.095);
          const lean = (rng() - 0.5) * 36;
          const alpha = 0.08 + rng() * 0.08;
          bCtx.strokeStyle = hexToRgba(accentColor, alpha * 1.15);
          bCtx.lineWidth = 1.4 + rng() * 1.5;
          bCtx.beginPath();
          bCtx.moveTo(sx, height + 4);
          bCtx.quadraticCurveTo(
            sx + lean * 0.42,
            height - stemH * 0.55,
            sx + lean,
            height - stemH
          );
          bCtx.stroke();

          if (i % 3 === 0) {
            bCtx.fillStyle = hexToRgba(accentColor, alpha * 1.3);
            bCtx.beginPath();
            bCtx.ellipse(sx + lean, height - stemH, 3.2, 4.8, lean * 0.015, 0, Math.PI * 2);
            bCtx.fill();
          }
        }
        bCtx.restore();
      } else {
        // Soft pastel plum-blossom dawn blush washes & subtle scattered petal flecks
        for (let c = 0; c < 2; c++) {
          const nx = width * (0.28 + c * 0.46);
          const ny = height * (0.3 + c * 0.36);
          const neb = bCtx.createRadialGradient(nx, ny, height * 0.02, nx, ny, width * 0.42);
          neb.addColorStop(0, c === 0 ? 'rgba(251, 207, 232, 0.22)' : hexToRgba(accentColor, 0.12));
          neb.addColorStop(1, 'rgba(255, 255, 255, 0)');
          bCtx.fillStyle = neb;
          bCtx.fillRect(0, 0, width, height);
        }
        for (let i = 0; i < 16; i++) {
          const sx = rng() * width;
          const sy = rng() * height * 0.88;
          drawMiniPlumPetal(
            bCtx,
            sx,
            sy,
            2.6 + rng() * 3.0,
            rng() * Math.PI * 2,
            accentColor,
            '#FBCFE8',
            false,
            0.12 + rng() * 0.12
          );
        }
      }
      return;
    }

    if (creature === 'firefly') {
      // Deep forest night (#04110F to #0A1F1C)
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#04110F');
      bgGrad.addColorStop(0.58, '#071916');
      bgGrad.addColorStop(1, '#0A1F1C');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Light atmospheric forest mist layers
      for (let m = 0; m < 3; m++) {
        const my = height * (0.42 + m * 0.2);
        const mistGrad = bCtx.createRadialGradient(
          width * (0.28 + m * 0.22),
          my,
          height * 0.04,
          width * (0.28 + m * 0.22),
          my,
          width * 0.48
        );
        mistGrad.addColorStop(0, 'rgba(164, 224, 208, 0.055)');
        mistGrad.addColorStop(0.5, 'rgba(94, 176, 158, 0.025)');
        mistGrad.addColorStop(1, 'rgba(4, 17, 15, 0)');
        bCtx.fillStyle = mistGrad;
        bCtx.fillRect(0, 0, width, height);
      }

      // Faint grass/reed silhouettes at the bottom
      const reedCount = Math.round(width / 26);
      bCtx.save();
      bCtx.lineCap = 'round';
      for (let i = 0; i < reedCount; i++) {
        const rx = (i / reedCount) * width + (rng() - 0.5) * 24;
        const reedH = height * (0.065 + rng() * 0.13);
        const lean = (rng() - 0.45) * 38;
        const alpha = 0.22 + rng() * 0.28;
        bCtx.strokeStyle = `rgba(2, 10, 9, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.6 + rng() * 2.2;
        bCtx.beginPath();
        bCtx.moveTo(rx, height + 4);
        bCtx.quadraticCurveTo(
          rx + lean * 0.45,
          height - reedH * 0.55,
          rx + lean,
          height - reedH
        );
        bCtx.stroke();

        // Occasional cattail / reed seed head
        if (i % 5 === 0) {
          bCtx.fillStyle = `rgba(3, 12, 10, ${(alpha * 0.95).toFixed(3)})`;
          bCtx.save();
          bCtx.translate(rx + lean * 0.82, height - reedH * 0.82);
          bCtx.rotate(lean * 0.008);
          bCtx.beginPath();
          bCtx.ellipse(0, 0, 2.8, 11, 0, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.restore();
        }
      }
      bCtx.restore();

      // Soft dark vignette
      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(1, 6, 5, 0.62)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else if (creature === 'bat') {
      // Quiet Moonlit Dusk ("غسق قمري هادئ")
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#060513');
      bgGrad.addColorStop(0.56, '#100D28');
      bgGrad.addColorStop(1, '#1A1438');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Atmospheric moonlit corona & detailed crescent moon in upper corner
      const moonX = width * 0.2;
      const moonY = height * 0.19;
      const moonR = Math.min(width, height) * 0.045;

      const moonAmbient = bCtx.createRadialGradient(
        moonX,
        moonY,
        moonR * 0.4,
        moonX,
        moonY,
        Math.max(width, height) * 0.4
      );
      moonAmbient.addColorStop(0, 'rgba(226, 232, 240, 0.14)');
      moonAmbient.addColorStop(0.28, hexToRgba(accentColor, 0.11));
      moonAmbient.addColorStop(0.65, hexToRgba(accentColor, 0.03));
      moonAmbient.addColorStop(1, 'rgba(6, 5, 19, 0)');
      bCtx.fillStyle = moonAmbient;
      bCtx.fillRect(0, 0, width, height);

      drawPolishedCrescentMoon(bCtx, moonX, moonY, moonR, accentColor, 'dark');

      // Subtle twilight horizon mist layers
      for (let m = 0; m < 2; m++) {
        const my = height * (0.58 + m * 0.22);
        const mist = bCtx.createRadialGradient(
          width * (0.35 + m * 0.3),
          my,
          height * 0.03,
          width * (0.35 + m * 0.3),
          my,
          width * 0.52
        );
        mist.addColorStop(0, 'rgba(199, 210, 254, 0.045)');
        mist.addColorStop(1, 'rgba(10, 8, 27, 0)');
        bCtx.fillStyle = mist;
        bCtx.fillRect(0, 0, width, height);
      }

      // Faint distant dusk hill & slender twilight branch silhouettes at bottom
      bCtx.save();
      bCtx.fillStyle = 'rgba(4, 3, 14, 0.56)';
      bCtx.beginPath();
      bCtx.moveTo(0, height);
      bCtx.quadraticCurveTo(width * 0.28, height * 0.91, width * 0.56, height * 0.94);
      bCtx.quadraticCurveTo(width * 0.82, height * 0.97, width, height * 0.9);
      bCtx.lineTo(width, height);
      bCtx.closePath();
      bCtx.fill();

      const branchCount = Math.round(width / 56);
      bCtx.lineCap = 'round';
      for (let i = 0; i < branchCount; i++) {
        const bx = (i / branchCount) * width + (rng() - 0.5) * 32;
        const bh = height * (0.055 + rng() * 0.095);
        const lean = (rng() - 0.5) * 42;
        const alpha = 0.25 + rng() * 0.25;
        bCtx.strokeStyle = `rgba(4, 3, 13, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.4 + rng() * 1.6;
        bCtx.beginPath();
        bCtx.moveTo(bx, height + 3);
        bCtx.quadraticCurveTo(bx + lean * 0.45, height - bh * 0.52, bx + lean, height - bh);
        bCtx.stroke();
      }
      bCtx.restore();

      // Quiet twilight stars in upper sky
      for (let i = 0; i < 20; i++) {
        const sx = rng() * width;
        const sy = rng() * height * 0.72;
        const sr = 0.7 + rng() * 1.4;
        bCtx.fillStyle = `rgba(226, 232, 240, ${(0.1 + rng() * 0.22).toFixed(3)})`;
        bCtx.beginPath();
        bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bCtx.fill();
      }

      // Soft nocturnal vignette
      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(3, 2, 12, 0.58)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else if (creature === 'butterfly') {
      // Serene Garden of Light ("حديقة ضوء هادئة")
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#080A1A');
      bgGrad.addColorStop(0.55, '#121530');
      bgGrad.addColorStop(1, '#191B3A');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Soft enchanted garden warm-pastel light glow
      const gardenGlow = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.46,
        height * 0.04,
        width * 0.5,
        height * 0.46,
        Math.max(width, height) * 0.62
      );
      gardenGlow.addColorStop(0, hexToRgba(accentColor, 0.14));
      gardenGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.04)');
      gardenGlow.addColorStop(1, 'rgba(8, 10, 26, 0)');
      bCtx.fillStyle = gardenGlow;
      bCtx.fillRect(0, 0, width, height);

      // Gentle meadow evening mist layers
      for (let m = 0; m < 2; m++) {
        const my = height * (0.56 + m * 0.2);
        const mist = bCtx.createRadialGradient(
          width * (0.28 + m * 0.44),
          my,
          height * 0.04,
          width * (0.28 + m * 0.44),
          my,
          width * 0.46
        );
        mist.addColorStop(0, hexToRgba(accentColor, 0.065));
        mist.addColorStop(0.6, 'rgba(167, 243, 208, 0.02)');
        mist.addColorStop(1, 'rgba(8, 10, 26, 0)');
        bCtx.fillStyle = mist;
        bCtx.fillRect(0, 0, width, height);
      }

      // Delicate arched botanical stems & leaf buds along the bottom edge
      const stemCount = Math.round(width / 32);
      bCtx.save();
      bCtx.lineCap = 'round';
      for (let i = 0; i < stemCount; i++) {
        const sx = (i / stemCount) * width + (rng() - 0.5) * 24;
        const stemH = height * (0.06 + rng() * 0.12);
        const lean = (rng() - 0.48) * 42;
        const alpha = 0.24 + rng() * 0.24;
        bCtx.strokeStyle = `rgba(6, 7, 20, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.5 + rng() * 1.8;
        bCtx.beginPath();
        bCtx.moveTo(sx, height + 4);
        bCtx.quadraticCurveTo(sx + lean * 0.42, height - stemH * 0.56, sx + lean, height - stemH);
        bCtx.stroke();

        // Soft leaf/flower bud silhouettes
        if (i % 3 === 0) {
          bCtx.fillStyle = `rgba(8, 9, 24, ${(alpha * 0.92).toFixed(3)})`;
          bCtx.save();
          bCtx.translate(sx + lean * 0.92, height - stemH * 0.92);
          bCtx.rotate(lean * 0.014);
          bCtx.beginPath();
          bCtx.ellipse(0, 0, 3.6, 7.2, 0, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.restore();
        }
      }
      bCtx.restore();

      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(4, 5, 16, 0.56)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else {
      // Night Plum Blossom Sky ("بتلات زهرة البرقوق - ليلي"):
      // Deep indigo-to-plum-violet night sky + soft moonlit glow + quiet stars + subtle plum silhouette
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#07091E');
      bgGrad.addColorStop(0.52, '#151138');
      bgGrad.addColorStop(1, '#29164A');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Soft silvery-lavender lunar atmosphere & pale moon disc in upper-left sky
      const moonX = width * 0.18;
      const moonY = height * 0.2;
      const moonR = Math.min(width, height) * 0.042;
      const moonAmbient = bCtx.createRadialGradient(
        moonX,
        moonY,
        moonR * 0.4,
        moonX,
        moonY,
        Math.max(width, height) * 0.46
      );
      moonAmbient.addColorStop(0, 'rgba(250, 240, 255, 0.22)');
      moonAmbient.addColorStop(0.24, hexToRgba(accentColor, 0.12));
      moonAmbient.addColorStop(0.58, 'rgba(139, 92, 246, 0.055)');
      moonAmbient.addColorStop(1, 'rgba(7, 9, 30, 0)');
      bCtx.fillStyle = moonAmbient;
      bCtx.fillRect(0, 0, width, height);

      const moonDisc = bCtx.createRadialGradient(
        moonX - moonR * 0.2,
        moonY - moonR * 0.2,
        moonR * 0.1,
        moonX,
        moonY,
        moonR
      );
      moonDisc.addColorStop(0, '#FFFFFF');
      moonDisc.addColorStop(0.7, '#F5E8FF');
      moonDisc.addColorStop(1, 'rgba(244, 180, 220, 0.65)');
      bCtx.fillStyle = moonDisc;
      bCtx.beginPath();
      bCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      bCtx.fill();

      // Atmospheric crimson-plum twilight veil across lower-right depth
      const plumMist = bCtx.createRadialGradient(
        width * 0.76,
        height * 0.72,
        height * 0.03,
        width * 0.76,
        height * 0.72,
        width * 0.56
      );
      plumMist.addColorStop(0, hexToRgba(accentColor, 0.12));
      plumMist.addColorStop(0.52, 'rgba(136, 19, 55, 0.065)');
      plumMist.addColorStop(1, 'rgba(7, 9, 30, 0)');
      bCtx.fillStyle = plumMist;
      bCtx.fillRect(0, 0, width, height);

      // Subtle atmospheric plum-branch silhouette tucked gently in the top-right corner
      bCtx.save();
      bCtx.strokeStyle = 'rgba(16, 10, 36, 0.52)';
      bCtx.lineCap = 'round';
      bCtx.lineWidth = Math.max(2.4, Math.min(width, height) * 0.0055);
      bCtx.beginPath();
      bCtx.moveTo(width + 10, height * 0.05);
      bCtx.quadraticCurveTo(width * 0.89, height * 0.11, width * 0.79, height * 0.17);
      bCtx.stroke();
      bCtx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.003);
      bCtx.beginPath();
      bCtx.moveTo(width * 0.89, height * 0.11);
      bCtx.quadraticCurveTo(width * 0.86, height * 0.17, width * 0.82, height * 0.21);
      bCtx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(width * 0.94, height * 0.08);
      bCtx.quadraticCurveTo(width * 0.91, height * 0.04, width * 0.86, height * 0.04);
      bCtx.stroke();
      // Faint moonlit blossom buds perched on silhouette bough
      const buds = [
        { x: width * 0.82, y: height * 0.21, s: 4.2 },
        { x: width * 0.79, y: height * 0.17, s: 4.8 },
        { x: width * 0.87, y: height * 0.12, s: 3.8 },
        { x: width * 0.92, y: height * 0.08, s: 4.4 },
        { x: width * 0.86, y: height * 0.04, s: 3.6 },
      ];
      for (let b = 0; b < buds.length; b++) {
        drawMiniPlumPetal(
          bCtx,
          buds[b].x,
          buds[b].y,
          buds[b].s,
          b * 0.9 - 0.5,
          accentColor,
          '#FBCFE8',
          false,
          0.32,
          buds[b].s * 2.4
        );
      }
      bCtx.restore();

      // Quiet distant starlight dots across upper night sky
      for (let i = 0; i < 30; i++) {
        const sx = rng() * width;
        const sy = rng() * height * 0.84;
        const sr = 0.7 + rng() * 1.45;
        bCtx.fillStyle = `rgba(248, 244, 255, ${(0.11 + rng() * 0.24).toFixed(3)})`;
        bCtx.beginPath();
        bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bCtx.fill();
      }

      // Soft cinematic indigo-plum vignette
      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.26,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.76
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(4, 3, 16, 0.58)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    }
  });
}

export function drawStyleBackdropAndBokeh(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  seed: number,
  t: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const cached = getCachedFlyerStyleBackdrop(width, height, creature, accentColor, seed, theme);
  ctx.drawImage(cached, 0, 0, width, height);

  const bgPace = clamp(0.62 + (flightSpeed - 0.55) * 0.35, 0.45, 1.05);
  const rng = mulberry32(combineSeed(seed, 0x9931a4));

  if (theme === 'light') {
    if (creature === 'bat') {
      drawMoonSoftGlow(
        ctx,
        width * 0.2,
        height * 0.19,
        Math.min(width, height) * 0.044,
        accentColor,
        'light',
        t,
        bgPace
      );
    }

    // Gentle drifting pastel bokeh circles tailored per creature on the calm white background
    const bokehCount = creature === 'butterfly' ? 11 : 10;
    ctx.save();
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.34 * bgPace + i * 1.7) * 14;
      const by = (0.14 + rng() * 0.72) * height + Math.cos(t * 0.28 * bgPace + i * 2.1) * 10;
      const radius = 11 + rng() * 21;
      const freq = (0.4 + rng() * 0.32) * bgPace;
      const phase = rng() * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase);
      const alpha = 0.05 + 0.12 * pulse;

      const bokehColor =
        creature === 'butterfly' && i % 3 === 0
          ? '#F59E0B'
          : creature === 'bat' && i % 3 === 0
            ? '#818CF8'
            : accentColor;
      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba(bokehColor, alpha));
      bokehGrad.addColorStop(0.55, hexToRgba(bokehColor, alpha * 0.45));
      bokehGrad.addColorStop(1, hexToRgba(bokehColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (creature === 'firefly') {
    // Distant seeded blinking fireflies as soft bokeh in forest night
    const bokehCount = 11;
    ctx.save();
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.45 * bgPace + i * 1.7) * 14;
      const by = (0.14 + rng() * 0.72) * height + Math.cos(t * 0.38 * bgPace + i * 2.1) * 10;
      const radius = 8 + rng() * 18;
      const freq = (0.52 + rng() * 0.42) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.2);
      const alpha = 0.06 + 0.26 * blink;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba('#FFF8D6', alpha * 0.95));
      bokehGrad.addColorStop(0.4, hexToRgba(accentColor, alpha * 0.65));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (creature === 'bat') {
    // Quiet Moonlit Dusk ("غسق قمري هادئ"): gradual multi-layer soft lunar glow + drifting twilight bokeh & faint twinkling stars
    ctx.save();
    const moonX = width * 0.2;
    const moonY = height * 0.19;
    const moonR = Math.min(width, height) * 0.045;
    drawMoonSoftGlow(ctx, moonX, moonY, moonR, accentColor, 'dark', t, bgPace);

    // Gentle twinkling high-sky stars
    for (let s = 0; s < 6; s++) {
      const sx = (0.1 + rng() * 0.8) * width;
      const sy = (0.08 + rng() * 0.44) * height;
      const sr = 1.6 + rng() * 1.4;
      const ph = rng() * Math.PI * 2;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (0.32 + rng() * 0.22) * bgPace + ph), 2.4);
      const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.8);
      sGrad.addColorStop(0, `rgba(241, 245, 249, ${(0.18 + 0.42 * tw).toFixed(3)})`);
      sGrad.addColorStop(1, 'rgba(241, 245, 249, 0)');
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drifting soft moonlight & twilight mist bokeh orbs
    const bokehCount = 10;
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.32 * bgPace + i * 1.85) * 16;
      const by = (0.16 + rng() * 0.7) * height + Math.cos(t * 0.26 * bgPace + i * 2.15) * 11;
      const radius = 9 + rng() * 18;
      const freq = (0.38 + rng() * 0.34) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.0);
      const alpha = 0.045 + 0.17 * blink;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, `rgba(226, 232, 240, ${(alpha * 0.92).toFixed(3)})`);
      bokehGrad.addColorStop(0.45, hexToRgba(accentColor, alpha * 0.62));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (creature === 'butterfly') {
    // Serene Garden of Light ("حديقة ضوء هادئة"): slow floating golden pollen & soft petal-light bokeh
    ctx.save();
    const bokehCount = 12;
    for (let i = 0; i < bokehCount; i++) {
      const baseX = (0.07 + rng() * 0.86) * width;
      const baseY = (0.15 + rng() * 0.72) * height;
      const bx = baseX + Math.sin(t * 0.38 * bgPace + i * 1.65) * 16;
      const by = baseY + Math.cos(t * 0.31 * bgPace + i * 1.95) * 12;
      const radius = 8 + rng() * 17;
      const freq = (0.42 + rng() * 0.38) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.1);
      const alpha = 0.055 + 0.22 * blink;
      const isWarmPollen = i % 3 === 0;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba(isWarmPollen ? '#FFFBEB' : '#FFF5F8', alpha * 0.95));
      bokehGrad.addColorStop(0.42, hexToRgba(isWarmPollen ? '#FDE68A' : accentColor, alpha * 0.68));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Night Plum Blossom Petals ("بتلات زهرة البرقوق - ليلي"):
    // Breathing moonlight halo + twinkling stars + slowly drifting glowing rose-crimson plum petals
    ctx.save();
    const moonX = width * 0.18;
    const moonY = height * 0.2;
    const moonR = Math.min(width, height) * 0.042;
    drawMoonSoftGlow(ctx, moonX, moonY, moonR, accentColor, 'dark', t, bgPace * 0.9);

    // Softly twinkling distant stars
    for (let s = 0; s < 8; s++) {
      const sx = (0.08 + rng() * 0.84) * width;
      const sy = (0.07 + rng() * 0.58) * height;
      const sr = 1.4 + rng() * 1.5;
      const ph = rng() * Math.PI * 2;
      const tw = Math.pow(
        0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (0.32 + rng() * 0.24) * bgPace + ph),
        2.3
      );
      const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.9);
      sGrad.addColorStop(0, `rgba(255, 247, 252, ${(0.18 + 0.45 * tw).toFixed(3)})`);
      sGrad.addColorStop(0.5, hexToRgba(accentColor, 0.16 * tw));
      sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 2.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // 12 gently drifting, glowing rose-crimson & moonlit-blush plum petals floating through the night air
    const crimsonCol = mixHex(accentColor, '#BE185D', 0.42);
    const blushCol = mixHex(accentColor, '#FCE7F3', 0.55);
    const petalCount = 12;
    for (let i = 0; i < petalCount; i++) {
      const startX = rng() * width;
      const startY = rng() * height;
      const driftSpeedY = (12 + rng() * 14) * bgPace;
      const driftSpeedX = -(9 + rng() * 11) * bgPace;
      const phase = rng() * Math.PI * 2;
      const rawX = startX + t * driftSpeedX + Math.sin(t * 0.55 * bgPace + phase) * 26;
      const rawY = startY + t * driftSpeedY + Math.cos(t * 0.42 * bgPace + phase) * 12;
      const px = ((rawX % (width + 60)) + (width + 60)) % (width + 60) - 30;
      const py = ((rawY % (height + 60)) + (height + 60)) % (height + 60) - 30;
      const sz = 4.2 + rng() * 4.4;
      const rot = phase + Math.sin(t * 0.8 * bgPace + phase) * 0.95 + t * 0.18 * (i % 2 === 0 ? 1 : -1);
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.15 * bgPace + phase);
      const col = i % 3 === 0 ? crimsonCol : i % 3 === 1 ? accentColor : blushCol;
      drawMiniPlumPetal(
        ctx,
        px,
        py,
        sz,
        rot,
        col,
        blushCol,
        false,
        0.22 + 0.28 * pulse,
        sz * 2.6
      );
    }
    ctx.restore();
  }
}

// ============================================================================
// CREATURE RENDERING (ALL 4 POLISHED CREATURES + LIVE PREVIEW THUMBNAIL)
// ============================================================================

export interface DrawCreatureParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  creature: FlyerCreatureId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speedNorm: number; // 0 when hovering/stopped, 1 when flying at cruise speed
  hoverBoost: number; // 0..1 boost when passing/hovering near a keyword
  t: number;
  scale: number;
  accentColor: string;
  bgMode: BackgroundMode;
  seed: number;
  theme?: CalmStyleTheme;
  flightSpeed?: number;
  calmMode?: boolean;
}

export function drawFlyerCreature(params: DrawCreatureParams): void {
  const {
    ctx,
    creature,
    x,
    y,
    vx,
    vy,
    speedNorm,
    hoverBoost,
    t,
    scale,
    accentColor,
    bgMode,
    seed,
    theme = 'dark',
    flightSpeed = DEFAULT_FLYER_FLIGHT_SPEED,
    calmMode = false,
  } = params;

  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const isLight = bgMode === 'style' && theme === 'light';
  const paceMul = calmMode
    ? clamp(flightSpeed / DEFAULT_CALM_FLYER_SPEED, 0.52, 1.45) * 0.78
    : clamp(flightSpeed / DEFAULT_FLYER_FLIGHT_SPEED, 0.48, 1.55) * 0.82;

  // Serene weightless vertical bob, smooth turn banking & gentle horizontal flip without sudden snap
  const bobOffset = calmMode
    ? Math.sin(t * Math.PI * 2 * 0.24 * paceMul) * 2.4 * scale
    : Math.sin(t * Math.PI * 2 * 0.34 * paceMul) * 3.4 * scale;
  const maxBankRad = ((calmMode ? 3.8 : 5.2) * Math.PI) / 180;
  const turnBlend = clamp(Math.abs(vx) / (calmMode ? 26 : 34), 0, 1);
  const smoothTurn = easeInOutCubic(turnBlend);
  const rawBank = (vy / 580) * maxBankRad + (Math.abs(vx) / 960) * maxBankRad * 0.25;
  const bankAngle = clamp(rawBank * smoothTurn, -maxBankRad, maxBankRad);
  const facingLeft = vx < 0;
  const turnScaleX = lerp(calmMode ? 0.68 : 0.56, 1.0, smoothTurn);
  const pitchFactor =
    creature === 'orb' || creature === 'butterfly'
      ? 0.24
      : creature === 'bat'
        ? 0.2
        : 0.15;
  const curvePitch =
    clamp(Math.atan2(vy, Math.max(105, Math.abs(vx))) * pitchFactor, -pitchFactor, pitchFactor) *
    smoothTurn;

  ctx.save();
  ctx.translate(x, y + bobOffset);
  ctx.scale((facingLeft ? -1 : 1) * turnScaleX, 1);
  ctx.rotate(bankAngle + curvePitch);
  ctx.scale(scale, scale);

  if (creature === 'orb') {
    // Regal Night Plum Swallowtail Butterfly («فراشة البرقوق (ليلي)»):
    // Plum-petal sculpted forewings + graceful curved swallowtail hindwings,
    // crimson-rose & deep midnight-violet shading with luminous moonlit rims,
    // dreamy slow wingbeat scattering miniature plum petals & lunar glints.
    const plumRose = accentColor;
    const crimsonWine = mixHex(accentColor, '#BE185D', 0.52);
    const deepViolet = mixHex(accentColor, '#3B0764', 0.72);
    const royalPlum = mixHex(accentColor, '#6B21A8', 0.58);
    const blushMoon = mixHex(accentColor, '#FFF1F7', 0.78);
    const goldMoon = '#FDE68A';
    const darkInk = '#1A0B2E';

    // Dreamy slow hypnotic wingbeat (dwells gently near full open glide)
    const flapFreq = calmMode
      ? lerp(0.84, 1.1, speedNorm) * clamp(paceMul, 0.68, 1.25)
      : lerp(0.92, 1.36, speedNorm) * paceMul;
    const flapPhase = t * Math.PI * 2 * flapFreq;
    const nearOpen = Math.pow(Math.abs(Math.sin(flapPhase)), 0.72);
    const farOpen = Math.pow(Math.abs(Math.sin(flapPhase - 0.18)), 0.72);
    const nearWingY = 0.4 + 0.6 * nearOpen;
    const farWingY = 0.34 + 0.54 * farOpen;
    const tailFlex = Math.sin(flapPhase - 0.62) * 2.5;

    // 1) Soft moonlit plum-violet radial aura (STYLE / BLACK only)
    if (!isGreen) {
      const auraPulse = 1 + 0.06 * Math.sin(flapPhase * 0.5) + hoverBoost * 0.16;
      const auraR = (isLight ? 44 : 46) * auraPulse;
      const auraGrad = ctx.createRadialGradient(-4, 0, 2, -4, 0, auraR);
      if (isLight) {
        auraGrad.addColorStop(0, hexToRgba(plumRose, 0.34 + hoverBoost * 0.18));
        auraGrad.addColorStop(0.55, hexToRgba(royalPlum, 0.16));
        auraGrad.addColorStop(1, hexToRgba(plumRose, 0));
      } else {
        auraGrad.addColorStop(0, 'rgba(255, 241, 247, 0.52)');
        auraGrad.addColorStop(0.32, hexToRgba(plumRose, 0.38 + hoverBoost * 0.2));
        auraGrad.addColorStop(0.68, hexToRgba(royalPlum, 0.2 + hoverBoost * 0.08));
        auraGrad.addColorStop(1, 'rgba(107, 33, 168, 0)');
      }
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(-4, 0, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2) Delicate miniature plum-blossom petals & lunar glints drifting behind the swallowtail
    const wakeCount = isGreen ? 4 : 6;
    const wakeBack = clamp(Math.hypot(vx, vy) / 240, 0.25, 1.0) * 11;
    const beatLift = (1 - nearOpen) * 2.8;
    for (let m = 0; m < wakeCount; m++) {
      const pPhase = (seed % 97) * 0.13 + m * 1.618;
      const dxW =
        -19 -
        m * 4.5 -
        wakeBack * (0.3 + (m % 3) * 0.25) +
        Math.cos(t * 0.82 * paceMul + pPhase) * 4.2;
      const dyW =
        Math.sin(t * 1.04 * paceMul + pPhase) * (7.5 + (m % 3) * 3.6) +
        (m % 2 === 0 ? -1 : 1) * (2.5 + m * 0.9) +
        (m % 2 === 0 ? -beatLift : beatLift);
      const pRot = pPhase + Math.sin(t * 1.12 * paceMul + pPhase) * 0.85 + t * 0.32 * paceMul;
      const pSize = 3.0 - m * 0.22 + (isGreen ? 0 : hoverBoost * 0.45);
      const pCol = m % 3 === 0 ? crimsonWine : m % 3 === 1 ? plumRose : blushMoon;
      const pAlpha = isGreen
        ? 1
        : clamp(0.42 + 0.42 * (0.5 + 0.5 * Math.sin(t * 1.8 * paceMul + pPhase)), 0.22, 0.9);

      drawMiniPlumPetal(
        ctx,
        dxW,
        dyW,
        Math.max(1.5, pSize),
        pRot,
        pCol,
        blushMoon,
        isGreen,
        pAlpha,
        isGreen ? 0 : pSize * (isLight ? 2.0 : 2.6)
      );
    }

    // Helper: draw one complete Night Plum Swallowtail wing pair (far or near)
    const drawPlumSwallowtailWingPair = (
      wingElevation: number,
      alphaMul: number,
      isFarWing: boolean
    ) => {
      ctx.save();
      ctx.globalAlpha *= alphaMul;
      if (isFarWing) {
        ctx.translate(-2.4, -1.6);
        ctx.rotate(-0.08);
      }
      ctx.scale(1, wingElevation);

      // Wing fill gradient: moonlit blush heart -> sakura-rose -> crimson wine -> deep midnight violet tips
      if (isGreen) {
        ctx.fillStyle = isFarWing ? royalPlum : crimsonWine;
      } else {
        const foreGrad = ctx.createLinearGradient(5, -2, -25, -27);
        foreGrad.addColorStop(0, blushMoon);
        foreGrad.addColorStop(0.24, plumRose);
        foreGrad.addColorStop(0.58, crimsonWine);
        foreGrad.addColorStop(0.86, isFarWing ? deepViolet : royalPlum);
        foreGrad.addColorStop(1, deepViolet);
        ctx.fillStyle = foreGrad;
      }

      // Forewing: lush plum-petal contour with a subtle authentic notched outer petal tip
      ctx.beginPath();
      ctx.moveTo(4, -2);
      ctx.bezierCurveTo(18, -22, 6, -34, -7, -31);
      // Soft plum-petal notch along top-outer lobe
      ctx.quadraticCurveTo(-11.5, -29.5, -13.5, -27.2);
      ctx.bezierCurveTo(-21, -28.5, -28, -20, -25.5, -11.5);
      ctx.bezierCurveTo(-23, -3.5, -11, -1, 4, -2);
      ctx.closePath();
      ctx.fill();

      if (isGreen) {
        ctx.strokeStyle = darkInk;
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Crisp inner rose petal heart on green screen
        ctx.fillStyle = plumRose;
        ctx.beginPath();
        ctx.moveTo(2, -3);
        ctx.bezierCurveTo(10, -16, 0, -23, -10, -19);
        ctx.bezierCurveTo(-15, -15, -11, -5, 2, -3);
        ctx.closePath();
        ctx.fill();
      } else {
        // Luminous pearlescent plum-blossom inner sheen
        const sheen = ctx.createRadialGradient(-4, -14, 1.5, -6, -15, 19);
        sheen.addColorStop(0, 'rgba(255, 245, 250, 0.56)');
        sheen.addColorStop(0.45, hexToRgba(plumRose, 0.28));
        sheen.addColorStop(1, 'rgba(244, 114, 182, 0)');
        ctx.fillStyle = sheen;
        ctx.fill();
      }

      // Hindwing with scalloped plum-petal margin & elegant curved swallowtail streamer
      if (isGreen) {
        ctx.fillStyle = isFarWing ? deepViolet : royalPlum;
      } else {
        const hindGrad = ctx.createLinearGradient(3, 1, -26, 24);
        hindGrad.addColorStop(0, blushMoon);
        hindGrad.addColorStop(0.28, plumRose);
        hindGrad.addColorStop(0.62, crimsonWine);
        hindGrad.addColorStop(1, deepViolet);
        ctx.fillStyle = hindGrad;
      }

      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.bezierCurveTo(-12, -3, -24, 3, -22.5, 11.5);
      // Scallop curve sweeping gracefully into the slender swallowtail streamer
      ctx.quadraticCurveTo(-21, 14.5, -24.5, 18.5);
      ctx.quadraticCurveTo(-28.5, 23 + tailFlex * 0.7, -27.5, 26.8 + tailFlex);
      ctx.quadraticCurveTo(-24.2, 24.5 + tailFlex * 0.7, -20.5, 19.2 + tailFlex * 0.3);
      // Inner scalloped trailing lobe back to abdomen
      ctx.quadraticCurveTo(-16.5, 21.8, -11.5, 18.8);
      ctx.bezierCurveTo(-5, 20.5, 2.5, 11, 2, 0);
      ctx.closePath();
      ctx.fill();

      if (isGreen) {
        ctx.strokeStyle = darkInk;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Delicate plum-petal venation radiating from thorax through forewing & swallowtail
      ctx.strokeStyle = isGreen
        ? darkInk
        : isBlack
          ? 'rgba(255, 241, 247, 0.72)'
          : 'rgba(255, 241, 247, 0.56)';
      ctx.lineWidth = isFarWing ? 0.95 : 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Forewing primary & secondary petal veins
      ctx.moveTo(2, -3);
      ctx.quadraticCurveTo(-4, -17, -11.5, -27);
      ctx.moveTo(1, -3);
      ctx.quadraticCurveTo(-10, -14, -22, -16);
      ctx.moveTo(-4, -11);
      ctx.quadraticCurveTo(-2, -21, 3, -27);
      ctx.moveTo(-9, -12);
      ctx.quadraticCurveTo(-15, -20, -19.5, -22.5);
      // Hindwing veins flowing cleanly down into swallowtail streamer
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(-10, 8, -24.5, 23.5 + tailFlex * 0.75);
      ctx.moveTo(-2, 4);
      ctx.quadraticCurveTo(-9, 12, -13, 17.5);
      ctx.stroke();

      // Luminous moonlit outer rim highlight along forewing & swallowtail edge
      ctx.strokeStyle = isGreen
        ? '#FFF1F7'
        : hexToRgba('#FFF5FA', isFarWing ? 0.52 : clamp(0.82 + hoverBoost * 0.18, 0.8, 1));
      ctx.lineWidth = isFarWing ? 1.05 : 1.45;
      ctx.beginPath();
      ctx.moveTo(4, -2);
      ctx.bezierCurveTo(18, -22, 6, -34, -7, -31);
      ctx.quadraticCurveTo(-11.5, -29.5, -13.5, -27.2);
      ctx.bezierCurveTo(-21, -28.5, -28, -20, -25.5, -11.5);
      ctx.stroke();

      // Moonlit edge on swallowtail streamer tip
      ctx.lineWidth = isFarWing ? 0.9 : 1.2;
      ctx.beginPath();
      ctx.moveTo(-22.5, 11.5);
      ctx.quadraticCurveTo(-21, 14.5, -24.5, 18.5);
      ctx.quadraticCurveTo(-28.5, 23 + tailFlex * 0.7, -27.5, 26.8 + tailFlex);
      ctx.stroke();

      // Ornate lunar margin pearls & rose-gold petal eyespots (near wing & subtle on far wing)
      if (!isFarWing) {
        const pearls = [
          { px: 4.5, py: -25.5, r: 1.5, col: blushMoon },
          { px: -3.5, py: -27.2, r: 1.7, col: goldMoon },
          { px: -17.5, py: -22.8, r: 1.55, col: blushMoon },
          { px: -21.2, py: -15.2, r: 1.35, col: goldMoon },
          { px: -16.5, py: 13.5, r: 1.75, col: goldMoon },
          { px: -11.5, py: 15.8, r: 1.35, col: blushMoon },
        ];
        for (let pi = 0; pi < pearls.length; pi++) {
          const p = pearls[pi];
          const pr = p.r + (isGreen ? 0 : hoverBoost * 0.35);
          if (!isGreen && (pi === 1 || pi === 4)) {
            const pGlow = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, pr * 2.8);
            pGlow.addColorStop(0, hexToRgba(p.col, 0.85));
            pGlow.addColorStop(1, hexToRgba(p.col, 0));
            ctx.fillStyle = pGlow;
            ctx.beginPath();
            ctx.arc(p.px, p.py, pr * 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(p.px, p.py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    // 3) Far wing pair (deeper perspective behind velvet body)
    drawPlumSwallowtailWingPair(farWingY, isGreen ? 0.94 : 0.76, true);

    // 4) Slender dark-plum velvet thorax, abdomen & curved pearl-tipped antennae
    ctx.save();
    // Curved antennae gently breathing with wingbeat
    const antFlex = Math.sin(flapPhase + 0.5) * 1.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = isGreen ? darkInk : blushMoon;
    ctx.lineWidth = isGreen ? 1.35 : 1.1;
    ctx.beginPath();
    ctx.moveTo(9.5, -1.2);
    ctx.quadraticCurveTo(14.5, -7.8 + antFlex * 0.5, 19.2, -7.2 + antFlex);
    ctx.moveTo(9.8, 0.2);
    ctx.quadraticCurveTo(15.2, -3.5 + antFlex * 0.4, 19.8, -1.6 + antFlex * 0.8);
    ctx.stroke();

    // Glowing moon-gold antenna tips
    const antTips = [
      { ax: 19.2, ay: -7.2 + antFlex },
      { ax: 19.8, ay: -1.6 + antFlex * 0.8 },
    ];
    for (const tip of antTips) {
      if (!isGreen) {
        const tg = ctx.createRadialGradient(tip.ax, tip.ay, 0, tip.ax, tip.ay, 3.6);
        tg.addColorStop(0, hexToRgba(goldMoon, 0.9));
        tg.addColorStop(1, hexToRgba(goldMoon, 0));
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(tip.ax, tip.ay, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = goldMoon;
      ctx.beginPath();
      ctx.arc(tip.ax, tip.ay, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tapered velvet abdomen & thorax
    ctx.fillStyle = darkInk;
    ctx.beginPath();
    ctx.ellipse(-3.5, 0.8, 9.2, 2.2, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5.5, -0.2, 4.4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rounded head
    ctx.beginPath();
    ctx.arc(9.8, -0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Subtle moonlit dorsal highlight along body
    ctx.strokeStyle = isGreen ? plumRose : hexToRgba(blushMoon, 0.72);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-10.5, 0.3);
    ctx.quadraticCurveTo(-1, -1.5, 9.2, -1.3);
    ctx.stroke();
    ctx.restore();

    // 5) Near wing pair in crisp foreground
    drawPlumSwallowtailWingPair(nearWingY, 1.0, false);
  } else if (creature === 'butterfly') {
    // Calm mode: ~1.4 Hz soft glide flap; standard mode unchanged
    const flapFreq = calmMode
      ? lerp(1.18, 1.52, speedNorm) * clamp(paceMul, 0.72, 1.25)
      : lerp(0.92, 1.82, speedNorm) * paceMul;
    const flap = Math.sin(t * Math.PI * 2 * flapFreq);
    const wingScaleY = calmMode
      ? 0.46 + 0.54 * Math.pow(Math.abs(flap), 0.78)
      : 0.36 + 0.64 * Math.abs(flap);

    if (!isGreen) {
      const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, 38 + hoverBoost * 10);
      aura.addColorStop(0, hexToRgba(accentColor, 0.38 + hoverBoost * 0.25));
      aura.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 38 + hoverBoost * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawButterflyWingPair = (wingElevation: number, alphaMul: number) => {
      ctx.save();
      ctx.globalAlpha *= alphaMul;
      ctx.scale(1, wingElevation);

      // Forewing & hindwing paths
      if (isGreen) {
        ctx.fillStyle = accentColor;
      } else {
        const wingGrad = ctx.createLinearGradient(-22, -28, 16, 12);
        wingGrad.addColorStop(0, '#FFFFFF');
        wingGrad.addColorStop(0.28, accentColor);
        wingGrad.addColorStop(0.72, hexToRgba(accentColor, 0.82));
        wingGrad.addColorStop(1, isBlack ? '#FDE047' : '#4C1D95');
        ctx.fillStyle = wingGrad;
      }

      // Forewing
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.bezierCurveTo(16, -28, -14, -34, -22, -14);
      ctx.bezierCurveTo(-24, -4, -10, -1, 2, -2);
      ctx.closePath();
      ctx.fill();

      // Shimmering wing scale band
      if (!isGreen) {
        const bandGrad = ctx.createRadialGradient(-8, -16, 2, -8, -16, 18);
        bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        bandGrad.addColorStop(0.6, hexToRgba('#FFF3B0', 0.25));
        bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = bandGrad;
        ctx.fill();
      }

      // Hindwing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-14, -6, -26, 8, -15, 20);
      ctx.bezierCurveTo(-6, 25, 2, 12, 0, 0);
      ctx.closePath();
      ctx.fill();

      // Clear vein hierarchy (primary + secondary veins)
      ctx.strokeStyle = isGreen
        ? '#1E1B24'
        : isBlack
        ? 'rgba(255, 255, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.62)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(1, -2);
      ctx.quadraticCurveTo(-8, -16, -18, -18);
      ctx.moveTo(-6, -12);
      ctx.lineTo(-4, -24);
      ctx.moveTo(-10, -14);
      ctx.lineTo(-14, -25);
      ctx.moveTo(-1, 1);
      ctx.quadraticCurveTo(-10, 10, -14, 17);
      ctx.stroke();

      // Soft rim light on outer wing edge
      ctx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.bezierCurveTo(16, -28, -14, -34, -22, -14);
      ctx.stroke();

      // Seeded tiny wing-edge sparkles
      const spRng = mulberry32(combineSeed(seed, 0x44b1));
      ctx.fillStyle = '#FFFFFF';
      for (let s = 0; s < 4; s++) {
        const spAngle = s * 1.4 + spRng() * 2;
        const twinkle = isGreen
          ? 1
          : 0.45 + 0.55 * Math.sin(t * 7 + spAngle);
        ctx.globalAlpha = alphaMul * twinkle;
        const sx = lerp(-19, -4, s / 3);
        const sy = lerp(-15, -24, s / 3);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    // Far wing + near wing with subtle depth offset
    drawButterflyWingPair(wingScaleY * 0.78, isGreen ? 1 : 0.72);
    const sprite = getCachedCreatureBodySprite('butterfly', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);
    drawButterflyWingPair(wingScaleY, 1);
  } else if (creature === 'bat') {
    // Calm mode: ~1.1 Hz softer glide flap; standard mode unchanged
    const flapFreq = calmMode
      ? lerp(0.92, 1.22, speedNorm) * clamp(paceMul, 0.72, 1.25)
      : lerp(0.98, 1.88, speedNorm) * paceMul;
    const flapPhase = Math.sin(t * Math.PI * 2 * flapFreq);
    const wingLift = flapPhase * (calmMode ? 8.8 : 12);
    const wingFold = lerp(calmMode ? 0.86 : 0.8, 1.0, speedNorm);

    if (!isGreen) {
      const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, 36 + hoverBoost * 10);
      aura.addColorStop(0, hexToRgba(accentColor, 0.34 + hoverBoost * 0.24));
      aura.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + hoverBoost * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawBatWing = (side: -1 | 1) => {
      ctx.save();
      ctx.scale(1, side === -1 ? 0.82 : 1);
      const tipX = -24 * wingFold;
      const tipY = (-16 + wingLift) * (side === -1 ? 0.75 : 1);
      const midX = -11 * wingFold;
      const midY = (-20 + wingLift * 0.75);

      if (isGreen) {
        ctx.fillStyle = '#2B1F42';
      } else {
        const memGrad = ctx.createLinearGradient(0, -18, -24, 14);
        memGrad.addColorStop(0, isBlack ? hexToRgba(accentColor, 0.92) : hexToRgba(accentColor, 0.72));
        memGrad.addColorStop(0.55, isBlack ? '#C4B5FD' : '#2E1F47');
        memGrad.addColorStop(1, isBlack ? '#EDE9FE' : '#140D21');
        ctx.fillStyle = memGrad;
      }

      ctx.beginPath();
      ctx.moveTo(3, -2);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.quadraticCurveTo(-20 * wingFold, 4, -15 * wingFold, 11);
      ctx.quadraticCurveTo(-9 * wingFold, 5, -7 * wingFold, 12);
      ctx.quadraticCurveTo(-3 * wingFold, 6, -2, 5);
      ctx.closePath();
      ctx.fill();

      // Finer membrane finger-bone ribs
      ctx.strokeStyle = isGreen
        ? accentColor
        : isBlack
        ? '#FFFFFF'
        : hexToRgba('#FFFFFF', 0.55);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(3, -2);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.moveTo(midX, midY * 0.65);
      ctx.lineTo(-15 * wingFold, 11);
      ctx.moveTo(midX * 0.65, midY * 0.45);
      ctx.lineTo(-7 * wingFold, 12);
      ctx.stroke();

      ctx.restore();
    };

    drawBatWing(-1);
    const sprite = getCachedCreatureBodySprite('bat', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);
    drawBatWing(1);
  } else {
    // ========================================================================
    // A) FIREFLY ("يراعة")
    // ========================================================================
    const glowIntensity = computeFireflyGlowIntensity(t, seed, hoverBoost);
    const lanternX = -15.5;
    const lanternY = 3.2;

    // 1. Wide soft lantern halo behind body (omitted in GREEN mode)
    if (!isGreen) {
      const outerHaloR = (38 + hoverBoost * 14) * (0.82 + 0.22 * glowIntensity);
      const haloGrad = ctx.createRadialGradient(
        lanternX,
        lanternY,
        1.5,
        lanternX,
        lanternY,
        outerHaloR
      );
      haloGrad.addColorStop(0, '#FFFFFF');
      haloGrad.addColorStop(0.22, hexToRgba('#FFF3B0', 0.92));
      haloGrad.addColorStop(0.5, hexToRgba(accentColor, 0.58 * glowIntensity));
      haloGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, outerHaloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Six thin legs tucked underneath and moving softly
    ctx.save();
    const legTremble = Math.sin(t * 7.5 * paceMul) * 0.55;
    ctx.strokeStyle = isBlack ? '#F3E5AB' : isGreen ? '#3B2416' : '#4A2F1D';
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const legAnchors = [
      { ax: 8, ay: 3, kx: 10, ky: 8, fx: 12.5, fy: 11.5 },
      { ax: 4, ay: 3.5, kx: 3.5, ky: 9, fx: 5.5, fy: 12.5 },
      { ax: 0, ay: 4, kx: -2.5, ky: 9.2, fx: -4.5, fy: 12.8 },
      { ax: 7, ay: 2.5, kx: 8.5, ky: 7.2, fx: 10.5, fy: 10.2 },
      { ax: 3, ay: 3, kx: 2, ky: 7.8, fx: 3.2, fy: 11 },
      { ax: -1, ay: 3.4, kx: -3.8, ky: 8, fx: -5.8, fy: 11.2 },
    ];
    for (let l = 0; l < legAnchors.length; l++) {
      const leg = legAnchors[l];
      const d = (l % 2 === 0 ? 1 : -1) * legTremble;
      ctx.beginPath();
      ctx.moveTo(leg.ax, leg.ay);
      ctx.lineTo(leg.kx + d * 0.5, leg.ky);
      ctx.lineTo(leg.fx + d, leg.fy);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Static cached Firefly body (head, antennae, eye, pronotum, abdomen)
    const sprite = getCachedCreatureBodySprite('firefly', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);

    // 4. Lantern glowing abdomen tip (foreground core + amber body)
    if (isGreen) {
      // GREEN mode: flat hard-edged fills; solid amber disc with lighter inner disc (no halo)
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, 7.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF9DB';
      ctx.beginPath();
      ctx.arc(lanternX - 0.8, lanternY - 0.6, 3.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const coreR = 9.2 * (0.88 + 0.14 * glowIntensity);
      const lanternGrad = ctx.createRadialGradient(
        lanternX - 1,
        lanternY - 1,
        0.8,
        lanternX,
        lanternY,
        coreR
      );
      lanternGrad.addColorStop(0, '#FFFFFF');
      lanternGrad.addColorStop(0.42, '#FFF5B8');
      lanternGrad.addColorStop(0.78, accentColor);
      lanternGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, coreR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Delicate transparent hind wings with calm, gentle flap rhythm (~2.0 Hz in calm mode)
    const flapAngleBase = calmMode
      ? Math.sin(t * Math.PI * 2 * lerp(1.85, 2.12, speedNorm) * clamp(paceMul, 0.72, 1.25)) *
        lerp(0.14, 0.24, speedNorm)
      : speedNorm > 0.08
        ? Math.sin(t * Math.PI * 2 * 1.65 * paceMul) * 0.34
        : Math.sin(t * Math.PI * 2 * 0.75 * paceMul) * 0.06;

    const drawHindWingPose = (angleOffset: number, poseAlpha: number) => {
      ctx.save();
      ctx.translate(4, -2);
      ctx.rotate(-0.48 + flapAngleBase + angleOffset);

      if (isGreen) {
        ctx.fillStyle = '#E6F4F1';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.2;
      } else {
        ctx.globalAlpha *= poseAlpha;
        // Faint iridescent sheen gradient
        const wingGrad = ctx.createLinearGradient(0, 0, -24, -14);
        wingGrad.addColorStop(0, isBlack ? 'rgba(255, 255, 255, 0.55)' : 'rgba(224, 242, 254, 0.42)');
        wingGrad.addColorStop(0.55, hexToRgba(accentColor, isBlack ? 0.38 : 0.26));
        wingGrad.addColorStop(1, isBlack ? 'rgba(186, 230, 253, 0.48)' : 'rgba(167, 243, 208, 0.22)');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = isBlack
          ? 'rgba(255, 255, 255, 0.88)'
          : 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.1;
      }

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-6, -15, -22, -19, -26, -9);
      ctx.bezierCurveTo(-28, -2, -14, 4, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Fine vein lines inside hind wing
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.quadraticCurveTo(-12, -9, -23, -9);
      ctx.moveTo(-9, -6);
      ctx.lineTo(-16, -14);
      ctx.moveTo(-13, -7);
      ctx.lineTo(-19, -4);
      ctx.stroke();

      ctx.restore();
    };

    if (isGreen) {
      drawHindWingPose(0, 1);
    } else if (speedNorm > 0.12) {
      // Alpha-blended doubled wing poses for soft 3 Hz motion blur while flying
      drawHindWingPose(-0.22, 0.46);
      drawHindWingPose(0.18, 0.68);
    } else {
      // Micro-hover while stopped
      drawHindWingPose(0, 0.78);
      drawHindWingPose(0.06, 0.34);
    }

    // 6. Two translucent hard wing covers (elytra) held slightly open above hind wings
    const drawElytron = (openAngle: number, alpha: number) => {
      ctx.save();
      ctx.translate(5, -2.5);
      ctx.rotate(openAngle);
      if (!isGreen) {
        ctx.globalAlpha *= alpha;
      }
      if (isGreen) {
        ctx.fillStyle = '#523422';
        ctx.strokeStyle = '#F2A65A';
      } else if (isBlack) {
        const elGrad = ctx.createLinearGradient(0, -4, -20, 2);
        elGrad.addColorStop(0, 'rgba(245, 230, 196, 0.92)');
        elGrad.addColorStop(1, 'rgba(212, 180, 125, 0.78)');
        ctx.fillStyle = elGrad;
        ctx.strokeStyle = '#FFFFFF';
      } else {
        const elGrad = ctx.createLinearGradient(0, -4, -20, 2);
        elGrad.addColorStop(0, 'rgba(92, 58, 36, 0.88)');
        elGrad.addColorStop(1, 'rgba(46, 28, 18, 0.76)');
        ctx.fillStyle = elGrad;
        ctx.strokeStyle = 'rgba(242, 166, 90, 0.75)';
      }
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-5, -9, -18, -10, -21, -3);
      ctx.bezierCurveTo(-22, 2, -9, 3, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const elytraLift = -0.34 - 0.08 * speedNorm;
    drawElytron(elytraLift - 0.14, 0.72);
    drawElytron(elytraLift, 0.94);
  }

  ctx.restore();
}

/**
 * Renders a live preview thumbnail for the 4-creature selector in the studio sidebar.
 */
export function drawCreaturePreviewThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  t: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const paceMul = clamp(flightSpeed / 0.55, 0.45, 1.65);

  // Preview card background matching the creature & selected theme ('dark' or 'light')
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (theme === 'light') {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(
      0.55,
      creature === 'butterfly' || creature === 'orb' ? '#FFFBFD' : '#F8FAFC'
    );
    grad.addColorStop(
      1,
      creature === 'firefly'
        ? '#F0FDF4'
        : creature === 'bat'
          ? '#EEF2FF'
          : creature === 'butterfly'
            ? '#FDF2F8'
            : '#FCE7F3'
    );
  } else if (creature === 'firefly') {
    grad.addColorStop(0, '#04110F');
    grad.addColorStop(1, '#0A1F1C');
  } else if (creature === 'bat') {
    grad.addColorStop(0, '#060513');
    grad.addColorStop(1, '#1A1438');
  } else if (creature === 'butterfly') {
    grad.addColorStop(0, '#080A1A');
    grad.addColorStop(1, '#191B3A');
  } else {
    // Deep indigo-to-plum night sky for Night Plum Petals
    grad.addColorStop(0, '#07091E');
    grad.addColorStop(0.55, '#151138');
    grad.addColorStop(1, '#29164A');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (theme === 'light') {
    const halo = ctx.createRadialGradient(width * 0.56, height * 0.5, 2, width * 0.56, height * 0.5, width * 0.48);
    halo.addColorStop(0, hexToRgba(accentColor, 0.22));
    halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
  }

  if (creature === 'bat') {
    const thumbMoonX = width * 0.2;
    const thumbMoonY = height * 0.26;
    const thumbMoonR = Math.min(width, height) * 0.13;
    drawPolishedCrescentMoon(ctx, thumbMoonX, thumbMoonY, thumbMoonR, accentColor, theme);
    drawMoonSoftGlow(ctx, thumbMoonX, thumbMoonY, thumbMoonR, accentColor, theme, t, paceMul * 0.72);
  } else if (creature === 'orb' && theme !== 'light') {
    const thumbMoonX = width * 0.18;
    const thumbMoonY = height * 0.24;
    const thumbMoonR = Math.min(width, height) * 0.11;
    drawMoonSoftGlow(ctx, thumbMoonX, thumbMoonY, thumbMoonR, accentColor, 'dark', t, paceMul * 0.7);
    ctx.fillStyle = '#F8ECFF';
    ctx.beginPath();
    ctx.arc(thumbMoonX, thumbMoonY, thumbMoonR * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gentle floating wave inside thumbnail card reflecting flightSpeed
  const cx = width * (creature === 'orb' ? 0.58 : 0.56) + Math.sin(t * 0.72 * paceMul) * 4.0;
  const cy = height * 0.52 + Math.cos(t * 0.54 * paceMul) * 2.8;
  const blushThumb = mixHex(accentColor, '#FCE7F3', 0.55);
  for (let i = 7; i >= 1; i--) {
    const tx = cx - (creature === 'orb' ? 14 + i * 6.0 : i * 6.8);
    const driftY =
      creature === 'orb'
        ? Math.sin(t * 1.45 * paceMul - i * 0.65) * 3.0 - i * 0.35
        : Math.sin(t * 1.6 * paceMul - i * 0.55) * 2.2;
    const ty = cy + driftY;
    const r = Math.max(1.1, (8 - i) * 0.6);
    if (creature === 'orb') {
      drawMiniPlumPetal(
        ctx,
        tx,
        ty,
        Math.max(1.3, r * 0.92),
        t * 0.8 * paceMul + i * 0.75,
        i % 2 === 0 ? accentColor : blushThumb,
        '#FFF1F7',
        false,
        clamp((8 - i) * 0.12, 0.12, 0.88),
        r * 1.9
      );
    } else {
      ctx.fillStyle = hexToRgba(accentColor, (8 - i) * 0.1);
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFlyerCreature({
    ctx,
    creature,
    x: cx,
    y: cy,
    vx: 65 * paceMul,
    vy: -Math.sin(t * 0.54 * paceMul) * 14,
    speedNorm: 0.45,
    hoverBoost: 0.25,
    t,
    scale: Math.min(width, height) / (creature === 'orb' ? 72 : 74),
    accentColor,
    bgMode: 'style',
    seed: 101,
    theme,
    flightSpeed,
  });

  ctx.restore();
}

// ============================================================================
// SHARED DETERMINISTIC FLIGHT PATH & TRAIL SAMPLER
// ============================================================================

export interface BezierPoint {
  x: number;
  y: number;
}

export interface CubicBezierCurve {
  p0: BezierPoint;
  c1: BezierPoint;
  c2: BezierPoint;
  p3: BezierPoint;
}

/**
 * Pure deterministic Cubic Bézier evaluator returning both position B(u) and derivative B'(u):
 * B(u)  = (1-u)^3 P0 + 3(1-u)^2 u C1 + 3(1-u) u^2 C2 + u^3 P3
 * B'(u) = 3(1-u)^2 (C1 - P0) + 6(1-u) u (C2 - C1) + 3 u^2 (P3 - C2)
 */
export function evaluateCubicBezier(
  p0: BezierPoint,
  c1: BezierPoint,
  c2: BezierPoint,
  p3: BezierPoint,
  rawU: number
): { x: number; y: number; dx: number; dy: number } {
  const u = clamp(rawU, 0, 1);
  const inv = 1 - u;
  const inv2 = inv * inv;
  const inv3 = inv2 * inv;
  const u2 = u * u;
  const u3 = u2 * u;

  const x = inv3 * p0.x + 3 * inv2 * u * c1.x + 3 * inv * u2 * c2.x + u3 * p3.x;
  const y = inv3 * p0.y + 3 * inv2 * u * c1.y + 3 * inv * u2 * c2.y + u3 * p3.y;

  const dx =
    3 * inv2 * (c1.x - p0.x) +
    6 * inv * u * (c2.x - c1.x) +
    3 * u2 * (p3.x - c2.x);
  const dy =
    3 * inv2 * (c1.y - p0.y) +
    6 * inv * u * (c2.y - c1.y) +
    3 * u2 * (p3.y - c2.y);

  return { x, y, dx, dy };
}

/**
 * Measures the approximate arc length of a Cubic Bézier curve across `segments` uniform chords.
 */
export function measureCubicBezierLength(
  p0: BezierPoint,
  c1: BezierPoint,
  c2: BezierPoint,
  p3: BezierPoint,
  segments = 12
): number {
  const n = Math.max(2, Math.round(segments));
  let total = 0;
  let prev = p0;
  for (let i = 1; i <= n; i++) {
    const pt = evaluateCubicBezier(p0, c1, c2, p3, i / n);
    total += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return total;
}

/**
 * Converts endpoint positions and C1 velocity tangents over `segDur` seconds into an exact
 * Cubic Bézier segment: C1 = P0 + (segDur/3)*v0, C2 = P3 - (segDur/3)*v3.
 */
export function computeCubicBezierSegmentFromTangents(
  p0: BezierPoint,
  v0: { vx: number; vy: number },
  p3: BezierPoint,
  v3: { vx: number; vy: number },
  segDur: number
): CubicBezierCurve {
  const k = segDur / 3;
  return {
    p0: { x: p0.x, y: p0.y },
    c1: { x: p0.x + v0.vx * k, y: p0.y + v0.vy * k },
    c2: { x: p3.x - v3.vx * k, y: p3.y - v3.vy * k },
    p3: { x: p3.x, y: p3.y },
  };
}

export interface FlightWaypoint {
  t: number;
  x: number;
  y: number;
  isHover?: boolean;
  keywordGlow?: number;
  /** Optional explicit outgoing Cubic Bézier control handle toward the next waypoint */
  cpOut?: BezierPoint;
  /** Optional explicit incoming Cubic Bézier control handle from the previous waypoint */
  cpIn?: BezierPoint;
}

export interface SampledFlightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speedNorm: number;
  hoverBoost: number;
  visibleAlpha: number;
}

function computeSplineKnotTangent(
  waypoints: FlightWaypoint[],
  k: number
): { vx: number; vy: number } {
  const n = waypoints.length;
  if (n <= 1) return { vx: 0, vy: 0 };

  const cur = waypoints[k];
  const prev = k > 0 ? waypoints[k - 1] : null;
  const next = k < n - 1 ? waypoints[k + 1] : null;

  const hoverPrev = Boolean(
    prev && cur.isHover && prev.isHover && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 14
  );
  const hoverNext = Boolean(
    next && cur.isHover && next.isHover && Math.hypot(next.x - cur.x, next.y - cur.y) < 14
  );
  if (hoverPrev || hoverNext) {
    return { vx: 0, vy: 0 };
  }

  if (!prev && next) {
    const dt = Math.max(0.02, next.t - cur.t);
    return {
      vx: ((next.x - cur.x) / dt) * 0.85,
      vy: ((next.y - cur.y) / dt) * 0.85,
    };
  }
  if (prev && !next) {
    const dt = Math.max(0.02, cur.t - prev.t);
    return {
      vx: ((cur.x - prev.x) / dt) * 0.85,
      vy: ((cur.y - prev.y) / dt) * 0.85,
    };
  }
  if (!prev || !next) return { vx: 0, vy: 0 };

  const dtPrev = Math.max(0.02, cur.t - prev.t);
  const dtNext = Math.max(0.02, next.t - cur.t);
  const dxPrev = cur.x - prev.x;
  const dyPrev = cur.y - prev.y;
  const dxNext = next.x - cur.x;
  const dyNext = next.y - cur.y;

  // Time-weighted Bessel tangent guarantees exact C1 velocity continuity across unequal segments
  const vPrevX = dxPrev / dtPrev;
  const vPrevY = dyPrev / dtPrev;
  const vNextX = dxNext / dtNext;
  const vNextY = dyNext / dtNext;
  const wPrev = dtNext / (dtPrev + dtNext);
  const wNext = dtPrev / (dtPrev + dtNext);

  let vx = vPrevX * wPrev + vNextX * wNext;
  let vy = vPrevY * wPrev + vNextY * wNext;

  // Centripetal-inspired speed cap prevents loops or overshoot when segment distances differ sharply
  const spPrev = Math.hypot(dxPrev, dyPrev) / dtPrev;
  const spNext = Math.hypot(dxNext, dyNext) / dtNext;
  const sp = Math.hypot(vx, vy);
  if (sp > 1e-4 && spPrev > 2 && spNext > 2) {
    const maxSafe = Math.max(8, Math.min(spPrev, spNext) * 1.38);
    if (sp > maxSafe) {
      const s = maxSafe / sp;
      vx *= s;
      vy *= s;
    }
  }

  return { vx, vy };
}

export function sampleFlightWaypoints(
  waypoints: FlightWaypoint[],
  t: number,
  exitStart: number,
  totalDuration: number
): SampledFlightState {
  if (waypoints.length === 0) {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speedNorm: 0,
      hoverBoost: 0,
      visibleAlpha: 0,
    };
  }

  if (t <= waypoints[0].t) {
    const p0 = waypoints[0];
    const t0 = computeSplineKnotTangent(waypoints, 0);
    return {
      x: p0.x,
      y: p0.y,
      vx: t0.vx,
      vy: t0.vy,
      speedNorm: 0.28,
      hoverBoost: 0,
      visibleAlpha: clamp(t / Math.max(0.08, p0.t + 0.18), 0, 1),
    };
  }

  const last = waypoints[waypoints.length - 1];
  if (t >= last.t) {
    const tLast = computeSplineKnotTangent(waypoints, waypoints.length - 1);
    const exitP = progress(t, exitStart, totalDuration);
    return {
      x: last.x,
      y: last.y - exitP * 14,
      vx: tLast.vx * 0.5,
      vy: -12,
      speedNorm: 0.14,
      hoverBoost: 0,
      visibleAlpha: 1 - easeInCubic(exitP),
    };
  }

  // Binary search for active segment
  let lo = 0;
  let hi = waypoints.length - 2;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < waypoints[mid].t) {
      hi = mid - 1;
    } else if (t > waypoints[mid + 1].t) {
      lo = mid + 1;
    } else {
      idx = mid;
      break;
    }
  }

  const w1 = waypoints[idx];
  const w2 = waypoints[idx + 1];
  const segDur = Math.max(0.001, w2.t - w1.t);
  const rawU = clamp((t - w1.t) / segDur, 0, 1);

  const dx = w2.x - w1.x;
  const dy = w2.y - w1.y;
  const dist = Math.hypot(dx, dy);
  const isHoverSeg = Boolean(w1.isHover && w2.isHover && dist < 14);

  let x: number;
  let y: number;
  let vx: number;
  let vy: number;

  if (isHoverSeg) {
    // Smooth Cubic Bézier settling arc for close-range hover waypoints (zero sharp linear stops)
    const perpOffset = dist > 1 ? Math.min(4.5, dist * 0.35) : 0;
    const safeD = Math.max(1, dist);
    const nx = -dy / safeD;
    const ny = dx / safeD;
    const c1 = {
      x: w1.x + dx * 0.25 + nx * perpOffset,
      y: w1.y + dy * 0.25 + ny * perpOffset,
    };
    const c2 = {
      x: w2.x - dx * 0.25 + nx * perpOffset,
      y: w2.y - dy * 0.25 + ny * perpOffset,
    };
    const bez = evaluateCubicBezier(w1, c1, c2, w2, easeInOutCubic(rawU));
    x = bez.x;
    y = bez.y;
    vx = dx / segDur;
    vy = dy / segDur;
  } else {
    // Explicit C1-continuous Cubic Bézier segment between waypoints (eliminates straight lines & velocity snaps)
    const tan1 = computeSplineKnotTangent(waypoints, idx);
    const tan2 = computeSplineKnotTangent(waypoints, idx + 1);
    const derived = computeCubicBezierSegmentFromTangents(w1, tan1, w2, tan2, segDur);
    const c1 = w1.cpOut ?? derived.c1;
    const c2 = w2.cpIn ?? derived.c2;
    const bez = evaluateCubicBezier(w1, c1, c2, w2, rawU);
    x = bez.x;
    y = bez.y;
    vx = bez.dx / segDur;
    vy = bez.dy / segDur;
  }

  const speed = Math.hypot(vx, vy);
  const speedNorm = isHoverSeg ? 0.05 : clamp(speed / 360, 0.1, 0.72);
  const g1 = w1.keywordGlow ?? (w1.isHover ? 0.65 : 0);
  const g2 = w2.keywordGlow ?? (w2.isHover ? 0.65 : 0);
  const hoverBoost = isHoverSeg
    ? Math.sin(rawU * Math.PI)
    : clamp(lerp(g1, g2, easeInOutCubic(rawU)), 0, 1);

  const exitP = progress(t, exitStart, totalDuration);
  const visibleAlpha = 1 - easeInCubic(exitP);

  return {
    x,
    y,
    vx,
    vy,
    speedNorm,
    hoverBoost,
    visibleAlpha,
  };
}

/**
 * Draws the deterministic path-sampled trail behind the creature at time `t`.
 * - For Orb: drifting airborne white feathery nectar particles rising gently with soft glow.
 * - For Firefly: a fading dotted line of light sampled from the path, each dot blinking
 *   softly at a seeded phase, tapering and cooling from amber to a faint warm tone.
 * - In GREEN mode: solid small discs shrinking with age, zero blur/halo.
 */
export function drawFlyerTrail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  waypoints: FlightWaypoint[],
  t: number,
  exitStart: number,
  totalDuration: number,
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  scale: number,
  seed: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  const isGreen = bgMode === 'green';
  const isLight = bgMode === 'style' && theme === 'light';
  const paceMul = clamp(flightSpeed / 0.55, 0.45, 1.65);
  const dotCount = creature === 'orb' || creature === 'firefly' ? 20 : 16;
  const maxAge = clamp(1.15 / clamp(paceMul, 0.55, 1.45), 0.85, 1.75);
  const rng = mulberry32(combineSeed(seed, 0x8821c));

  ctx.save();
  for (let i = dotCount; i >= 1; i--) {
    const frac = i / dotCount; // 1 = oldest, 0 = newest
    const sampleT = t - frac * maxAge;
    if (sampleT < 0.02) continue;

    const st = sampleFlightWaypoints(waypoints, sampleT, exitStart, totalDuration);
    if (st.visibleAlpha <= 0.02) continue;

    const phase = rng() * Math.PI * 2 + i * 1.07;
    const blink = isGreen
      ? 1
      : 0.62 + 0.38 * Math.sin(t * Math.PI * 2 * 1.15 * paceMul + phase);

    const taper = Math.pow(1 - frac, 1.12);
    const radius = Math.max(
      1.1,
      (creature === 'orb' ? 4.4 : creature === 'firefly' ? 4.8 : 5.2) * taper * scale
    );

    if (isGreen) {
      // GREEN mode: solid crisp trailing mini plum petals for 'orb', solid discs for others
      if (creature === 'orb') {
        const driftX = Math.cos(t * 0.95 * paceMul + phase) * 5.2 * frac * scale;
        const driftY = -frac * 8 * scale + Math.sin(t * 1.15 * paceMul + phase) * 4.2 * frac * scale;
        const pRot = phase + t * 0.75 * paceMul * (i % 2 === 0 ? 1 : -1);
        drawMiniPlumPetal(
          ctx,
          st.x + driftX,
          st.y + driftY,
          Math.max(1.8, radius * 0.95),
          pRot,
          i % 3 === 0 ? '#FCE7F3' : accentColor,
          '#FFF1F7',
          true,
          1
        );
      } else {
        ctx.fillStyle = i % 3 === 0 ? '#FFF8D6' : accentColor;
        ctx.beginPath();
        ctx.arc(st.x, st.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (creature === 'orb') {
      // Delicate tumbling miniature plum-blossom petals trailing softly along the flight path
      const crimsonTone = mixHex(accentColor, '#BE185D', 0.42);
      const blushTone = mixHex(accentColor, '#FCE7F3', 0.56);
      const driftX = Math.cos(t * 0.92 * paceMul + phase * 1.2) * 8.2 * frac * scale;
      const driftY = -frac * 12 * scale + Math.sin(t * 1.18 * paceMul + phase) * 6.0 * frac * scale;
      const px = st.x + driftX;
      const py = st.y + driftY;
      const alpha = clamp(taper * blink * st.visibleAlpha * (isLight ? 0.9 : 0.86), 0, 1);
      const pRot = phase + Math.sin(t * 1.1 * paceMul + phase) * 0.95 + frac * 1.4;
      const pCol = i % 3 === 0 ? crimsonTone : i % 3 === 1 ? accentColor : blushTone;

      drawMiniPlumPetal(
        ctx,
        px,
        py,
        Math.max(1.5, radius * 0.92),
        pRot,
        pCol,
        blushTone,
        false,
        alpha,
        radius * (isLight ? 2.1 : 2.5)
      );

      // Secondary offset moonlit shimmer speck for airy drifting plum-blossom depth
      if (i % 2 === 0 && frac > 0.15) {
        const subX = st.x - driftX * 0.72 + Math.sin(phase * 2.1) * 5 * scale;
        const subY = st.y + driftY * 0.65 - 3.5 * frac * scale;
        const subR = Math.max(1.0, radius * (isLight ? 1.65 : 1.45));
        const subGrad = ctx.createRadialGradient(subX, subY, 0, subX, subY, subR);
        subGrad.addColorStop(0, hexToRgba('#FFF1F7', alpha * 0.85));
        subGrad.addColorStop(0.55, hexToRgba(accentColor, alpha * (isLight ? 0.48 : 0.42)));
        subGrad.addColorStop(1, hexToRgba(accentColor, 0));
        ctx.fillStyle = subGrad;
        ctx.beginPath();
        ctx.arc(subX, subY, subR, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (creature === 'firefly') {
      // Tapering and cooling from bright amber to a faint warm tone
      const coolColor = frac < 0.45 ? accentColor : frac < 0.75 ? '#F59E0B' : '#FDE68A';
      const alpha = clamp(taper * blink * st.visibleAlpha * 0.82, 0, 1);

      const dotGrad = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, radius * 2.1);
      dotGrad.addColorStop(0, hexToRgba('#FFFFFF', alpha));
      dotGrad.addColorStop(0.45, hexToRgba(coolColor, alpha * 0.85));
      dotGrad.addColorStop(1, hexToRgba(coolColor, 0));
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(st.x, st.y, radius * 2.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const alpha = clamp(taper * blink * st.visibleAlpha * 0.72, 0, 1);
      const dotGrad = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, radius * 2.0);
      dotGrad.addColorStop(0, hexToRgba('#FFFFFF', alpha * 0.9));
      dotGrad.addColorStop(0.5, hexToRgba(accentColor, alpha * 0.75));
      dotGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(st.x, st.y, radius * 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// CALM CREATURE FLIGHT ENGINE (br_flyer & pts_flyer horizontal-cards ONLY)
// Pure deterministic function of t:
// - Decoupled from text reveal (schedule drives feathered RTL text clip)
// - Low-frequency Lissajous drift near current node/card (amp ~ 0.4 * nodeH)
// - Schedule-driven Catmull-Rom hops: departs slightly before next node/card and
//   arrives right as its text starts revealing; hop duration = clamp(dist/320, 1.0, 2.0)s
//   scaled by "الهدوء" and fitted inside the gap so it never lags behind
// - Smooth max-acceleration limit (no jerks or sudden stops)
// - Gentle ~0.8 s keyword circle without abrupt stop
// - Never covers unrevealed text; shorter & fainter trail (N <= 24)
// ============================================================================

export interface CalmFlightKeywordTarget {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  startTime: number;
  duration: number;
}

export interface CalmFlightStop {
  id: string;
  activeStart: number;
  activeEnd: number;
  anchor: { x: number; y: number };
  nodeBox: { x: number; y: number; w: number; h: number };
  textBox: { x: number; y: number; w: number; h: number };
  textRevealStart?: number;
  textRevealEnd: number;
  hopControlPoint?: { x: number; y: number };
  keywords?: CalmFlightKeywordTarget[];
}

export interface CalmFlightSample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hoverBoost: number;
}

export interface CalmFlightHopMeta {
  fromIdx: number;
  toIdx: number;
  startT: number;
  endT: number;
  hopDuration: number;
  bezier: CubicBezierCurve;
}

export interface CalmFlightPlan {
  dt: number;
  totalDuration: number;
  exitStart: number;
  calmSpeed: number;
  maxSpeedPxPerSec: number;
  maxAccelPxPerSec2: number;
  samples: CalmFlightSample[];
  stops: CalmFlightStop[];
  hops: CalmFlightHopMeta[];
  trailDotCount: number;
}

function clampVecMagnitude(vx: number, vy: number, maxMag: number): { x: number; y: number } {
  const mag = Math.hypot(vx, vy);
  if (mag <= maxMag || mag < 1e-6) return { x: vx, y: vy };
  const s = maxMag / mag;
  return { x: vx * s, y: vy * s };
}

function pushOutsideRect(
  px: number,
  py: number,
  rect: { x: number; y: number; w: number; h: number },
  pad: number,
  W: number,
  H: number
): { x: number; y: number; pushed: boolean } {
  const left = rect.x - pad;
  const right = rect.x + rect.w + pad;
  const top = rect.y - pad;
  const bottom = rect.y + rect.h + pad;
  if (px <= left || px >= right || py <= top || py >= bottom) {
    return { x: px, y: py, pushed: false };
  }
  const dTop = py - top;
  const dBottom = bottom - py;
  const dRight = right - px;
  const dLeft = px - left;

  // Prefer moving above the text box (hovering softly above), unless too close to top frame edge
  if (top >= 34 && dTop <= dBottom * 1.45) {
    return { x: px, y: top, pushed: true };
  }
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  if (minD === dTop && top >= 30) return { x: px, y: top, pushed: true };
  if (minD === dBottom && bottom <= H - 30) return { x: px, y: bottom, pushed: true };
  if (minD === dRight && right <= W - 30) return { x: right, y: py, pushed: true };
  if (left >= 30) return { x: left, y: py, pushed: true };
  return { x: px, y: clamp(top, 30, H - 30), pushed: true };
}

/**
 * Computes a calm hover anchor just above (or beside/below if near frame edge) a node/card,
 * staying within ~1 card/node size and clear of unrevealed text.
 */
export function computeCalmStopAnchor(
  nodeBox: { x: number; y: number; w: number; h: number },
  textBox: { x: number; y: number; w: number; h: number },
  W: number,
  H: number
): { x: number; y: number } {
  const safeMarginX = 48;
  const safeMarginY = 44;
  const ampY = clamp(nodeBox.h * 0.36, 10, 32);
  const clearance = Math.max(18, Math.min(30, nodeBox.h * 0.24));
  const aboveY = Math.min(nodeBox.y, textBox.y) - clearance - ampY * 0.55;
  const belowY = Math.max(nodeBox.y + nodeBox.h, textBox.y + textBox.h) + clearance + ampY * 0.55;

  const cx = clamp(nodeBox.x + nodeBox.w * 0.52, safeMarginX, W - safeMarginX);
  if (aboveY - ampY * 0.6 >= safeMarginY) {
    return { x: cx, y: aboveY };
  }
  if (belowY + ampY * 0.6 <= H - safeMarginY) {
    return { x: cx, y: belowY };
  }
  // Fallback: hover beside the right edge (RTL reading side)
  const rightX = nodeBox.x + nodeBox.w + clearance + 16;
  if (rightX <= W - safeMarginX) {
    return { x: rightX, y: clamp(nodeBox.y + nodeBox.h * 0.35, safeMarginY, H - safeMarginY) };
  }
  return {
    x: clamp(nodeBox.x - clearance - 16, safeMarginX, W - safeMarginX),
    y: clamp(nodeBox.y + nodeBox.h * 0.35, safeMarginY, H - safeMarginY),
  };
}

/**
 * Builds a deterministic kinematic CalmFlightPlan sampled at 30 Hz.
 * Pure deterministic function of inputs (zero mutable cross-frame state).
 * Creature departs slightly before the next branch/card begins appearing and arrives
 * near it right as its text starts revealing (schedule-driven hop, smooth acceleration limit).
 */
export function buildCalmFlightPlan(params: {
  stops: CalmFlightStop[];
  calmSpeed: number;
  totalDuration: number;
  exitStart: number;
  W: number;
  H: number;
  seed: number;
}): CalmFlightPlan {
  const { stops, calmSpeed, totalDuration, exitStart, W, H, seed } = params;
  const clampedCalm = clamp(calmSpeed, 0.4, 1.4);
  const refScale = Math.max(0.5, Math.min(W, H) / 1080);
  const refCruiseSpeed = 155 * refScale; // Poetic ultra-calm 155 px/s reference at 1080p
  const calmRatio = clampedCalm / DEFAULT_CALM_FLYER_SPEED; // 1.0 at default 0.60
  const speedScale = clamp(Math.pow(calmRatio, 0.78), 0.58, 1.85);
  const baseMaxSpeed = refCruiseSpeed * speedScale * 1.32; // ~205 px/s at default 0.60
  const hardHopCeiling = 680 * refScale * speedScale; // Strict poetic ceiling even on wide cross-row / cross-tree hops
  const baseMaxAccel = 210 * refScale * speedScale;
  const dt = 1 / 30;
  const stepCount = Math.max(2, Math.ceil(Math.max(0.5, totalDuration) / dt) + 1);

  if (stops.length === 0) {
    const samples: CalmFlightSample[] = [];
    for (let k = 0; k < stepCount; k++) {
      samples.push({ t: k * dt, x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, hoverBoost: 0.25 });
    }
    return {
      dt,
      totalDuration,
      exitStart,
      calmSpeed: clampedCalm,
      maxSpeedPxPerSec: baseMaxSpeed,
      maxAccelPxPerSec2: baseMaxAccel,
      samples,
      stops,
      hops: [],
      trailDotCount: 16,
    };
  }

  // Helper: evaluate slow deterministic poetic Lissajous drift around a given stop
  const evalStopDrift = (stopIdx: number, t: number): { x: number; y: number; boost: number } => {
    const s = stops[stopIdx];
    const ampX = clamp(s.nodeBox.w * 0.18, 12, 44);
    const ampY = clamp(s.nodeBox.h * 0.34, 9, 26); // Gentle soft vertical breathing
    const driftRate = clamp(calmRatio, 0.55, 1.85);
    const wX = 0.34 * driftRate;
    const wY = 0.68 * driftRate;
    const phase = (seed % 199) * 0.041 + stopIdx * 1.618;

    let x = s.anchor.x + Math.sin(t * wX + phase) * ampX;
    let y = s.anchor.y + Math.sin(t * wY + phase * 1.31) * ampY;
    let boost = 0.38;

    // Gentle ~0.85 s slow circle around keyword (no abrupt stop, smooth sine bell blend)
    if (s.keywords && s.keywords.length > 0) {
      for (let ki = 0; ki < s.keywords.length; ki++) {
        const kw = s.keywords[ki];
        const dur = Math.max(0.8, kw.duration || 0.85);
        if (t >= kw.startTime && t <= kw.startTime + dur) {
          const u = (t - kw.startTime) / dur;
          const blend = Math.sin(u * Math.PI); // 0 -> 1 -> 0 smooth C1 envelope
          const ang = -Math.PI * 0.5 + easeInOutSine(u) * Math.PI * 2;
          const kwX = kw.cx + Math.cos(ang) * kw.rx;
          const kwY = kw.cy + Math.sin(ang) * kw.ry;
          x = lerp(x, kwX, blend * 0.78);
          y = lerp(y, kwY, blend * 0.78);
          boost = Math.max(boost, 0.45 + 0.5 * blend);
        }
      }
    }

    return {
      x: clamp(x, 42, W - 42),
      y: clamp(y, 38, H - 38),
      boost,
    };
  };

  // Precompute schedule-driven organic Cubic Bézier hop curves with EARLY, SEAMLESS DEPARTURE:
  // Every card-to-card and node-to-node transition uses two sculpted Bézier control points (ctrl1, ctrl2)
  // to form sweeping, natural butterfly/creature arcs and flowing S-curves instead of straight lines.
  interface HopSpec {
    fromIdx: number;
    toIdx: number;
    startT: number;
    endT: number;
    hopDuration: number;
    arcDist: number;
    ctrl1: { x: number; y: number };
    ctrl2: { x: number; y: number };
    perpNx: number;
    perpNy: number;
    weavePhase: number;
  }
  const hops: HopSpec[] = [];
  let prevHopEnd = 0.04;

  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const curr = stops[i];
    const chordDx = curr.anchor.x - prev.anchor.x;
    const chordDy = curr.anchor.y - prev.anchor.y;
    const dist = Math.hypot(chordDx, chordDy);
    const safeDist = Math.max(1, dist);
    // Unit perpendicular normal oriented generally upward for natural buoyant butterfly lift
    let perpNx = -chordDy / safeDist;
    let perpNy = chordDx / safeDist;
    if (perpNy > 0) {
      perpNx = -perpNx;
      perpNy = -perpNy;
    }

    // Poetic target hop duration: slow 1.45–2.8s glide scaled by "الهدوء"
    const baseHopDur = clamp(dist / Math.max(55, refCruiseSpeed), 1.45, 2.8);
    const scaledHopDur = clamp(baseHopDur / clamp(speedScale, 0.58, 1.75), 1.05, 3.2);

    // Depart early while the previous card/node is still revealing so the hop uses almost
    // the entire interval between stops rather than rushing after prev.textRevealEnd.
    const arriveT = curr.textRevealStart ?? curr.activeStart;
    const spanToNext = Math.max(0.24, arriveT - prevHopEnd);
    const isLongJump = dist > 620 * refScale;
    const briefSettle = isLongJump
      ? Math.min(0.08, spanToNext * 0.06)
      : Math.min(0.16, spanToNext * 0.11);
    const earliestDepart = prevHopEnd + briefSettle;
    const availGap = Math.max(0.22, arriveT - earliestDepart);
    const hopDur = Math.min(scaledHopDur, availGap);
    const startT = Math.max(0.02, arriveT - hopDur);
    const endT = Math.max(startT + 0.18, arriveT);
    prevHopEnd = endT;

    const hopRng = mulberry32(combineSeed(seed, 0x71c3 + i * 37));
    const asym = 0.72 + hopRng() * 0.48; // Asymmetric organic bow variation per hop
    const isRowDescent = curr.anchor.y > prev.anchor.y + 80 * refScale;
    const safeMarginX = 48;
    const safeMarginY = 42;

    let ctrl1: { x: number; y: number };
    let ctrl2: { x: number; y: number };

    if (curr.hopControlPoint) {
      // Branching connector-guided Cubic Bézier: sweeps gracefully around the connector midpoint
      // reinforcing its natural perpendicular offset so the curve never cancels back to a straight line
      const cp = curr.hopControlPoint;
      const bowMag = clamp(dist * 0.28, 48, 96) * refScale;
      const cpPerp = (cp.x - prev.anchor.x) * perpNx + (cp.y - prev.anchor.y) * perpNy;
      let bowSign = Math.abs(cpPerp) >= 6 ? (cpPerp >= 0 ? 1 : -1) : i % 2 === 0 ? 1 : -1;
      const base1X = lerp(prev.anchor.x, cp.x, 0.58);
      const base1Y = lerp(prev.anchor.y, cp.y, 0.58);
      const base2X = lerp(cp.x, curr.anchor.x, 0.42);
      const base2Y = lerp(cp.y, curr.anchor.y, 0.42);
      const probeX = base1X + perpNx * bowMag * bowSign * 0.9;
      if (probeX < safeMarginX + 24 || probeX > W - safeMarginX - 24) {
        bowSign = -bowSign;
      }
      ctrl1 = {
        x: clamp(base1X + perpNx * bowMag * bowSign * 0.9, safeMarginX, W - safeMarginX),
        y: clamp(base1Y + perpNy * bowMag * bowSign * 0.9 - 16 * refScale, safeMarginY, H - safeMarginY),
      };
      ctrl2 = {
        x: clamp(base2X + perpNx * bowMag * bowSign * 0.65, safeMarginX, W - safeMarginX),
        y: clamp(base2Y + perpNy * bowMag * bowSign * 0.65 - 20 * refScale, safeMarginY, H - safeMarginY),
      };
    } else if (isRowDescent && Math.abs(chordDx) > 140 * refScale) {
      // Flowing Cubic Bézier arc descending gracefully from upper row into next row:
      // C1 lifts softly and carries the creature horizontally across upper air;
      // C2 sweeps smoothly through the inter-row corridor before banking softly onto the new card.
      const upperArch = clamp(dist * 0.145, 56, 132) * refScale;
      const roomAbovePrev = Math.max(24 * refScale, prev.anchor.y - safeMarginY);
      const c1Lift = Math.min(upperArch * 0.56 * asym, roomAbovePrev * 0.85);
      ctrl1 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.36), safeMarginX, W - safeMarginX),
        y: clamp(prev.anchor.y - c1Lift, safeMarginY, H - safeMarginY),
      };
      ctrl2 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.72), safeMarginX, W - safeMarginX),
        y: clamp(lerp(prev.anchor.y, curr.anchor.y, 0.5) - upperArch * 0.44, safeMarginY, H - safeMarginY),
      };
    } else if (Math.abs(chordDy) > Math.abs(chordDx) * 1.15) {
      // Mostly-vertical climb or descent (e.g. stacked branching nodes): bow laterally into open space
      // so vertical transitions form a sweeping organic Cubic Bézier arc instead of a straight vertical drop
      const latBow = clamp(dist * 0.34, 52, 118) * refScale;
      const midX = (prev.anchor.x + curr.anchor.x) * 0.5;
      let sideDir = i % 2 === 0 ? 1 : -1;
      if (midX + sideDir * latBow < safeMarginX + 24 || midX + sideDir * latBow > W - safeMarginX - 24) {
        sideDir = midX > W * 0.5 ? -1 : 1;
      }
      ctrl1 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.28) + sideDir * latBow * asym, safeMarginX, W - safeMarginX),
        y: clamp(lerp(prev.anchor.y, curr.anchor.y, 0.28), safeMarginY, H - safeMarginY),
      };
      ctrl2 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.72) + sideDir * latBow * (1.28 - asym * 0.45), safeMarginX, W - safeMarginX),
        y: clamp(lerp(prev.anchor.y, curr.anchor.y, 0.72), safeMarginY, H - safeMarginY),
      };
    } else {
      // Same-row / horizontal or diagonal card-to-card lush asymmetric Cubic Bézier swoop:
      // Lifts gently upward in a buoyant curve (or soft under-arch if very close to top screen edge)
      const roomAbove = Math.min(prev.anchor.y, curr.anchor.y) - safeMarginY;
      const rawArch = clamp(dist * 0.25, 62, 146) * refScale;
      const archDir = roomAbove >= 44 * refScale ? -1 : 1; // -1 = buoyant upward swoop
      const maxLift = archDir < 0 ? Math.max(36 * refScale, roomAbove * 0.92) : 95 * refScale;
      const lift1 = Math.min(rawArch * asym, maxLift);
      // Slight S-curve asymmetry between C1 and C2 for authentic organic motion
      const lift2 = Math.min(rawArch * (1.38 - asym * 0.55), maxLift);
      const swayShift = (i % 2 === 0 ? 1 : -1) * clamp(dist * 0.045, 10, 28) * refScale;

      ctrl1 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.28) + swayShift, safeMarginX, W - safeMarginX),
        y: clamp(lerp(prev.anchor.y, curr.anchor.y, 0.24) + archDir * lift1, safeMarginY, H - safeMarginY),
      };
      ctrl2 = {
        x: clamp(lerp(prev.anchor.x, curr.anchor.x, 0.74) - swayShift * 0.6, safeMarginX, W - safeMarginX),
        y: clamp(lerp(prev.anchor.y, curr.anchor.y, 0.76) + archDir * lift2, safeMarginY, H - safeMarginY),
      };
    }

    // Measure accurate Cubic Bézier arc length across 10 segments
    const bezierArcDist = measureCubicBezierLength(prev.anchor, ctrl1, ctrl2, curr.anchor, 10);

    hops.push({
      fromIdx: i - 1,
      toIdx: i,
      startT,
      endT,
      hopDuration: Number((endT - startT).toFixed(3)),
      arcDist: Math.max(dist, bezierArcDist),
      ctrl1,
      ctrl2,
      perpNx,
      perpNy,
      weavePhase: hopRng() * Math.PI * 2,
    });
  }

  // Evaluate ideal Cubic Bézier + Lissajous guide target at time t
  const evalGuide = (
    t: number
  ): { x: number; y: number; boost: number; activeHop: HopSpec | null } => {
    let activeIdx = 0;
    for (let i = 0; i < stops.length; i++) {
      const revealT = stops[i].textRevealStart ?? stops[i].activeStart;
      if (t >= revealT) {
        activeIdx = i;
      } else {
        break;
      }
    }

    let activeHop: HopSpec | null = null;
    for (let h = hops.length - 1; h >= 0; h--) {
      if (t >= hops[h].startT && t <= hops[h].endT) {
        activeHop = hops[h];
        break;
      }
    }

    // C2-continuous cosine-ramped cruise easing: zero velocity & zero acceleration at ends,
    // steady serene constant-speed middle cruise (peak speed ~1.31x avg vs 1.57x for pure sine).
    const easeCalmCruise = (rawU: number, ramp = 0.24): number => {
      const u = clamp(rawU, 0, 1);
      const vMax = 1 / (1 - ramp);
      if (u < ramp) {
        return vMax * (0.5 * u - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * u) / ramp));
      }
      if (u <= 1 - ramp) {
        return vMax * (0.5 * ramp + (u - ramp));
      }
      const rem = u - (1 - ramp);
      return (
        1 -
        vMax *
          (0.5 * (ramp - rem) -
            (ramp / (2 * Math.PI)) * Math.sin((Math.PI * (ramp - rem)) / ramp))
      );
    };

    if (activeHop) {
      const u = easeCalmCruise(progress(t, activeHop.startT, activeHop.endT), 0.24);
      const pFrom = evalStopDrift(activeHop.fromIdx, t);
      const pTo = evalStopDrift(activeHop.toIdx, t);
      // Offset the Cubic Bézier control points smoothly with endpoint Lissajous drift for C1 continuity
      const fromAnchor = stops[activeHop.fromIdx].anchor;
      const toAnchor = stops[activeHop.toIdx].anchor;
      const c1 = {
        x: activeHop.ctrl1.x + (pFrom.x - fromAnchor.x) * 0.45,
        y: activeHop.ctrl1.y + (pFrom.y - fromAnchor.y) * 0.45,
      };
      const c2 = {
        x: activeHop.ctrl2.x + (pTo.x - toAnchor.x) * 0.45,
        y: activeHop.ctrl2.y + (pTo.y - toAnchor.y) * 0.45,
      };
      const pt = evaluateCubicBezier(pFrom, c1, c2, pTo, u);
      // Subtle buoyant air-current micro-weave perpendicular to chord (vanishes smoothly at u=0 and u=1)
      const env = Math.sin(u * Math.PI);
      const weave = env * env * Math.sin(u * Math.PI * 2 + activeHop.weavePhase) * 9.5 * refScale;
      return {
        x: clamp(pt.x + activeHop.perpNx * weave, 42, W - 42),
        y: clamp(pt.y + activeHop.perpNy * weave, 38, H - 38),
        boost: Math.max(pFrom.boost, pTo.boost),
        activeHop,
      };
    }

    const drift = evalStopDrift(activeIdx, t);
    return { ...drift, activeHop: null };
  };

  // Run deterministic speed- and acceleration-limited kinematic follower with smooth velocity feedforward
  // so the creature stays calm (acceleration-limited, zero jerks) while arriving strictly on time.
  const samples: CalmFlightSample[] = [];
  const initGuide = evalGuide(0);
  let px = initGuide.x;
  let py = initGuide.y;
  let vx = 0;
  let vy = 0;

  const clearPad = 16 * refScale;
  for (let s = 0; s < stops.length; s++) {
    if (0 < stops[s].textRevealEnd) {
      const res = pushOutsideRect(px, py, stops[s].textBox, clearPad, W, H);
      px = res.x;
      py = res.y;
    }
  }

  let peakObservedMaxSpeed = baseMaxSpeed;
  let peakObservedMaxAccel = baseMaxAccel;

  const evalClearedGuide = (tk: number) => {
    const g = evalGuide(tk);
    let gx = g.x;
    let gy = g.y;
    for (let s = 0; s < stops.length; s++) {
      if (tk < stops[s].textRevealEnd) {
        const cleared = pushOutsideRect(gx, gy, stops[s].textBox, clearPad + 6, W, H);
        gx = cleared.x;
        gy = cleared.y;
      }
    }
    return { x: gx, y: gy, boost: g.boost, activeHop: g.activeHop };
  };

  let prevClearedGuide = evalClearedGuide(0);

  for (let k = 0; k < stepCount; k++) {
    const tk = k * dt;
    const guide = k === 0 ? prevClearedGuide : evalClearedGuide(tk);

    if (k === 0) {
      samples.push({ t: tk, x: px, y: py, vx: 0, vy: 0, hoverBoost: guide.boost });
      continue;
    }

    // Feedforward guide velocity along the easeInOutSine Catmull-Rom arc (goes smoothly to 0 at stop arrival)
    const gvx = (guide.x - prevClearedGuide.x) / dt;
    const gvy = (guide.y - prevClearedGuide.y) / dt;
    prevClearedGuide = guide;

    const hop = guide.activeHop;
    const dx = guide.x - px;
    const dy = guide.y - py;
    const distToGuide = Math.hypot(dx, dy);
    // Strictly bounded poetic speed & acceleration tuned to easeCalmCruise (~1.32x peak/avg)
    const requiredHopPeak = hop
      ? (hop.arcDist / Math.max(0.28, hop.hopDuration)) * 1.35
      : 0;
    const hoverBaseSpeed = Math.max(125 * refScale * speedScale, baseMaxSpeed * 0.64);
    const approachBlend = clamp((distToGuide - 48 * refScale) / (180 * refScale), 0, 1);
    const hoverApproachSpeed = lerp(
      hoverBaseSpeed,
      Math.min(hardHopCeiling * 0.78, baseMaxSpeed * 1.65),
      approachBlend
    );
    const localMaxSpeed = hop
      ? clamp(Math.max(baseMaxSpeed, requiredHopPeak), baseMaxSpeed, hardHopCeiling)
      : hoverApproachSpeed;
    const localMaxAccel = hop
      ? clamp(Math.max(baseMaxAccel, localMaxSpeed * 2.85), baseMaxAccel, hardHopCeiling * 3.1)
      : Math.max(160 * refScale * speedScale, localMaxSpeed * 1.9);

    peakObservedMaxSpeed = Math.max(peakObservedMaxSpeed, localMaxSpeed);
    peakObservedMaxAccel = Math.max(peakObservedMaxAccel, localMaxAccel);

    const kp = hop ? 4.8 : lerp(2.55, 3.8, approachBlend);
    const desiredVel = clampVecMagnitude(
      gvx + dx * kp,
      gvy + dy * kp,
      localMaxSpeed
    );

    const reqAx = (desiredVel.x - vx) / dt;
    const reqAy = (desiredVel.y - vy) / dt;
    const clampedAcc = clampVecMagnitude(reqAx, reqAy, localMaxAccel);

    const nextV = clampVecMagnitude(
      vx + clampedAcc.x * dt,
      vy + clampedAcc.y * dt,
      localMaxSpeed
    );
    vx = nextV.x;
    vy = nextV.y;
    px = clamp(px + vx * dt, 38, W - 38);
    py = clamp(py + vy * dt, 34, H - 34);

    // Hard guarantee: never cover unrevealed text
    for (let s = 0; s < stops.length; s++) {
      if (tk < stops[s].textRevealEnd) {
        const res = pushOutsideRect(px, py, stops[s].textBox, clearPad, W, H);
        if (res.pushed) {
          const stepDx = res.x - px;
          const stepDy = res.y - py;
          const safeShift = clampVecMagnitude(stepDx, stepDy, localMaxSpeed * dt);
          px = res.x;
          py = res.y;
          vx = clamp(vx + safeShift.x * 2, -localMaxSpeed, localMaxSpeed);
          vy = clamp(vy + safeShift.y * 2, -localMaxSpeed, localMaxSpeed);
          const normV = clampVecMagnitude(vx, vy, localMaxSpeed);
          vx = normV.x;
          vy = normV.y;
        }
      }
    }

    samples.push({ t: tk, x: px, y: py, vx, vy, hoverBoost: guide.boost });
  }

  return {
    dt,
    totalDuration,
    exitStart,
    calmSpeed: clampedCalm,
    maxSpeedPxPerSec: peakObservedMaxSpeed,
    maxAccelPxPerSec2: peakObservedMaxAccel,
    samples,
    stops,
    hops: hops.map((h) => ({
      fromIdx: h.fromIdx,
      toIdx: h.toIdx,
      startT: h.startT,
      endT: h.endT,
      hopDuration: h.hopDuration,
      bezier: {
        p0: { x: stops[h.fromIdx].anchor.x, y: stops[h.fromIdx].anchor.y },
        c1: { x: h.ctrl1.x, y: h.ctrl1.y },
        c2: { x: h.ctrl2.x, y: h.ctrl2.y },
        p3: { x: stops[h.toIdx].anchor.x, y: stops[h.toIdx].anchor.y },
      },
    })),
    trailDotCount: 16,
  };
}

/**
 * Evaluates a CalmFlightPlan at arbitrary time t using an explicit Cubic Bézier segment
 * constructed from adjacent kinematic sample positions and velocities.
 * Pure deterministic function of t.
 */
export function sampleCalmFlight(
  plan: CalmFlightPlan,
  t: number
): SampledFlightState {
  const { samples, dt, exitStart, totalDuration, maxSpeedPxPerSec } = plan;
  if (samples.length === 0) {
    return { x: 0, y: 0, vx: 0, vy: 0, speedNorm: 0, hoverBoost: 0, visibleAlpha: 0 };
  }

  const clampedT = clamp(t, 0, Math.max(0, totalDuration));
  const fIdx = clampedT / dt;
  const i0 = Math.min(samples.length - 1, Math.max(0, Math.floor(fIdx)));
  const i1 = Math.min(samples.length - 1, i0 + 1);
  const u = clamp(fIdx - i0, 0, 1);

  const s0 = samples[i0];
  const s1 = samples[i1];

  // Explicit Cubic Bézier evaluation between consecutive kinematic samples for C1 smoothness
  const seg = computeCubicBezierSegmentFromTangents(
    s0,
    { vx: s0.vx, vy: s0.vy },
    s1,
    { vx: s1.vx, vy: s1.vy },
    dt
  );
  const bez = evaluateCubicBezier(seg.p0, seg.c1, seg.c2, seg.p3, u);
  const x = bez.x;
  const y = bez.y;
  const vx = i0 === i1 ? s0.vx : bez.dx / dt;
  const vy = i0 === i1 ? s0.vy : bez.dy / dt;
  const hoverBoost = lerp(s0.hoverBoost, s1.hoverBoost, u);

  const speed = Math.hypot(vx, vy);
  const speedNorm = clamp(speed / Math.max(30, maxSpeedPxPerSec), 0, 1);

  const introA = easeOutCubic(progress(t, 0, 0.35));
  const exitA = 1 - easeInCubic(progress(t, exitStart, totalDuration));
  const visibleAlpha = clamp(introA * exitA, 0, 1);

  return { x, y, vx, vy, speedNorm, hoverBoost, visibleAlpha };
}

/**
 * Draws the shorter, fainter calm trail (N <= 24) behind the creature from a CalmFlightPlan.
 * GREEN mode: crisp solid small dots, zero shadowBlur/halo.
 */
export function drawCalmFlyerTrail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  plan: CalmFlightPlan,
  t: number,
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  scale: number,
  seed: number,
  theme: CalmStyleTheme = 'dark'
): void {
  const isGreen = bgMode === 'green';
  const isLight = bgMode === 'style' && theme === 'light';
  const dotCount = Math.min(24, creature === 'orb' || creature === 'firefly' ? 18 : 14);
  const maxAge = 0.78;
  const rng = mulberry32(combineSeed(seed, 0x9912a));

  ctx.save();
  for (let i = dotCount; i >= 1; i--) {
    const frac = i / dotCount;
    const sampleT = t - frac * maxAge;
    if (sampleT < 0.02) continue;

    const st = sampleCalmFlight(plan, sampleT);
    if (st.visibleAlpha <= 0.02) continue;

    const phase = rng() * Math.PI * 2 + i * 1.13;
    const blink = isGreen ? 1 : 0.68 + 0.32 * Math.sin(t * Math.PI * 2 * 0.85 + phase);
    const taper = Math.pow(1 - frac, 1.35);
    const radius = Math.max(
      0.9,
      (creature === 'orb' ? 3.4 : creature === 'firefly' ? 3.8 : 4.0) * taper * scale
    );

    if (isGreen) {
      ctx.shadowBlur = 0;
      if (creature === 'orb') {
        const pRot = phase + t * 0.55 * (i % 2 === 0 ? 1 : -1);
        drawMiniPlumPetal(
          ctx,
          st.x,
          st.y,
          Math.max(1.5, radius * 0.95),
          pRot,
          i % 3 === 0 ? '#FCE7F3' : accentColor,
          '#FFF1F7',
          true,
          1
        );
      } else {
        ctx.fillStyle = i % 3 === 0 ? '#FFF8D6' : accentColor;
        ctx.beginPath();
        ctx.arc(st.x, st.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (creature === 'orb') {
      const crimsonTone = mixHex(accentColor, '#BE185D', 0.42);
      const blushTone = mixHex(accentColor, '#FCE7F3', 0.56);
      const driftX = Math.cos(t * 0.7 + phase) * 4.5 * frac * scale;
      const driftY = -frac * 6.5 * scale + Math.sin(t * 0.85 + phase) * 3.2 * frac * scale;
      const px = st.x + driftX;
      const py = st.y + driftY;
      const alpha = clamp(taper * blink * st.visibleAlpha * (isLight ? 0.62 : 0.56), 0, 1);
      const pRot = phase + Math.sin(t * 0.85 + phase) * 0.8 + frac * 1.1;
      const pCol = i % 3 === 0 ? crimsonTone : i % 3 === 1 ? accentColor : blushTone;
      drawMiniPlumPetal(
        ctx,
        px,
        py,
        Math.max(1.3, radius * 0.95),
        pRot,
        pCol,
        blushTone,
        false,
        alpha,
        radius * 2.2
      );
    } else {
      const alpha = clamp(taper * blink * st.visibleAlpha * 0.46, 0, 1);
      const col = creature === 'firefly' && frac > 0.55 ? '#FDE68A' : accentColor;
      const outerR = radius * 1.95;
      const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, outerR);
      g.addColorStop(0, hexToRgba('#FFFFFF', alpha * 0.85));
      g.addColorStop(0.5, hexToRgba(col, alpha * 0.72));
      g.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(st.x, st.y, outerR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Reusable scratch canvas for soft feathered RTL text reveal (never splits Arabic characters)
let featheredRevealScratchCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let featheredRevealScratchCtx:
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null = null;

function getFeatheredRevealScratch(
  w: number,
  h: number
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} | null {
  const safeW = Math.max(8, Math.ceil(w));
  const safeH = Math.max(8, Math.ceil(h));
  try {
    if (!featheredRevealScratchCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        featheredRevealScratchCanvas = new OffscreenCanvas(safeW, safeH);
      } else if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = safeW;
        c.height = safeH;
        featheredRevealScratchCanvas = c;
      } else {
        return null;
      }
      featheredRevealScratchCtx = featheredRevealScratchCanvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    }
    if (!featheredRevealScratchCtx) return null;
    if (
      featheredRevealScratchCanvas.width < safeW ||
      featheredRevealScratchCanvas.height < safeH
    ) {
      featheredRevealScratchCanvas.width = Math.max(featheredRevealScratchCanvas.width, safeW);
      featheredRevealScratchCanvas.height = Math.max(featheredRevealScratchCanvas.height, safeH);
    }
    return {
      canvas: featheredRevealScratchCanvas,
      ctx: featheredRevealScratchCtx,
    };
  } catch {
    return null;
  }
}

/**
 * Draws an intact text line with a soft feathered RTL (or LTR) clip driven purely by schedule progress.
 * - Never splits Arabic letters into characters.
 * - GREEN mode: crisp hard clip (zero semi-transparent feathering or shadowBlur).
 */
export function drawFeatheredScheduleLine(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  line: ArabicQuoteLayout['lines'][number];
  originX: number;
  originY: number;
  revealProgress: number; // 0..1
  isLtr: boolean;
  isGreen: boolean;
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  direction: ResolvedTextDirection;
  textColor: string;
  keywordColor: string;
  isKeywordActive: (word: ArabicQuoteLayout['lines'][number]['words'][number]) => boolean;
  drawUnderline?: (
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    offX: number,
    offY: number
  ) => void;
}): void {
  const {
    ctx,
    line,
    originX,
    originY,
    revealProgress,
    isLtr,
    isGreen,
    fontFamily,
    fontWeight,
    fontSize,
    direction,
    textColor,
    keywordColor,
    isKeywordActive,
    drawUnderline,
  } = params;

  const p = clamp(revealProgress, 0, 1);
  if (p <= 0.005) return;

  const absLineLeft = originX + line.leftX;
  const absLineRight = originX + line.rightX;
  const padX = Math.max(10, Math.round(fontSize * 0.35));
  const clipTop = originY + line.topY - Math.round(fontSize * 0.52);
  const clipH = Math.max(24, line.bottomY - line.topY + Math.round(fontSize * 1.15));
  const fullLeft = absLineLeft - padX;
  const fullRight = absLineRight + padX;
  const fullW = Math.max(4, fullRight - fullLeft);

  const drawWordsOnto = (
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    offX: number,
    offY: number
  ) => {
    for (let wi = 0; wi < line.words.length; wi++) {
      const word = line.words[wi];
      const kwActive = word.isKeyword && isKeywordActive(word);
      applyStudioCanvasTextProps(
        targetCtx,
        fontFamily,
        fontWeight,
        word.fontSize,
        direction
      );
      targetCtx.shadowBlur = 0;
      targetCtx.shadowColor = 'transparent';
      targetCtx.fillStyle = kwActive ? keywordColor : textColor;
      drawBidiWord(
        targetCtx,
        word.text,
        originX + word.x - offX,
        originY + word.y - offY,
        direction
      );
    }
    if (drawUnderline) {
      drawUnderline(targetCtx, offX, offY);
    }
  };

  // Fully revealed OR green screen -> direct draw (crisp clip in green mode)
  if (p >= 0.998 || isGreen) {
    const clipX = isLtr ? fullLeft : fullRight - fullW * p;
    const clipW = fullW * p;
    if (clipW <= 0.5) return;
    ctx.save();
    if (p < 0.998) {
      ctx.beginPath();
      ctx.rect(clipX, clipTop, clipW, clipH);
      ctx.clip();
    }
    drawWordsOnto(ctx, 0, 0);
    ctx.restore();
    return;
  }

  // Soft feathered RTL/LTR reveal using scratch canvas + destination-in gradient mask
  const scratch = getFeatheredRevealScratch(fullW + 4, clipH + 4);
  if (scratch && typeof ctx.drawImage === 'function') {
    const { canvas: sc, ctx: sctx } = scratch;
    const drawW = Math.ceil(fullW + 4);
    const drawH = Math.ceil(clipH + 4);
    sctx.save();
    sctx.clearRect(0, 0, drawW, drawH);
    drawWordsOnto(sctx, fullLeft, clipTop);

    // Apply soft feathered mask sweeping RTL (or LTR)
    const featherW = clamp(fontSize * 1.15, 22, Math.max(24, fullW * 0.32));
    sctx.globalCompositeOperation = 'destination-in';
    const maskGrad = isLtr
      ? sctx.createLinearGradient(0, 0, fullW, 0)
      : sctx.createLinearGradient(fullW, 0, 0, 0);
    const solidStop = clamp(p, 0, 1);
    const fadeStart = clamp(solidStop - featherW / Math.max(1, fullW), 0, solidStop);
    const fadeEnd = clamp(solidStop + (featherW * 0.25) / Math.max(1, fullW), solidStop, 1);
    maskGrad.addColorStop(0, 'rgba(255,255,255,1)');
    maskGrad.addColorStop(fadeStart, 'rgba(255,255,255,1)');
    maskGrad.addColorStop(fadeEnd, 'rgba(255,255,255,0)');
    maskGrad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = maskGrad;
    sctx.fillRect(0, 0, drawW, drawH);
    sctx.restore();

    ctx.drawImage(sc as CanvasImageSource, 0, 0, drawW, drawH, fullLeft, clipTop, drawW, drawH);
    return;
  }

  // Fallback for headless test mock contexts without scratch canvas
  const clipX = isLtr ? fullLeft : fullRight - fullW * p;
  const clipW = fullW * p;
  if (clipW <= 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, clipTop, clipW, clipH);
  ctx.clip();
  drawWordsOnto(ctx, 0, 0);
  ctx.restore();
}

// ============================================================================
// 1) PHRASE FLYER (phrase_flyer) SCHEDULE, LAYOUT & RENDERER
// ============================================================================

interface PhraseWordRevealSchedule {
  lineIndex: number;
  wordIndex: number;
  revealStart: number;
  revealEnd: number;
  isKeyword: boolean;
  centerX: number;
  topY: number;
  baselineY: number;
}

interface PhraseFlyerPlan {
  layout: ArabicQuoteLayout;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  direction: ResolvedTextDirection;
  wordSchedules: PhraseWordRevealSchedule[];
  waypoints: FlightWaypoint[];
  keywordTimes: number[];
  effective: ReturnType<typeof getEffectiveTimeline>;
}

export function buildPhraseFlyerPlan(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): PhraseFlyerPlan {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPhrasePositionBox(custom.position || 'center', custom.format, W, H);
  const direction = resolveTextDirection(custom, content.quoteText);
  const effective = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.38);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const speedFactor = clamp(DEFAULT_FLYER_FLIGHT_SPEED / flightSpeed, 0.44, 2.2);

  const defaultFont =
    direction === 'ltr'
      ? PHRASE_FLYER_CONFIG.defaultEnglishQuoteFont
      : PHRASE_FLYER_CONFIG.defaultQuoteFont;
  let quoteFont: string = custom.quoteFontOverride || defaultFont;
  if (
    direction === 'rtl' &&
    custom.quoteFontOverride &&
    !PHRASE_FLYER_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    quoteFont = defaultFont;
  }

  // Reserve vertical headroom inside the position box so the flying creature above line 0
  // never clips outside the position box or canvas
  const creatureHeadroom = Math.round(Math.min(68, posBox.boxHeight * 0.14));
  const innerX = posBox.boxX + Math.round(posBox.boxWidth * 0.05);
  const innerY = posBox.boxY + creatureHeadroom;
  const innerW = Math.max(180, posBox.boxWidth - Math.round(posBox.boxWidth * 0.1));
  const innerH = Math.max(120, posBox.boxHeight - creatureHeadroom - Math.round(posBox.boxHeight * 0.05));

  const maxFont = custom.format === '16:9' ? 68 : 60;
  const minFont = 22;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: minFont,
    maxFontSize: maxFont,
    fontSizeMultiplier: custom.fontSizeMultiplier ?? 1.0,
    keywordScaleMultiplier: 1.06,
    lineHeightRatio: 1.72,
    boxX: innerX,
    boxY: innerY,
    boxWidth: innerW,
    boxHeight: innerH,
    align: 'center',
    direction,
    verticalAlign: 'center',
  });

  // Build slow, continuous, stop-free flight schedule across all words & lines
  const totalWords = layout.lines.reduce((acc, l) => acc + l.words.length, 0);

  const flightStart = 0.12;
  const maxAllowedFlightEnd = Math.max(flightStart + 0.65, effective.exitStart - 0.55);
  const desiredGlideSpan = Math.max(
    effective.enter * 0.92,
    (1.05 + totalWords * 0.28) * speedFactor
  );
  const flightEnd = clamp(
    flightStart + desiredGlideSpan,
    flightStart + 0.55,
    maxAllowedFlightEnd
  );
  const totalAvail = Math.max(0.45, flightEnd - flightStart);
  const stepPerWord = totalAvail / Math.max(1, totalWords);

  const wordSchedules: PhraseWordRevealSchedule[] = [];
  const waypoints: FlightWaypoint[] = [];
  const keywordTimes: number[] = [];
  const seenKeyGroup = new Set<number>();

  const flightYOffset = Math.max(26, layout.fontSize * 0.68);
  let cursorT = flightStart;

  // Compute text block envelope for smooth turnaround curves and continuous ambient orbit
  let textLeft = W * 0.35;
  let textRight = W * 0.65;
  let textTop = H * 0.38;
  let textBottom = H * 0.62;
  if (layout.lines.length > 0) {
    textLeft = Math.min(...layout.lines.map((l) => l.leftX));
    textRight = Math.max(...layout.lines.map((l) => l.rightX));
    textTop = layout.lines[0].topY;
    textBottom = layout.lines[layout.lines.length - 1].y + layout.fontSize * 0.32;
  }

  const keywordGlowAtTime = (sampleT: number): number => {
    let best = 0.22;
    for (let k = 0; k < keywordTimes.length; k++) {
      const d = Math.abs(sampleT - keywordTimes[k]);
      if (d < 0.55) {
        best = Math.max(best, lerp(1.0, 0.22, d / 0.55));
      }
    }
    return best;
  };

  // First build exact word reveal schedule & keyword event timestamps (100% deterministic & SFX-synced)
  const lineSpans: {
    startT: number;
    endT: number;
    leftX: number;
    rightX: number;
    flyY: number;
  }[] = [];

  for (let li = 0; li < layout.lines.length; li++) {
    const line = layout.lines[li];
    const lineFlyY = clamp(line.y - flightYOffset, 42, H - 42);
    const lineStartT = cursorT;

    for (let wi = 0; wi < line.words.length; wi++) {
      const w = line.words[wi];
      const wordCenterX = clamp(w.x - w.width * 0.5, 42, W - 42);
      const revStart = cursorT;
      const revEnd = Math.min(
        effective.exitStart - 0.12,
        revStart + Math.max(0.45, stepPerWord * 1.65)
      );

      wordSchedules.push({
        lineIndex: li,
        wordIndex: wi,
        revealStart: revStart,
        revealEnd: revEnd,
        isKeyword: w.isKeyword,
        centerX: wordCenterX,
        topY: line.topY,
        baselineY: line.y,
      });

      if (w.isKeyword && w.groupId !== null && !seenKeyGroup.has(w.groupId)) {
        seenKeyGroup.add(w.groupId);
        keywordTimes.push(Number(revStart.toFixed(3)));
      }

      cursorT += stepPerWord;
    }

    const lineEndT = Math.max(lineStartT + 0.12, cursorT - stepPerWord * 0.25);
    lineSpans.push({
      startT: lineStartT,
      endT: lineEndT,
      leftX: clamp(line.leftX, 56, W - 56),
      rightX: clamp(line.rightX, 56, W - 56),
      flyY: lineFlyY,
    });
  }

  // Generate gradual, calm flowing wave waypoints across all lines (wide curvature radius, zero sharp U-turns)
  if (lineSpans.length > 0) {
    const readingDir = direction === 'rtl' ? -1 : 1; // -1: right->left, +1: left->right
    const centerBlockX = clamp((textLeft + textRight) * 0.5, 120, W - 120);
    const sweepHalfW = clamp((textRight - textLeft) * 0.28, 72, Math.min(210, posBox.boxWidth * 0.28));

    const pushSmoothWp = (tVal: number, xVal: number, yVal: number) => {
      const prevT = waypoints.length > 0 ? waypoints[waypoints.length - 1].t : -1;
      const safeT = Number(Math.max(tVal, prevT + 0.05).toFixed(3));
      waypoints.push({
        t: safeT,
        x: clamp(xVal, 48, W - 48),
        y: clamp(yVal, 44, H - 44),
        isHover: false,
        keywordGlow: keywordGlowAtTime(safeT),
      });
    };

    const firstFlyY = lineSpans[0].flyY;
    const lastFlyY = lineSpans[lineSpans.length - 1].flyY;
    const entryStartX = centerBlockX - readingDir * (sweepHalfW * 0.92);
    waypoints.push({
      t: 0,
      x: clamp(entryStartX - readingDir * 36, 48, W - 48),
      y: clamp(firstFlyY - 22, 44, H - 44),
      isHover: false,
      keywordGlow: 0.18,
    });

    if (lineSpans.length === 1) {
      // Single-line quote: serene wide Cubic Bézier crest sweeping organically across the line
      const s0 = lineSpans[0];
      const segStart = centerBlockX - readingDir * sweepHalfW;
      const segEnd = centerBlockX + readingDir * sweepHalfW;
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.14), lerp(segStart, segEnd, 0.14), firstFlyY - 8);
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.5), centerBlockX, firstFlyY - 30);
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.86), lerp(segStart, segEnd, 0.86), firstFlyY - 8);
    } else {
      // Multi-line quote: gradual continuous wave descending across lines with generous turn radius
      // Vertical span expands gently above first line and below last line so turnaround curvature stays wide
      const topArchY = clamp(firstFlyY - 24, 44, H - 44);
      const botArchY = clamp(lastFlyY + 26, 44, H - 44);
      const halfCycles = Math.min(2.0, Math.max(1.0, (lineSpans.length - 1) * 0.85 + 0.35));
      const sampleCount = Math.max(5, Math.round(halfCycles * 4) + 1);
      const t0 = lineSpans[0].startT;
      const t1 = lineSpans[lineSpans.length - 1].endT;

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);
        const st = lerp(t0, t1, u);
        const phase = u * Math.PI * halfCycles;
        // Smooth cosine horizontal sweep + gentle vertical S-descent with vertical breathing
        const sx = centerBlockX - readingDir * Math.cos(phase) * sweepHalfW;
        const sy = lerp(topArchY, botArchY, easeInOutCubic(u)) - Math.sin(phase) * 18;
        pushSmoothWp(st, sx, sy);
      }
    }
  }

  // Continuous serene ambient wave orbit around the text block matching final sweep tangent (never reverses abruptly)
  if (waypoints.length > 0) {
    const lastWp = waypoints[waypoints.length - 1];
    const prevWp = waypoints.length > 1 ? waypoints[waypoints.length - 2] : lastWp;
    const centerX = clamp((textLeft + textRight) * 0.5, 80, W - 80);
    const centerY = clamp((textTop + textBottom) * 0.5, 80, H - 80);
    const rx = clamp((textRight - textLeft) * 0.5 + 48, 90, W * 0.42);
    const ry = clamp((textBottom - textTop) * 0.5 + 38, 56, H * 0.34);

    // Match orbital angular direction to the creature's current cross-product around the center
    const relX = (lastWp.x - centerX) / Math.max(1, rx);
    const relY = (lastWp.y - centerY) / Math.max(1, ry);
    const velX = lastWp.x - prevWp.x;
    const velY = lastWp.y - prevWp.y;
    const cross = relX * velY - relY * velX;
    const angularDir = cross >= 0 ? 1 : -1;

    const startAngle =
      Math.hypot(relX, relY) < 0.35
        ? Math.atan2(velY, velX || (direction === 'rtl' ? -1 : 1))
        : Math.atan2(relY, relX);
    const stepTime = clamp(1.75 * speedFactor, 0.9, 2.65);
    const stepAngle = angularDir * (Math.PI * 0.22);

    let orbitT = lastWp.t + stepTime * 0.78;
    let stepIdx = 1;
    while (orbitT < effective.total - 0.15) {
      const ang = startAngle + stepIdx * stepAngle;
      const ox = clamp(centerX + Math.cos(ang) * rx, 42, W - 42);
      const oy = clamp(
        centerY + Math.sin(ang) * ry - Math.cos(stepIdx * 0.9) * 8,
        40,
        H - 40
      );
      waypoints.push({
        t: Number(orbitT.toFixed(3)),
        x: ox,
        y: oy,
        isHover: false,
        keywordGlow: 0.24 + 0.14 * (0.5 + 0.5 * Math.sin(stepIdx * 1.1)),
      });
      orbitT += stepTime;
      stepIdx++;
    }

    const finalPrev = waypoints[waypoints.length - 1];
    if (effective.total > finalPrev.t + 0.04) {
      const finalAng = startAngle + stepIdx * stepAngle * 0.75;
      waypoints.push({
        t: Number(effective.total.toFixed(3)),
        x: clamp(centerX + Math.cos(finalAng) * rx, 42, W - 42),
        y: clamp(centerY + Math.sin(finalAng) * ry - 10, 40, H - 40),
        isHover: false,
        keywordGlow: 0.2,
      });
    }
  }

  return {
    layout,
    boxX: innerX,
    boxY: innerY,
    boxWidth: innerW,
    boxHeight: innerH,
    direction,
    wordSchedules,
    waypoints,
    keywordTimes,
    effective,
  };
}

export function getPhraseFlyerEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const plan = buildPhraseFlyerPlan(ctx, content, timeline, custom, size);
  return {
    enterStart: 0.08,
    keywordTimes: plan.keywordTimes,
  };
}

export const renderPhraseFlyer: PureStyleRenderer = (
  ctx,
  t,
  content,
  timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';
  const creature = resolveFlyerCreature(custom.flyerCreature);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKeyword = custom.keywordColor || creatureMeta.defaultKeyword;
  const isDefaultPaleKeyword =
    rawKeyword.toUpperCase() === '#FDE047' ||
    rawKeyword.toUpperCase() === '#FFF3B0' ||
    rawKeyword.toUpperCase() === '#FFD166';
  const keywordColor = isLight && isDefaultPaleKeyword ? '#D97706' : rawKeyword;

  // 1. Draw Background (Style / Green / Black)
  drawStyleBackdropAndBokeh(
    ctx,
    W,
    H,
    creature,
    accentColor,
    bgMode,
    custom.seed,
    t,
    theme,
    flightSpeed
  );

  // 2. Compute identical deterministic layout & flight plan
  const plan = buildPhraseFlyerPlan(ctx, content, timeline, custom, size);
  const { layout, direction, wordSchedules, waypoints, effective } = plan;

  const exitP = progress(t, effective.exitStart, effective.total);
  const masterAlpha = 1 - easeInCubic(exitP);

  // 3. Draw revealed words (unrevealed words have alpha = 0 so creature never covers unrevealed text)
  ctx.save();

  let schedIdx = 0;
  for (let li = 0; li < layout.lines.length; li++) {
    const line = layout.lines[li];
    for (let wi = 0; wi < line.words.length; wi++) {
      const word = line.words[wi];
      const sched = wordSchedules[schedIdx++];
      if (!sched) continue;

      const revP = progress(t, sched.revealStart, sched.revealEnd);
      if (revP <= 0.001) continue; // Completely unrevealed -> not drawn yet

      const wordEase = easeOutCubic(revP);
      const liftY = (1 - wordEase) * 6;
      const wx = word.x;
      const wy = word.y + liftY;

      ctx.save();
      applyStudioCanvasTextProps(
        ctx,
        layout.fontFamily,
        layout.fontWeight,
        word.fontSize,
        direction
      );

      if (isGreen) {
        // GREEN mode: crisp alpha step (no feathered translucent edges), white text with thin hard dark outline
        ctx.globalAlpha = revP >= 0.2 && masterAlpha > 0.2 ? 1 : 0;
        if (ctx.globalAlpha > 0) {
          const r = 2.4;
          const d = 1.7;
          const offsets: [number, number][] = [
            [-r, 0],
            [r, 0],
            [0, -r],
            [0, r],
            [-d, -d],
            [d, -d],
            [-d, d],
            [d, d],
          ];
          ctx.fillStyle = '#0B1320';
          for (let oi = 0; oi < offsets.length; oi++) {
            drawBidiWord(
              ctx,
              word.text,
              wx + offsets[oi][0],
              wy + offsets[oi][1],
              direction
            );
          }
          ctx.fillStyle = word.isKeyword ? keywordColor : '#FFFFFF';
          drawBidiWord(ctx, word.text, wx, wy, direction);
        }
      } else {
        ctx.globalAlpha = clamp(wordEase * masterAlpha, 0, 1);
        if (word.isKeyword) {
          ctx.shadowColor = hexToRgba(
            isLight ? accentColor : keywordColor,
            isBlack ? 0.65 : isLight ? 0.35 : 0.55
          );
          ctx.shadowBlur = isLight ? 12 : 16;
          ctx.fillStyle = keywordColor;
        } else {
          ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = isLight ? 6 : 8;
          ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
        }
        drawBidiWord(ctx, word.text, wx, wy, direction);
      }

      ctx.restore();
    }
  }
  ctx.restore();

  // 4. Draw deterministic path-sampled trail & flying creature
  const creatureScale = clamp(layout.fontSize / 42, 0.85, 1.38);
  drawFlyerTrail(
    ctx,
    waypoints,
    t,
    effective.exitStart,
    effective.total,
    creature,
    accentColor,
    bgMode,
    creatureScale,
    custom.seed,
    theme,
    flightSpeed
  );

  const st = sampleFlightWaypoints(waypoints, t, effective.exitStart, effective.total);
  if (st.visibleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (st.visibleAlpha > 0.2 ? 1 : 0) : st.visibleAlpha;
    if (ctx.globalAlpha > 0) {
      drawFlyerCreature({
        ctx,
        creature,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        speedNorm: st.speedNorm,
        hoverBoost: st.hoverBoost,
        t,
        scale: creatureScale,
        accentColor,
        bgMode,
        seed: custom.seed,
        theme,
        flightSpeed,
      });
    }
    ctx.restore();
  }
};

// ============================================================================
// 2) POINTS FLYER (pts_flyer) SCHEDULE, LAYOUT & RENDERER
// ============================================================================

export function buildPointsFlyerPlan(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
) {
  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_flyer',
    allowedArabicFonts: PTS_FLYER_CONFIG.allowedFonts,
    defaultArabicFont: PTS_FLYER_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_FLYER_CONFIG.defaultEnglishQuoteFont,
    fontWeight: 700,
    minFontSize: 20,
    maxFontSize: 44,
    lineHeightRatio: 1.56,
    supportedMarkerTypes: PTS_FLYER_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_FLYER_CONFIG.defaultMarkerType,
    innerPadXRatio: 0.045,
    innerPadYRatio: 0.055,
  });

  const { baseWidth: W, baseHeight: H } = size;
  const waypoints: FlightWaypoint[] = [];
  const flyLift = Math.max(20, layout.fontSize * 0.56);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const speedFactor = clamp(DEFAULT_FLYER_FLIGHT_SPEED / flightSpeed, 0.44, 2.2);

  // Entry waypoint leads smoothly into title (aligned with waveAmpX for exact C1 continuity) or directly into item 0
  const firstSlot = layout.items[0];
  const isFirstLtr = firstSlot?.direction === 'ltr';
  const readingDir = isFirstLtr ? 1 : -1;
  const centerBlockX = clamp(layout.boxX + layout.boxW * 0.5, 100, W - 100);
  const waveAmpX = clamp(layout.boxW * 0.15, 54, 145);
  const hasTitle = Boolean(layout.titleLayout && layout.titleText.length > 0);
  const titleStartX = clamp(centerBlockX + readingDir * waveAmpX * 0.68, 42, W - 42);
  const titleEndX = clamp(centerBlockX - readingDir * waveAmpX * 0.72, 42, W - 42);

  const entryX = hasTitle
    ? clamp(titleStartX + (isFirstLtr ? 46 : -46), 42, W - 42)
    : firstSlot
      ? clamp(firstSlot.markerCenterX + (isFirstLtr ? -48 : 48), 42, W - 42)
      : W * 0.5;
  const entryY = hasTitle
    ? clamp(layout.titleY - 22, 38, H - 38)
    : firstSlot
      ? clamp(firstSlot.slotY - 28, 38, H - 38)
      : H * 0.25;
  waypoints.push({ t: 0, x: entryX, y: entryY, isHover: false, keywordGlow: 0.15 });

  const pushPointsWp = (tVal: number, xVal: number, yVal: number, glow: number) => {
    const prevT = waypoints.length > 0 ? waypoints[waypoints.length - 1].t : -1;
    const safeT = Number(Math.max(tVal, prevT + 0.045).toFixed(3));
    waypoints.push({
      t: safeT,
      x: clamp(xVal, 42, W - 42),
      y: clamp(yVal, 38, H - 38),
      isHover: false,
      keywordGlow: glow,
    });
  };

  if (hasTitle) {
    const titleFlyY = clamp(layout.titleY - 14, 38, H - 38);
    pushPointsWp(0.18, titleStartX, titleFlyY - 6, 0.42);
    pushPointsWp(0.42, titleEndX, titleFlyY, 0.52);
  }

  const timing = content.pointsTiming || custom.pointsTiming;
  const wipeDur = clamp(
    timing?.flyerRevealDuration ?? 0.65 * clamp(speedFactor, 0.72, 1.38),
    0.2,
    2.2
  );

  // Poetic, ultra-calm vertical S-wave winding smoothly down through all points
  if (layout.items.length > 0) {
    const itemCount = layout.items.length;
    const firstRowY = clamp(
      layout.items[0].slotY + Math.max(10, layout.items[0].slotH * 0.22) - flyLift * 0.35,
      44,
      H - 44
    );
    const lastSlot = layout.items[itemCount - 1];
    const lastRowY = clamp(
      lastSlot.slotY + Math.max(10, lastSlot.slotH * 0.22) - flyLift * 0.35,
      44,
      H - 44
    );
    const waveStartT = layout.items[0].sched.startTime;
    const lastNextStart =
      lastSlot.sched.startTime +
      Math.max(0.75, Math.min(1.45, (schedule.exitStart - lastSlot.sched.startTime) * 0.78));
    const waveEndT = Math.max(waveStartT + 0.7, Math.min(schedule.exitStart - 0.12, lastNextStart));

    // Fewer, wider half-cycles keep the creature gliding lazily down the list without rapid lateral swings
    const totalHalfCycles = Math.max(0.85, Math.min(2.0, itemCount * 0.28));
    const sampleCount = Math.max(5, Math.round(totalHalfCycles * 4) + 1);

    for (let s = 0; s < sampleCount; s++) {
      const u = s / (sampleCount - 1);
      const st = lerp(waveStartT, waveEndT, u);
      const phase = u * Math.PI * totalHalfCycles;
      const sx = centerBlockX - readingDir * Math.cos(phase) * waveAmpX;
      const sy = lerp(firstRowY - 10, lastRowY + 14, u) - Math.sin(phase) * 8;

      // Boost glow smoothly when passing near an item with keywords
      let glow = 0.35;
      for (const slot of layout.items) {
        if (slot.layout.keywordLineRects.length > 0 && Math.abs(st - slot.sched.startTime) < 0.65) {
          glow = Math.max(glow, 0.9);
        }
      }
      pushPointsWp(st, sx, sy, glow);
    }
  }

  // Continuous ambient glide around the points container matching final row tangent (never reverses abruptly)
  if (waypoints.length > 0) {
    const lastWp = waypoints[waypoints.length - 1];
    const prevWp = waypoints.length > 1 ? waypoints[waypoints.length - 2] : lastWp;
    const centerX = clamp(layout.boxX + layout.boxW * 0.5, 80, W - 80);
    const centerY = clamp(layout.boxY + layout.boxH * 0.5, 80, H - 80);
    const rx = clamp(layout.boxW * 0.42, 86, W * 0.4);
    const ry = clamp(layout.boxH * 0.4, 60, H * 0.34);

    const relX = (lastWp.x - centerX) / Math.max(1, rx);
    const relY = (lastWp.y - centerY) / Math.max(1, ry);
    const velX = lastWp.x - prevWp.x;
    const velY = lastWp.y - prevWp.y;
    const cross = relX * velY - relY * velX;
    const angularDir = cross >= 0 ? 1 : -1;

    const startAngle =
      Math.hypot(relX, relY) < 0.35
        ? Math.atan2(velY, velX || (isFirstLtr ? 1 : -1))
        : Math.atan2(relY, relX);
    const stepTime = clamp(1.85 * speedFactor, 0.95, 2.85);
    const stepAngle = angularDir * (Math.PI * 0.22);

    let orbitT = lastWp.t + stepTime * 0.78;
    let stepIdx = 1;
    while (orbitT < schedule.totalDuration - 0.15) {
      const ang = startAngle + stepIdx * stepAngle;
      waypoints.push({
        t: Number(orbitT.toFixed(3)),
        x: clamp(centerX + Math.cos(ang) * rx, 42, W - 42),
        y: clamp(centerY + Math.sin(ang) * ry - Math.cos(stepIdx * 0.9) * 8, 38, H - 38),
        isHover: false,
        keywordGlow: 0.26,
      });
      orbitT += stepTime;
      stepIdx++;
    }

    const finalPrev = waypoints[waypoints.length - 1];
    const endT = Math.max(finalPrev.t + 0.04, schedule.totalDuration);
    const finalAng = startAngle + stepIdx * stepAngle * 0.75;
    waypoints.push({
      t: Number(endT.toFixed(3)),
      x: clamp(centerX + Math.cos(finalAng) * rx, 42, W - 42),
      y: clamp(centerY + Math.sin(finalAng) * ry - 10, 38, H - 38),
      isHover: false,
      keywordGlow: 0.2,
    });
  }

  return { schedule, layout, waypoints, wipeDur };
}

export function resolvePointsFlyerLayout(
  custom?: Pick<StyleCustomization, 'ptsFlyerLayout'> | PointsFlyerLayout
): PointsFlyerLayout {
  if (typeof custom === 'string') {
    return custom === 'horizontal-cards' ? 'horizontal-cards' : 'vertical';
  }
  return custom?.ptsFlyerLayout === 'horizontal-cards'
    ? 'horizontal-cards'
    : 'vertical';
}

export interface HorizontalCardLineSegment {
  startT: number;
  endT: number;
  fromX: number;
  toX: number;
  isPause: boolean;
}

export interface HorizontalCardLineReveal {
  lineIndex: number;
  startT: number;
  endT: number;
  startX: number;
  endX: number;
  isLtr: boolean;
  segments: HorizontalCardLineSegment[];
}

export interface HorizontalCardSlot {
  sched: ScheduledPointItem;
  index: number;
  row: number;
  colInRow: number;
  visualCol: number;
  direction: ResolvedTextDirection;
  markerText: string;
  layout: ArabicQuoteLayout;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  cardPadX: number;
  cardPadTop: number;
  cardPadBottom: number;
  badgeR: number;
  markerCenterX: number;
  markerCenterY: number;
  textX: number;
  textY: number;
  textW: number;
  textH: number;
  cardFadeStart: number;
  cardFadeEnd: number;
  badgeHoverStart: number;
  badgeHoverEnd: number;
  lineReveals: HorizontalCardLineReveal[];
  keywordSwitchTimes: Record<string, number>;
  keywordTimes: number[];
}

export interface HorizontalCardsFlyerPlan {
  schedule: ReturnType<typeof computePointsSchedule>;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  gapX: number;
  gapY: number;
  fontFamily: string;
  fontSize: number;
  titleText: string;
  titleDirection: ResolvedTextDirection;
  titleLayout: ArabicQuoteLayout | null;
  titleX: number;
  titleY: number;
  titleKeywordTimes: number[];
  cards: HorizontalCardSlot[];
  allKeywordTimes: number[];
  waypoints: FlightWaypoint[];
  calmFlight: CalmFlightPlan;
  belowMinFont: boolean;
  cameraActive: boolean;
}

export function getHorizontalLineRevealEdgeX(
  reveal: HorizontalCardLineReveal,
  t: number
): { revealed: boolean; complete: boolean; edgeX: number } {
  if (t <= reveal.startT + 0.0005) {
    return { revealed: false, complete: false, edgeX: reveal.startX };
  }
  if (t >= reveal.endT - 0.0005 || reveal.segments.length === 0) {
    return { revealed: true, complete: true, edgeX: reveal.endX };
  }
  for (let i = 0; i < reveal.segments.length; i++) {
    const seg = reveal.segments[i];
    if (t <= seg.endT) {
      if (seg.isPause) {
        return { revealed: true, complete: false, edgeX: seg.toX };
      }
      const p = easeInOutSine(progress(t, seg.startT, seg.endT));
      return {
        revealed: true,
        complete: false,
        edgeX: lerp(seg.fromX, seg.toX, p),
      };
    }
  }
  return { revealed: true, complete: true, edgeX: reveal.endX };
}

/**
 * Builds the deterministic auto-fit horizontal glass cards layout and Catmull-Rom
 * creature flight plan for pts_flyer ("بطاقات أفقية").
 * All cards share one identical FINAL size before animation so nothing jitters or overflows.
 */
export function buildHorizontalCardsFlyerPlan(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
): HorizontalCardsFlyerPlan {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems: PointsItem[] =
    content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing: PointsTimingConfig =
    content.pointsTiming || custom.pointsTiming || DEFAULT_POINTS_TIMING;

  const requestedCamMode = resolvePointsCameraMode(custom, 'pts_flyer');
  let schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_flyer', {
    cameraActive: requestedCamMode === 'follow',
  });
  const itemsCount = schedule.items.length;

  let markerType: PointsMarkerType =
    custom.pointsMarkerType || PTS_FLYER_CONFIG.defaultMarkerType;
  if (!PTS_FLYER_CONFIG.supportedMarkerTypes.includes(markerType)) {
    markerType = PTS_FLYER_CONFIG.defaultMarkerType;
  }

  const combinedText = [rawTitle, ...schedule.items.map((it) => it.item.text)].join(' ');
  const baseDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(combinedText, 'auto');

  const defaultFont =
    baseDir === 'ltr'
      ? PTS_FLYER_CONFIG.defaultEnglishQuoteFont
      : PTS_FLYER_CONFIG.defaultQuoteFont;
  let fontFamily: string = custom.quoteFontOverride || defaultFont;
  if (
    baseDir === 'rtl' &&
    custom.quoteFontOverride &&
    !PTS_FLYER_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    fontFamily = defaultFont;
  }

  // Row fit: up to 4 cards/row in 16:9, 2/row in 9:16; narrow/left/right regions use fewer cards/row
  let maxCols = custom.format === '16:9' ? 4 : 2;
  if (posBox.effectivePosition === 'left' || posBox.effectivePosition === 'right') {
    maxCols = Math.min(maxCols, posBox.boxWidth < 520 ? 1 : 2);
  }
  if (posBox.boxWidth < 460) {
    maxCols = 1;
  } else if (posBox.boxWidth < 940) {
    maxCols = Math.min(maxCols, 2);
  } else if (posBox.boxWidth < 1260) {
    maxCols = Math.min(maxCols, 3);
  }

  const cols = Math.max(1, Math.min(maxCols, Math.max(1, itemsCount)));
  const rows = Math.max(1, Math.ceil(Math.max(1, itemsCount) / cols));

  // Keep safe inner margins inside posBox (with headroom for -6px card lift + offset shadow)
  const padX = Math.max(16, Math.round(posBox.boxWidth * 0.032));
  const padY = Math.max(
    18,
    Math.round(posBox.boxHeight * (rows >= 4 ? 0.028 : 0.04))
  );
  const innerX = posBox.boxX + padX;
  const innerY = posBox.boxY + padY;
  const innerW = Math.max(180, posBox.boxWidth - padX * 2);
  const innerH = Math.max(160, posBox.boxHeight - padY * 2);

  const gapX = cols > 1 ? clamp(Math.round(innerW * 0.022), 14, 26) : 0;
  const gapY =
    rows > 1
      ? clamp(Math.round(innerH * (rows >= 4 ? 0.022 : 0.032)), 14, 26)
      : 0;
  const cardW = Math.max(120, Math.floor((innerW - gapX * (cols - 1)) / cols));

  const userMult = clamp(custom.fontSizeMultiplier || 1.0, 0.7, 1.3);
  const styleMinFont = 18;
  const effectiveMinFont = Math.max(12, Math.round(styleMinFont * Math.min(1, userMult)));
  const effectiveMaxFont = clamp(Math.round(38 * userMult), effectiveMinFont + 2, 46);
  const lineHeightRatio = 1.54;

  const titleDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(rawTitle || combinedText, 'auto');

  const evaluateCandidate = (fontSize: number) => {
    const cardPadX = clamp(Math.round(fontSize * 0.72), 12, 26);
    const cardPadTop = clamp(Math.round(fontSize * 0.56), 12, 24);
    const cardPadBottom = clamp(Math.round(fontSize * 0.62), 12, 26);
    const textAreaW = Math.max(72, cardW - cardPadX * 2);

    const hasMarker = markerType !== 'none';
    const badgeR = hasMarker ? clamp(Math.round(fontSize * 0.6), 12, 23) : 0;
    const badgeGap = hasMarker ? clamp(Math.round(fontSize * 0.42), 8, 16) : 0;
    const badgeHeaderH = hasMarker ? badgeR * 2 + badgeGap : 0;

    let titleLayout: ArabicQuoteLayout | null = null;
    let titleBlockH = 0;
    const titleBoxW = Math.max(160, innerW - 12);
    if (rawTitle.length > 0) {
      const titleMaxFs = clamp(Math.round(fontSize * 1.18), 14, 48);
      const titleMinFs = Math.max(13, Math.round(titleMaxFs * 0.74));
      titleLayout = layoutArabicQuote(ctx, {
        text: rawTitle,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 800,
        minFontSize: titleMinFs,
        maxFontSize: titleMaxFs,
        fontSizeMultiplier: 1.0,
        lineHeightRatio: 1.42,
        boxX: 0,
        boxY: 0,
        boxWidth: titleBoxW,
        boxHeight: Math.max(48, Math.round(innerH * 0.19)),
        align: titleDir === 'ltr' ? 'left' : 'right',
        direction: titleDir,
        verticalAlign: 'top',
      });
      titleBlockH =
        titleLayout.totalHeight + clamp(Math.round(fontSize * 0.58), 12, 26);
    }

    // Reserve 8px top headroom so the -6px active card lift never touches posBox.boxY
    const availGridH = innerH - titleBlockH - 8;
    const maxCardH = Math.floor((availGridH - gapY * (rows - 1)) / rows);
    const maxTextH = maxCardH - cardPadTop - badgeHeaderH - cardPadBottom;

    const itemLayouts: {
      sched: ScheduledPointItem;
      dir: ResolvedTextDirection;
      markerText: string;
      layout: ArabicQuoteLayout;
    }[] = [];

    let maxItemTextH = 0;
    let maxItemLineW = 0;

    for (let i = 0; i < schedule.items.length; i++) {
      const sched = schedule.items[i];
      const itemDir: ResolvedTextDirection =
        custom.textDirection && custom.textDirection !== 'auto'
          ? custom.textDirection
          : detectTextDirection(sched.item.text, 'auto');
      const markerText = formatPointMarker(i, markerType);
      const itemLayout = layoutArabicQuote(ctx, {
        text: sched.item.text,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 700,
        minFontSize: fontSize,
        maxFontSize: fontSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: textAreaW,
        boxHeight: Math.max(40, maxTextH),
        align: itemDir === 'ltr' ? 'left' : 'right',
        direction: itemDir,
        verticalAlign: 'top',
      });
      maxItemTextH = Math.max(maxItemTextH, itemLayout.totalHeight);
      maxItemLineW = Math.max(maxItemLineW, itemLayout.maxLineWidth);
      itemLayouts.push({ sched, dir: itemDir, markerText, layout: itemLayout });
    }

    const titleFits = !titleLayout || titleLayout.maxLineWidth <= titleBoxW + 1;
    const fits =
      maxCardH >= cardPadTop + badgeHeaderH + cardPadBottom + fontSize * 1.35 &&
      maxItemTextH <= maxTextH + 0.5 &&
      maxItemLineW <= textAreaW + 1 &&
      titleFits;

    return {
      fits,
      fontSize,
      cardPadX,
      cardPadTop,
      cardPadBottom,
      textAreaW,
      badgeR,
      badgeHeaderH,
      titleLayout,
      titleBlockH,
      maxCardH,
      maxItemTextH,
      itemLayouts,
    };
  };

  // Binary search inside [effectiveMinFont, effectiveMaxFont]
  let low = effectiveMinFont;
  let high = effectiveMaxFont;
  let best = evaluateCandidate(low);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cand = evaluateCandidate(mid);
    if (cand.fits) {
      best = cand;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Safety floor decrement down to 10px for ultra-long text with diacritics in narrow regions
  if (!best.fits) {
    for (let fs = effectiveMinFont - 1; fs >= 10; fs--) {
      const cand = evaluateCandidate(fs);
      best = cand;
      if (cand.fits) break;
    }
  }

  const belowMinFont = best.fontSize < styleMinFont;
  const cameraActive = isPointsCameraActive(custom, 'pts_flyer', belowMinFont);
  if (cameraActive && requestedCamMode === 'auto') {
    schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_flyer', {
      cameraActive: true,
    });
    for (let i = 0; i < best.itemLayouts.length && i < schedule.items.length; i++) {
      best.itemLayouts[i].sched = schedule.items[i];
    }
  }

  // Uniform final card height shared by EVERY card from frame 0
  const neededCardH = Math.ceil(
    best.cardPadTop + best.badgeHeaderH + best.maxItemTextH + best.cardPadBottom
  );
  const targetComfortableH = Math.round(neededCardH * 1.1 + 10);
  const safeMaxCardH = Math.max(neededCardH, best.maxCardH);
  const cardH = Math.min(
    best.maxCardH > 0 ? best.maxCardH : neededCardH,
    clamp(targetComfortableH, neededCardH, safeMaxCardH)
  );

  const totalGridW = cols * cardW + (cols - 1) * gapX;
  const totalGridH = rows * cardH + (rows - 1) * gapY;
  const liftHeadroom = 6;
  const totalContentH = best.titleBlockH + liftHeadroom + totalGridH;

  const gridStartX = innerX + Math.round((innerW - totalGridW) / 2);
  const rawContentTopY = innerY + Math.round((innerH - totalContentH) / 2);
  const maxContentTopY = Math.max(
    posBox.boxY + 10,
    posBox.boxY + posBox.boxHeight - 10 - totalContentH
  );
  const contentTopY = clamp(rawContentTopY, posBox.boxY + 10, maxContentTopY);
  const titleX = gridStartX;
  const titleY = contentTopY;
  const gridStartY = contentTopY + best.titleBlockH + liftHeadroom;

  // Title keyword event times (revealed first with title)
  const titleKeywordTimes: number[] = [];
  if (best.titleLayout) {
    const seen = new Set<number>();
    for (const rect of best.titleLayout.keywordLineRects) {
      if (seen.has(rect.groupId)) continue;
      seen.add(rect.groupId);
      const frac =
        titleDir === 'ltr'
          ? clamp(rect.leftX / Math.max(1, best.titleLayout.boxWidth), 0.1, 0.9)
          : clamp(
              (best.titleLayout.boxWidth - rect.rightX) /
                Math.max(1, best.titleLayout.boxWidth),
              0.1,
              0.9
            );
      titleKeywordTimes.push(Number((0.08 + frac * 0.35).toFixed(3)));
    }
  }

  // Build final uniform card geometry in RTL reading order (row-major, first card on the RIGHT)
  const cards: HorizontalCardSlot[] = [];
  for (let i = 0; i < best.itemLayouts.length; i++) {
    const item = best.itemLayouts[i];
    const row = Math.floor(i / cols);
    const colInRow = i % cols;
    // RTL reading order: card 0 of each row sits on the RIGHT (visualCol = cols - 1)
    const visualCol = cols - 1 - colInRow;
    const cardX = gridStartX + visualCol * (cardW + gapX);
    const cardY = gridStartY + row * (cardH + gapY);

    const textExtraY = Math.max(
      0,
      Math.round(
        (cardH - (best.cardPadTop + best.badgeHeaderH + item.layout.totalHeight + best.cardPadBottom)) *
          0.32
      )
    );
    const textX = cardX + best.cardPadX;
    const textY = cardY + best.cardPadTop + best.badgeHeaderH + textExtraY;
    const textH = Math.max(
      item.layout.totalHeight,
      cardH - best.cardPadTop - best.badgeHeaderH - best.cardPadBottom
    );

    const isItemLtr = item.dir === 'ltr';
    const markerCenterX =
      best.badgeR > 0
        ? isItemLtr
          ? cardX + best.cardPadX + best.badgeR
          : cardX + cardW - best.cardPadX - best.badgeR
        : isItemLtr
          ? cardX + best.cardPadX + 12
          : cardX + cardW - best.cardPadX - 12;
    const markerCenterY =
      best.badgeR > 0
        ? cardY + best.cardPadTop + best.badgeR
        : textY + Math.round(best.fontSize * 0.45);

    cards.push({
      sched: item.sched,
      index: i,
      row,
      colInRow,
      visualCol,
      direction: item.dir,
      markerText: item.markerText,
      layout: item.layout,
      cardX,
      cardY,
      cardW,
      cardH,
      cardPadX: best.cardPadX,
      cardPadTop: best.cardPadTop,
      cardPadBottom: best.cardPadBottom,
      badgeR: best.badgeR,
      markerCenterX,
      markerCenterY,
      textX,
      textY,
      textW: best.textAreaW,
      textH,
      cardFadeStart: Math.max(0.02, item.sched.startTime - 0.18),
      cardFadeEnd: item.sched.startTime + 0.16,
      badgeHoverStart: item.sched.startTime,
      badgeHoverEnd: item.sched.startTime + 0.12,
      lineReveals: [],
      keywordSwitchTimes: {},
      keywordTimes: [],
    });
  }

  // ============================================================================
  // SCHEDULE-DRIVEN TEXT REVEAL (DECOUPLED FROM CREATURE) + CALM CREATURE FLIGHT
  // ============================================================================
  const calmSpeed = resolveCalmFlyerSpeed(custom);
  // Reveal duration comes purely from existing timing sliders (never depends on creature speed)
  const revealBudgetPerCard = clamp(timing?.flyerRevealDuration ?? 0.65, 0.25, 1.8);
  const allKeywordTimes: number[] = [...titleKeywordTimes];
  const calmStops: CalmFlightStop[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const startT = card.sched.startTime;
    const nextStart =
      i + 1 < cards.length
        ? cards[i + 1].sched.startTime
        : Math.max(startT + 0.55, schedule.exitStart - 0.8); // Keep >= 0.8s full visibility at end
    const availForCard = Math.max(
      0.32,
      Math.min(
        nextStart - startT - (i + 1 < cards.length ? 0.08 : 0.02),
        schedule.exitStart - 0.8 - startT
      )
    );

    card.cardFadeStart = Math.max(0.02, startT - 0.22);
    card.cardFadeEnd = startT + 0.18;
    card.badgeHoverStart = startT;
    card.badgeHoverEnd = startT + 0.18;

    const lines = card.layout.lines;
    const isCardLtr = card.direction === 'ltr';
    const textStartT = startT + 0.06;
    const totalRevealSpan = clamp(
      revealBudgetPerCard * clamp(1 + (lines.length - 1) * 0.28, 1, 1.65),
      0.24,
      Math.max(0.24, availForCard)
    );
    const lineGap = lines.length > 1 ? Math.min(0.05, (totalRevealSpan * 0.12) / lines.length) : 0;
    const activeRevealBudget = Math.max(
      0.18,
      totalRevealSpan - lineGap * Math.max(0, lines.length - 1)
    );
    const lineWeights = lines.map((line) => Math.max(0.35, line.width / Math.max(1, card.textW)));
    const totalLineWeight = lineWeights.reduce((acc, w) => acc + w, 0) || 1;

    let lineCurT = textStartT;
    const kwTargets: CalmFlightKeywordTarget[] = [];

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineDur = Math.max(0.1, (activeRevealBudget * lineWeights[li]) / totalLineWeight);
      const lineEndT = lineCurT + lineDur;
      const absLeftX = card.textX + line.leftX;
      const absRightX = card.textX + line.rightX;
      const lineStartX = isCardLtr ? absLeftX : absRightX;
      const lineEndX = isCardLtr ? absRightX : absLeftX;

      card.lineReveals.push({
        lineIndex: li,
        startT: lineCurT,
        endT: lineEndT,
        startX: lineStartX,
        endX: lineEndX,
        isLtr: isCardLtr,
        segments: [
          {
            startT: lineCurT,
            endT: lineEndT,
            fromX: lineStartX,
            toX: lineEndX,
            isPause: false,
          },
        ],
      });

      // Schedule gentle keyword highlight & ~0.8 s creature circle after the keyword reveals
      const lineKwRects = card.layout.keywordLineRects
        .filter((r) => r.lineIndex === li)
        .sort((a, b) => (isCardLtr ? a.leftX - b.leftX : b.rightX - a.rightX));
      for (let ki = 0; ki < lineKwRects.length; ki++) {
        const kw = lineKwRects[ki];
        const absKwLeft = card.textX + kw.leftX;
        const absKwRight = card.textX + kw.rightX;
        const frac = clamp(
          isCardLtr
            ? (absKwRight - absLeftX) / Math.max(1, absRightX - absLeftX)
            : (absRightX - absKwLeft) / Math.max(1, absRightX - absLeftX),
          0.18,
          0.95
        );
        const switchTime = Number(lerp(lineCurT, lineEndT, frac).toFixed(3));
        card.keywordSwitchTimes[`${li}:${kw.groupId}`] = switchTime;
        card.keywordTimes.push(switchTime);
        allKeywordTimes.push(switchTime);

        kwTargets.push({
          cx: (absKwLeft + absKwRight) * 0.5,
          cy: card.textY + (kw.topY + kw.bottomY) * 0.5,
          rx: clamp(kw.width * 0.54 + 10, 16, 56),
          ry: clamp((kw.bottomY - kw.topY) * 0.62 + 8, 12, 26),
          startTime: Math.max(lineEndT, switchTime),
          duration: 0.8,
        });
      }

      lineCurT = lineEndT + lineGap;
    }

    const cardRevealEnd = lines.length > 0 ? card.lineReveals[lines.length - 1].endT : startT + 0.3;
    const nodeBox = { x: card.cardX, y: card.cardY, w: card.cardW, h: card.cardH };
    const textBox = { x: card.textX, y: card.textY, w: card.textW, h: card.textH };
    const anchor = computeCalmStopAnchor(nodeBox, textBox, W, H);

    // Leave hopControlPoint undefined so buildCalmFlightPlan computes sculpted
    // asymmetric Cubic Bézier butterfly arcs (same-row swoops & row-descent S-arcs)
    calmStops.push({
      id: card.sched.item.id || `card-${i}`,
      activeStart: startT,
      activeEnd: nextStart,
      anchor,
      nodeBox,
      textBox,
      textRevealStart: textStartT,
      textRevealEnd: cardRevealEnd,
      keywords: kwTargets,
    });
  }

  const calmFlight = buildCalmFlightPlan({
    stops: calmStops,
    calmSpeed,
    totalDuration: schedule.totalDuration,
    exitStart: schedule.exitStart,
    W,
    H,
    seed: custom.seed,
  });

  // Expose legacy waypoints array populated from calmFlight samples for backwards-compatible inspection
  const waypoints: FlightWaypoint[] = calmFlight.samples.map((s) => ({
    t: Number(s.t.toFixed(3)),
    x: s.x,
    y: s.y,
    isHover: false,
    keywordGlow: s.hoverBoost,
  }));

  allKeywordTimes.sort((a, b) => a - b);

  return {
    schedule,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxW: posBox.boxWidth,
    boxH: posBox.boxHeight,
    effectivePosition: posBox.effectivePosition,
    cols,
    rows,
    cardW,
    cardH,
    gapX,
    gapY,
    fontFamily,
    fontSize: best.fontSize,
    titleText: rawTitle,
    titleDirection: titleDir,
    titleLayout: best.titleLayout,
    titleX,
    titleY,
    titleKeywordTimes,
    cards,
    allKeywordTimes,
    waypoints,
    calmFlight,
    belowMinFont,
    cameraActive,
  };
}

function renderPtsFlyerHorizontalCards(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): void {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';
  const creature = resolveFlyerCreature(custom.flyerCreature);
  const calmSpeed = resolveCalmFlyerSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKeyword = custom.keywordColor || creatureMeta.defaultKeyword;
  const isDefaultPaleKeyword =
    rawKeyword.toUpperCase() === '#FDE047' ||
    rawKeyword.toUpperCase() === '#FFF3B0' ||
    rawKeyword.toUpperCase() === '#FFD166';
  const keywordColor = isLight && isDefaultPaleKeyword ? '#D97706' : rawKeyword;
  const primaryTextColor = isGreen
    ? '#FFFFFF'
    : isBlack
      ? '#FFFFFF'
      : isLight
        ? '#0F172A'
        : '#F8FAFC';

  // 1. Background (Style / Green / Black)
  drawStyleBackdropAndBokeh(
    ctx,
    W,
    H,
    creature,
    accentColor,
    bgMode,
    custom.seed,
    t,
    theme,
    calmSpeed
  );

  // 2. Deterministic final-size layout & calm decoupled creature flight plan
  const plan = buildHorizontalCardsFlyerPlan(ctx, content, custom, size);
  const { schedule, cards, calmFlight } = plan;
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);

  // Content-layer-only Points camera (backdrop stays completely static)
  const camItems: PointsCameraItemBox[] = cards.map((card) => ({
    x: card.cardX,
    y: card.cardY - 8,
    w: card.cardW,
    h: card.cardH + 12,
    startTime: card.sched.startTime,
    revealEnd: card.sched.revealEnd,
  }));
  const titleCamBox =
    plan.titleLayout && plan.titleText.length > 0
      ? {
          x: plan.titleX,
          y: plan.titleY,
          w: plan.titleLayout.boxWidth,
          h: plan.titleLayout.totalHeight,
        }
      : null;
  const fullBounds = computeUnionBox([
    ...(titleCamBox ? [titleCamBox] : []),
    ...camItems,
  ]);
  const viewportBox = {
    x: plan.boxX,
    y: plan.boxY,
    w: plan.boxW,
    h: plan.boxH,
  };
  const cam = samplePointsCamera({
    items: camItems,
    fullBounds,
    viewportBox,
    frameW: W,
    frameH: H,
    schedule,
    zoom: resolvePointsCameraZoom(custom),
    t,
    active: plan.cameraActive,
    titleBox: titleCamBox,
  });

  withPointsCameraLayer(ctx, cam, { frameW: W, frameH: H, pixelScale: size.scale, bgMode }, (ctx) => {

  // 3. Optional Title (revealed first above the cards)
  if (plan.titleLayout && plan.titleText.length > 0) {
    const titleP = easeOutCubic(progress(t, 0.08, 0.45));
    if (titleP > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen
        ? titleP > 0.25 && masterAlpha > 0.25
          ? 1
          : 0
        : titleP * masterAlpha;
      if (ctx.globalAlpha > 0) {
        drawPointTextWithWipeAndKeywords({
          ctx,
          layout: plan.titleLayout,
          originX: plan.titleX,
          originY: plan.titleY,
          wipeProgress: titleP,
          textColor: primaryTextColor,
          keywordColor,
          underlineKeywords: true,
          outlineColor: isGreen ? '#0B1320' : undefined,
          outlineWidth: isGreen ? 2.4 : undefined,
        });
      }
      ctx.restore();
    }
  }

  // 4. Horizontal Glass Cards (all uniform final size, RTL row-major)
  const highlightCurrent = custom.pointsHighlightCurrent !== false;
  const cardRadius = clamp(Math.round(plan.fontSize * 0.62), 14, 22);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (t <= card.cardFadeStart + 0.0005) continue;

    const approachP = easeOutCubic(
      progress(t, card.cardFadeStart, card.cardFadeEnd)
    );
    if (approachP <= 0.001) continue;

    const nextStart =
      i + 1 < cards.length ? cards[i + 1].sched.startTime : Infinity;
    const leaveActiveP =
      i + 1 < cards.length
        ? easeOutCubic(progress(t, nextStart, nextStart + 0.25))
        : 0;
    const activeFocusP = clamp(approachP * (1 - leaveActiveP), 0, 1);

    // Current card lifts slightly (-6 px); previous cards dim to ~45% when highlightCurrent is enabled
    const liftY = -6 * activeFocusP;
    const cardScale = lerp(0.96, 1.0, approachP);
    const dimAlpha = getPointHighlightAlpha(
      t,
      i,
      schedule.items,
      highlightCurrent,
      0.45
    );
    const isDimmedInGreen = isGreen && highlightCurrent && leaveActiveP > 0.5;

    const cx = card.cardX + card.cardW * 0.5;
    const cy = card.cardY + card.cardH * 0.5;

    ctx.save();
    if (isGreen) {
      ctx.globalAlpha = approachP >= 0.2 && masterAlpha > 0.2 ? 1 : 0;
    } else {
      ctx.globalAlpha = clamp(approachP * dimAlpha * masterAlpha, 0, 1);
    }

    if (ctx.globalAlpha > 0) {
      ctx.translate(cx, cy + liftY);
      ctx.scale(cardScale, cardScale);
      ctx.translate(-cx, -cy);

      // 4a. Card Container Surface
      if (isGreen) {
        // GREEN: flat opaque card with hard offset shadow & hard 2px border, zero glow/shadowBlur
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Hard offset shadow (+6, +6)
        ctx.fillStyle = '#070B14';
        ctx.beginPath();
        ctx.roundRect(
          card.cardX + 6,
          card.cardY + 6,
          card.cardW,
          card.cardH,
          cardRadius
        );
        ctx.fill();

        // Flat opaque card fill
        ctx.fillStyle = isDimmedInGreen ? '#162033' : '#0F172A';
        ctx.beginPath();
        ctx.roundRect(card.cardX, card.cardY, card.cardW, card.cardH, cardRadius);
        ctx.fill();

        // Hard 2px border
        ctx.strokeStyle = activeFocusP > 0.3 ? accentColor : isDimmedInGreen ? '#64748B' : '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (isBlack) {
        // BLACK: outlined bright cards with bright text, NO dark fills
        ctx.save();
        if (activeFocusP > 0.05) {
          ctx.shadowColor = hexToRgba(accentColor, 0.45 * activeFocusP);
          ctx.shadowBlur = 16 * activeFocusP;
        }
        ctx.strokeStyle =
          activeFocusP > 0.15
            ? accentColor
            : 'rgba(248, 250, 252, 0.58)';
        ctx.lineWidth = lerp(1.5, 2.25, activeFocusP);
        ctx.beginPath();
        ctx.roundRect(card.cardX, card.cardY, card.cardW, card.cardH, cardRadius);
        ctx.stroke();
        ctx.restore();
      } else {
        // STYLE: rounded glass card (thin light border, soft shadow, faint accent gradient)
        ctx.save();
        ctx.shadowColor = isLight
          ? activeFocusP > 0.15
            ? hexToRgba(accentColor, 0.24 * activeFocusP)
            : 'rgba(15, 23, 42, 0.10)'
          : activeFocusP > 0.15
            ? hexToRgba(accentColor, 0.34 * activeFocusP)
            : 'rgba(0, 0, 0, 0.36)';
        ctx.shadowBlur = activeFocusP > 0.15 ? 24 : 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = activeFocusP > 0.15 ? 10 : 7;

        const glassGrad = ctx.createLinearGradient(
          card.cardX,
          card.cardY,
          card.cardX + card.cardW,
          card.cardY + card.cardH
        );
        if (isLight) {
          glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.90)');
          glassGrad.addColorStop(0.55, hexToRgba(accentColor, 0.08));
          glassGrad.addColorStop(1, 'rgba(248, 250, 252, 0.78)');
        } else {
          glassGrad.addColorStop(0, 'rgba(22, 33, 56, 0.72)');
          glassGrad.addColorStop(0.5, hexToRgba(accentColor, 0.12));
          glassGrad.addColorStop(1, 'rgba(12, 19, 36, 0.62)');
        }
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.roundRect(card.cardX, card.cardY, card.cardW, card.cardH, cardRadius);
        ctx.fill();
        ctx.restore();

        // Subtle glass top-edge accent sheen
        const sheenGrad = ctx.createLinearGradient(
          card.cardX,
          card.cardY,
          card.cardX,
          card.cardY + Math.min(44, card.cardH * 0.34)
        );
        sheenGrad.addColorStop(
          0,
          isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.09)'
        );
        sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sheenGrad;
        ctx.beginPath();
        ctx.roundRect(card.cardX, card.cardY, card.cardW, card.cardH, cardRadius);
        ctx.fill();

        // Thin light border (brighter on active card)
        ctx.strokeStyle = isLight
          ? hexToRgba(accentColor, lerp(0.24, 0.56, activeFocusP))
          : activeFocusP > 0.15
            ? hexToRgba(accentColor, lerp(0.26, 0.64, activeFocusP))
            : 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = lerp(1.15, 1.75, activeFocusP);
        ctx.beginPath();
        ctx.roundRect(card.cardX, card.cardY, card.cardW, card.cardH, cardRadius);
        ctx.stroke();
      }

      // 4b. Top Marker Badge (blooms as the creature hovers over it)
      if (card.markerText && card.badgeR > 0 && t >= card.badgeHoverStart - 0.04) {
        const bloomDur = Math.max(
          0.18,
          card.badgeHoverEnd - card.badgeHoverStart + 0.08
        );
        const bloomP = progress(t, card.badgeHoverStart - 0.03, card.badgeHoverStart + bloomDur);
        const badgeScale = easeOutBack(bloomP, 1.85);
        const isHoveringBadge =
          t >= card.badgeHoverStart - 0.02 && t <= card.badgeHoverEnd + 0.16;
        const hoverGlowP = isHoveringBadge
          ? Math.sin(
              progress(t, card.badgeHoverStart - 0.02, card.badgeHoverEnd + 0.16) *
                Math.PI
            )
          : 0;

        ctx.save();
        ctx.translate(card.markerCenterX, card.markerCenterY);
        ctx.scale(badgeScale, badgeScale);

        if (!isGreen && hoverGlowP > 0.02) {
          ctx.save();
          ctx.shadowColor = hexToRgba(accentColor, 0.65 * hoverGlowP);
          ctx.shadowBlur = 18 * hoverGlowP;
          ctx.strokeStyle = hexToRgba(accentColor, 0.52 * hoverGlowP);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, card.badgeR + 4 * hoverGlowP, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (isGreen) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = isDimmedInGreen ? '#475569' : accentColor;
          ctx.beginPath();
          ctx.arc(0, 0, card.badgeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#070B14';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isBlack) {
          // Outlined bright badge, no dark fill
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, card.badgeR, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = hexToRgba(accentColor, isLight ? 0.16 : 0.22);
          ctx.beginPath();
          ctx.arc(0, 0, card.badgeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        ctx.font = `800 ${Math.round(plan.fontSize * 0.72)}px "${plan.fontFamily}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isGreen
          ? '#070B14'
          : isBlack
            ? '#FFFFFF'
            : isLight
              ? '#0F172A'
              : '#FFFFFF';
        ctx.fillText(card.markerText, 0, 1);
        ctx.restore();
      }

      // 4c. Schedule-Driven Soft Feathered RTL Clip Reveal (decoupled from creature; Arabic letters stay connected)
      const cardTextColor = isDimmedInGreen ? '#CBD5E1' : primaryTextColor;
      const cardKeywordColor = isDimmedInGreen ? '#E2C675' : keywordColor;

      for (let li = 0; li < card.layout.lines.length; li++) {
        const line = card.layout.lines[li];
        const reveal = card.lineReveals[li];
        if (!reveal) continue;

        const revealP = easeInOutSine(progress(t, reveal.startT, reveal.endT));
        if (revealP <= 0.005) continue;

        drawFeatheredScheduleLine({
          ctx,
          line,
          originX: card.textX,
          originY: card.textY,
          revealProgress: revealP,
          isLtr: reveal.isLtr,
          isGreen,
          fontFamily: card.layout.fontFamily,
          fontWeight: card.layout.fontWeight,
          fontSize: plan.fontSize,
          direction: card.direction,
          textColor: cardTextColor,
          keywordColor: cardKeywordColor,
          isKeywordActive: (word) => {
            if (!word.isKeyword || word.groupId === null) return false;
            const switchT =
              card.keywordSwitchTimes[`${li}:${word.groupId}`] ?? card.sched.startTime;
            return t >= switchT;
          },
          drawUnderline: (targetCtx, offX, offY) => {
            for (let ki = 0; ki < card.layout.keywordLineRects.length; ki++) {
              const rect = card.layout.keywordLineRects[ki];
              if (rect.lineIndex !== li) continue;
              const switchT =
                card.keywordSwitchTimes[`${li}:${rect.groupId}`] ?? card.sched.startTime;
              if (t < switchT) continue;

              const ulP = easeOutCubic(progress(t, switchT, switchT + 0.18));
              if (ulP <= 0.01) continue;

              const ulY =
                card.textY + rect.baselineY + Math.max(5, plan.fontSize * 0.24) - offY;
              const xStart =
                (reveal.isLtr ? card.textX + rect.leftX : card.textX + rect.rightX) - offX;
              const xTarget =
                (reveal.isLtr ? card.textX + rect.rightX : card.textX + rect.leftX) - offX;
              const xCur = lerp(xStart, xTarget, ulP);

              targetCtx.save();
              targetCtx.strokeStyle = cardKeywordColor;
              targetCtx.lineWidth = isGreen ? 2 : Math.max(1.8, plan.fontSize * 0.068);
              targetCtx.lineCap = 'round';
              targetCtx.shadowBlur = 0;
              targetCtx.beginPath();
              targetCtx.moveTo(xStart, ulY);
              targetCtx.lineTo(xCur, ulY);
              targetCtx.stroke();
              targetCtx.restore();
            }
          },
        });
      }
    }

    ctx.restore();
  }

  // 5. Shorter, fainter calm trail (N <= 24) & Calm Drifting Creature
  const creatureScale = clamp(plan.fontSize / 34, 0.78, 1.24);
  drawCalmFlyerTrail(
    ctx,
    calmFlight,
    t,
    creature,
    accentColor,
    bgMode,
    creatureScale,
    custom.seed,
    theme
  );

  const st = sampleCalmFlight(calmFlight, t);
  if (st.visibleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (st.visibleAlpha > 0.2 ? 1 : 0) : st.visibleAlpha;
    if (ctx.globalAlpha > 0) {
      drawFlyerCreature({
        ctx,
        creature,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        speedNorm: st.speedNorm,
        hoverBoost: st.hoverBoost,
        t,
        scale: creatureScale,
        accentColor,
        bgMode,
        seed: custom.seed,
        theme,
        flightSpeed: calmSpeed,
        calmMode: true,
      });
    }
    ctx.restore();
  }

  }); // End Points camera content layer
}

export function getPtsFlyerEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  if (resolvePointsFlyerLayout(custom) === 'horizontal-cards') {
    const plan = buildHorizontalCardsFlyerPlan(ctx, content, custom, size);
    return {
      enterStart: 0.08,
      itemTimes: plan.schedule.itemTimes,
      keywordTimes: plan.allKeywordTimes,
    };
  }
  const { schedule, layout } = buildPointsFlyerPlan(ctx, content, custom, size);
  return {
    enterStart: 0.08,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

export const renderPtsFlyer: PureStyleRenderer = (
  ctx,
  t,
  content,
  _timeline,
  custom,
  size
) => {
  if (resolvePointsFlyerLayout(custom) === 'horizontal-cards') {
    renderPtsFlyerHorizontalCards(ctx, t, content, _timeline, custom, size);
    return;
  }
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';
  const creature = resolveFlyerCreature(custom.flyerCreature);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKeyword = custom.keywordColor || creatureMeta.defaultKeyword;
  const isDefaultPaleKeyword =
    rawKeyword.toUpperCase() === '#FDE047' ||
    rawKeyword.toUpperCase() === '#FFF3B0' ||
    rawKeyword.toUpperCase() === '#FFD166';
  const keywordColor = isLight && isDefaultPaleKeyword ? '#D97706' : rawKeyword;
  const primaryTextColor = isGreen ? '#FFFFFF' : isLight ? '#0F172A' : '#F8FAFC';

  // 1. Background
  drawStyleBackdropAndBokeh(
    ctx,
    W,
    H,
    creature,
    accentColor,
    bgMode,
    custom.seed,
    t,
    theme,
    flightSpeed
  );

  // 2. Layout & Flight Plan
  const { schedule, layout, waypoints, wipeDur } = buildPointsFlyerPlan(ctx, content, custom, size);
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);

  // Content-layer-only Points camera (backdrop & bokeh stay completely fixed)
  const camItems: PointsCameraItemBox[] = layout.items.map((slot) => ({
    x: slot.slotX,
    y: slot.slotY,
    w: slot.slotW,
    h: slot.slotH,
    startTime: slot.sched.startTime,
    revealEnd: slot.sched.revealEnd,
  }));
  const titleOriginX = layout.boxX + Math.round(layout.boxW * 0.04);
  const titleCamBox =
    layout.titleLayout && layout.titleText.length > 0
      ? {
          x: titleOriginX,
          y: layout.titleY,
          w: layout.titleLayout.boxWidth,
          h: layout.titleLayout.totalHeight,
        }
      : null;
  const fullBounds = computeUnionBox([
    ...(titleCamBox ? [titleCamBox] : []),
    ...camItems,
  ]);
  const viewportBox = {
    x: layout.boxX,
    y: layout.boxY,
    w: layout.boxW,
    h: layout.boxH,
  };
  const cam = samplePointsCamera({
    items: camItems,
    fullBounds,
    viewportBox,
    frameW: W,
    frameH: H,
    schedule,
    zoom: resolvePointsCameraZoom(custom),
    t,
    active: isPointsCameraActive(custom, 'pts_flyer', layout.fontSize < 20),
    titleBox: titleCamBox,
  });

  withPointsCameraLayer(ctx, cam, { frameW: W, frameH: H, pixelScale: size.scale, bgMode }, (ctx) => {

  // 3. Optional Title
  if (layout.titleLayout && layout.titleText.length > 0) {
    const titleP = easeOutCubic(progress(t, 0.08, 0.45));
    if (titleP > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen ? (titleP > 0.25 && masterAlpha > 0.25 ? 1 : 0) : titleP * masterAlpha;
      if (ctx.globalAlpha > 0) {
        const titleOriginX = layout.boxX + Math.round(layout.boxW * 0.04);
        drawPointTextWithWipeAndKeywords({
          ctx,
          layout: layout.titleLayout,
          originX: titleOriginX,
          originY: layout.titleY,
          wipeProgress: titleP,
          textColor: primaryTextColor,
          keywordColor,
          underlineKeywords: true,
          outlineColor: isGreen ? '#0B1320' : undefined,
          outlineWidth: isGreen ? 2.5 : undefined,
        });
      }
      ctx.restore();
    }
  }

  // 4. Reveal Points Items (unrevealed items are completely hidden so creature never covers unrevealed text)
  const highlightCurrent = custom.pointsHighlightCurrent !== false;

  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const itemT = t - slot.sched.startTime;
    if (itemT <= 0.001) continue; // Unrevealed point -> not drawn yet

    const revealP = easeOutCubic(clamp(itemT / wipeDur, 0, 1));
    const nextStart =
      i + 1 < layout.items.length ? layout.items[i + 1].sched.startTime : Infinity;
    const dimP =
      highlightCurrent && t >= nextStart
        ? easeOutCubic(clamp((t - nextStart) / 0.25, 0, 1))
        : 0;
    const itemAlpha = lerp(1, 0.58, dimP) * revealP * masterAlpha;

    ctx.save();
    ctx.globalAlpha = isGreen ? (revealP > 0.2 && masterAlpha > 0.2 ? 1 : 0) : itemAlpha;

    if (ctx.globalAlpha > 0) {
      // Subtle translucent row backing in style/black mode
      if (!isGreen) {
        ctx.fillStyle = isBlack
          ? 'rgba(255, 255, 255, 0.045)'
          : isLight
            ? 'rgba(255, 255, 255, 0.82)'
            : 'rgba(15, 23, 42, 0.38)';
        ctx.beginPath();
        ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, 12);
        ctx.fill();
        if (isLight) {
          ctx.strokeStyle = hexToRgba(accentColor, 0.32);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // Marker badge / number
      if (slot.markerText) {
        const markerDur = Math.min(0.45, Math.max(0.22, wipeDur * 0.78));
        const markerScale = easeOutBack(clamp(itemT / markerDur, 0, 1));
        ctx.save();
        ctx.translate(slot.markerCenterX, slot.markerCenterY);
        ctx.scale(markerScale, markerScale);
        const badgeR = Math.max(14, Math.round(layout.fontSize * 0.58));

        ctx.fillStyle = isGreen
          ? accentColor
          : hexToRgba(accentColor, isLight ? 0.18 : 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isGreen ? '#0B1320' : accentColor;
        ctx.lineWidth = isGreen ? 2.2 : 1.6;
        ctx.stroke();

        ctx.font = `800 ${Math.round(layout.fontSize * 0.68)}px "${layout.fontFamily}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isGreen ? '#0B1320' : isLight ? '#0F172A' : '#FFFFFF';
        ctx.fillText(slot.markerText, 0, 1);
        ctx.restore();
      }

      // Item text words with horizontal wipe & connected Arabic ligatures
      drawPointTextWithWipeAndKeywords({
        ctx,
        layout: slot.layout,
        originX: slot.textX,
        originY: slot.textY,
        wipeProgress: revealP,
        textColor: primaryTextColor,
        keywordColor,
        underlineKeywords: true,
        outlineColor: isGreen ? '#0B1320' : undefined,
        outlineWidth: isGreen ? 2.4 : undefined,
      });
    }

    ctx.restore();
  }

  // 5. Trail & Flying Creature
  const creatureScale = clamp(layout.fontSize / 34, 0.85, 1.32);
  drawFlyerTrail(
    ctx,
    waypoints,
    t,
    schedule.exitStart,
    schedule.totalDuration,
    creature,
    accentColor,
    bgMode,
    creatureScale,
    custom.seed,
    theme,
    flightSpeed
  );

  const st = sampleFlightWaypoints(
    waypoints,
    t,
    schedule.exitStart,
    schedule.totalDuration
  );
  if (st.visibleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (st.visibleAlpha > 0.2 ? 1 : 0) : st.visibleAlpha;
    if (ctx.globalAlpha > 0) {
      drawFlyerCreature({
        ctx,
        creature,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        speedNorm: st.speedNorm,
        hoverBoost: st.hoverBoost,
        t,
        scale: creatureScale,
        accentColor,
        bgMode,
        seed: custom.seed,
        theme,
        flightSpeed,
      });
    }
    ctx.restore();
  }

  }); // End Points camera content layer
};
