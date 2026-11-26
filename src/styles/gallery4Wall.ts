import {
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import { clamp, hexToRgba, resolveTextDirection, stripKeywordMarkers } from '../utils/math';
import {
  computeGalleryEventTimes,
  computeGalleryFocusWeights,
  computeGalleryLayout,
  computeGallerySchedule,
  DEFAULT_GALLERY_FLOAT_INTENSITY,
  drawGalleryItemCaption,
  drawGalleryItemMedia,
  drawUnfocusedDimOverlay,
  getEffectiveGalleryItems,
  resolveGalleryBackground,
  resolveGalleryBoxPixels,
  resolveGalleryItemDrawable,
  sampleGalleryItemMotion,
  traceCenteredRoundRect,
} from './galleryCore';

export const GAL_WALL_CONFIG: StyleMetadata = {
  id: 'gal_wall',
  mode: 'image',
  nameAr: 'جدار زجاجي',
  nameEn: 'Glass Wall',
  descriptionAr: 'شبكة بلاطات زجاجية مصنفرة بحواف مضيئة ورفع ناعم للعنصر الحالي',
  defaultAccent: '#818CF8',
  defaultKeywordColor: '#38BDF8',
  defaultQuoteFont: 'IBM Plex Sans Arabic',
  defaultAuthorFont: 'Cairo',
  defaultEnglishQuoteFont: 'Manrope',
  defaultEnglishAuthorFont: 'Outfit',
  supportedBackgrounds: ['style', 'green', 'black'],
  recommendedBackground: 'green',
};

function getCachedGlassWallBackground(
  W: number,
  H: number,
  accentColor: string
): HTMLCanvasElement {
  const key = `gal-wall-bg|${W}x${H}|${accentColor}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#141B34');
    grad.addColorStop(1, '#3A2A6B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle frosted ambient sheen
    const orb1 = ctx.createRadialGradient(W * 0.22, H * 0.24, 0, W * 0.22, H * 0.24, Math.max(W, H) * 0.45);
    orb1.addColorStop(0, hexToRgba(accentColor, 0.2));
    orb1.addColorStop(1, 'rgba(20, 27, 52, 0)');
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, W, H);

    const orb2 = ctx.createRadialGradient(W * 0.82, H * 0.78, 0, W * 0.82, H * 0.78, Math.max(W, H) * 0.42);
    orb2.addColorStop(0, 'rgba(192, 132, 252, 0.16)');
    orb2.addColorStop(1, 'rgba(58, 42, 107, 0)');
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, W, H);
  });
}

export function renderGalWall(
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
  const accentColor = custom.accentColor || GAL_WALL_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || GAL_WALL_CONFIG.defaultKeywordColor || accentColor;

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedGlassWallBackground(W, H, accentColor);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  const items = getEffectiveGalleryItems(content, custom);
  const boxPx = resolveGalleryBoxPixels(custom, size);
  const floatIntensity = clamp(
    custom.galleryFloatIntensity ?? DEFAULT_GALLERY_FLOAT_INTENSITY,
    0,
    1.5
  );
  const highlightEnabled = custom.galleryHighlightCurrent !== false;

  const schedule = computeGallerySchedule({
    itemCount: items.length,
    appearance: custom.galleryAppearance,
    interval: custom.galleryInterval,
    endHold: custom.galleryEndHold,
  });

  const layout = computeGalleryLayout({
    items,
    boxX: boxPx.boxX,
    boxY: boxPx.boxY,
    boxWidth: boxPx.boxWidth,
    boxHeight: boxPx.boxHeight,
    format: custom.format,
    seed: custom.seed,
    styleId: 'gal_wall',
    floatIntensity,
    highlightEnabled,
  });

  const focus = computeGalleryFocusWeights(t, schedule, highlightEnabled, 'gal_wall');
  const hasActiveFocus = focus.activeIndex >= 0;

  const drawOrder = layout.slots
    .map((slot, idx) => ({
      slot,
      item: items[idx],
      motion: sampleGalleryItemMotion({
        slot,
        item: items[idx],
        t,
        schedule,
        custom,
        focusWeight: focus.weights[idx] ?? 1,
        hasActiveFocus,
        styleId: 'gal_wall',
      }),
    }))
    .filter((entry) => entry.motion.visible)
    .sort((a, b) => {
      if (a.motion.isFocused !== b.motion.isFocused) {
        return a.motion.isFocused ? 1 : -1;
      }
      return a.slot.depth - b.slot.depth;
    });

  for (const { slot, item, motion } of drawOrder) {
    const w = slot.width;
    const h = slot.height;
    const radius = clamp(Math.round(Math.min(w, h) * 0.06), 10, 20);
    const framePad = clamp(Math.round(Math.min(w, h) * 0.032), 5, 11);
    const rawCaption = item.caption || '';
    const hasCaption = stripKeywordMarkers(rawCaption).trim().length > 0;
    const captionH = hasCaption ? clamp(Math.round(h * 0.22), 26, 44) : 0;

    const innerW = Math.max(24, w - framePad * 2);
    const innerH = Math.max(24, h - framePad * 2 - (hasCaption ? captionH + 4 : 0));
    const innerX = -w * 0.5 + framePad;
    const innerY = -h * 0.5 + framePad;
    const innerR = Math.max(6, radius - 4);

    const drawable = resolveGalleryItemDrawable(content, item, slot.index, motion.videoSourceTime);
    // Focus tile lifts slightly upward within safe bounds
    const liftY = motion.isFocused ? -Math.min(6, Math.max(0, motion.y - slot.minCy)) : 0;

    ctx.save();
    ctx.translate(motion.x, motion.y + liftY);
    ctx.rotate(motion.rotationRad * 0.45);
    ctx.scale(motion.scale, motion.scale);
    ctx.globalAlpha = motion.alpha;

    // 1. Tile Shadow / Lift Glow (hard offset with shadowBlur=0 in green)
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.translate(motion.isFocused ? 8 : 5, motion.isFocused ? 10 : 6);
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#0F1426';
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = motion.isFocused
        ? hexToRgba(accentColor, 0.46)
        : 'rgba(6, 10, 26, 0.42)';
      ctx.shadowBlur = motion.isFocused ? 34 : 18;
      ctx.shadowOffsetY = motion.isFocused ? 14 : 8;
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = 'rgba(20, 27, 52, 0.65)';
      ctx.fill();
      ctx.restore();
    }

    // 2. Frosted Glass Tile Backing (opaque solid dark slate in green for crisp chroma edges)
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    traceCenteredRoundRect(ctx, w, h, radius);
    if (isGreen) {
      ctx.fillStyle = '#1B2340';
    } else {
      const tileGrad = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.5, h * 0.5);
      tileGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
      tileGrad.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
      ctx.fillStyle = tileGrad;
    }
    ctx.fill();

    // 3. Clipped Media Window inside Tile
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(innerX, innerY, innerW, innerH, innerR);
    ctx.clip();
    drawGalleryItemMedia(
      ctx,
      drawable,
      item.fit,
      innerX,
      innerY,
      innerW,
      innerH,
      '#0F172A'
    );

    if (hasActiveFocus && !motion.isFocused) {
      drawUnfocusedDimOverlay(ctx, 0.88, isGreen, () => {
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerW, innerH, innerR);
      });
    }
    ctx.restore();

    // 4. Optional Caption inside Glass Footer
    if (hasCaption) {
      const dir = resolveTextDirection(custom, rawCaption);
      const font =
        custom.quoteFontOverride ||
        (dir === 'ltr'
          ? GAL_WALL_CONFIG.defaultEnglishQuoteFont || 'Manrope'
          : GAL_WALL_CONFIG.defaultQuoteFont);

      drawGalleryItemCaption({
        ctx,
        caption: rawCaption,
        boxX: innerX + 4,
        boxY: innerY + innerH + 4,
        boxW: Math.max(36, innerW - 8),
        boxH: Math.max(16, captionH - 4),
        fontFamily: font,
        fontWeight: 700,
        minFontSize: 11,
        maxFontSize: clamp(Math.round(captionH * 0.54), 12, 22),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: dir,
        textColor: '#F1F5F9',
        keywordColor,
        t,
        revealStartSec: schedule.itemStarts[slot.index] ?? schedule.intro,
        alpha: 1,
        underlineKeywords: true,
      });
    }

    // 5. Thin Light Glass Border (accent highlight when focused)
    traceCenteredRoundRect(ctx, w, h, radius);
    ctx.strokeStyle = motion.isFocused
      ? accentColor
      : isGreen
        ? '#CBD5E1'
        : 'rgba(255, 255, 255, 0.34)';
    ctx.lineWidth = motion.isFocused ? 2.6 : 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

export function getGalWallEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  return computeGalleryEventTimes(
    ctx,
    content,
    timeline,
    custom,
    size,
    GAL_WALL_CONFIG.defaultQuoteFont,
    GAL_WALL_CONFIG.defaultEnglishQuoteFont || 'Manrope'
  );
}
