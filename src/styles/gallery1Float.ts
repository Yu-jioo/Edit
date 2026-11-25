import {
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import { clamp, hexToRgba, lerp, resolveTextDirection, stripKeywordMarkers } from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
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

export const GAL_FLOAT_CONFIG: StyleMetadata = {
  id: 'gal_float',
  mode: 'image',
  nameAr: 'طفو متناثر',
  nameEn: 'Scattered Float',
  descriptionAr: 'بطاقات مستديرة متناثرة بأعماق متفاوتة مع ظل ناعم وشارة تعليق سفلية',
  defaultAccent: '#6366F1',
  defaultKeywordColor: '#F59E0B',
  defaultQuoteFont: 'Cairo',
  defaultAuthorFont: 'Tajawal',
  defaultEnglishQuoteFont: 'Plus Jakarta Sans',
  defaultEnglishAuthorFont: 'Outfit',
  supportedBackgrounds: ['style', 'green'],
  recommendedBackground: 'green',
};

function getCachedPastelBackground(
  W: number,
  H: number,
  seed: number,
  accentColor: string
): HTMLCanvasElement {
  const key = `gal-float-bg|${W}x${H}|${seed}|${accentColor}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#F5F3FF');
    grad.addColorStop(0.5, '#EFF6FF');
    grad.addColorStop(1, '#FDF2F8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const rng = mulberry32(combineSeed(seed, 4103));
    const blobColors = [
      hexToRgba(accentColor, 0.14),
      'rgba(167, 139, 250, 0.14)',
      'rgba(244, 114, 182, 0.11)',
      'rgba(96, 165, 250, 0.13)',
    ];
    for (let i = 0; i < 6; i++) {
      const bx = rng() * W;
      const by = rng() * H;
      const br = Math.min(W, H) * lerp(0.18, 0.38, rng());
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, blobColors[i % blobColors.length]);
      rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function renderGalFloat(
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
  const accentColor = custom.accentColor || GAL_FLOAT_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || GAL_FLOAT_CONFIG.defaultKeywordColor || accentColor;

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedPastelBackground(W, H, custom.seed, accentColor);
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
    styleId: 'gal_float',
    floatIntensity,
    highlightEnabled,
  });

  const focus = computeGalleryFocusWeights(t, schedule, highlightEnabled, 'gal_float');
  const hasActiveFocus = focus.activeIndex >= 0;

  // Sort by depth layer, keeping currently focused item on top
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
        styleId: 'gal_float',
      }),
      focusWeight: focus.weights[idx] ?? 1,
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
    const radius = clamp(Math.round(Math.min(w, h) * 0.075), 10, 24);
    const borderWidth = clamp(Math.round(Math.min(w, h) * 0.014), 2.5, 5);
    const drawable = resolveGalleryItemDrawable(content, item, slot.index, motion.videoSourceTime);
    const rawCaption = item.caption || '';
    const hasCaption = stripKeywordMarkers(rawCaption).trim().length > 0;

    ctx.save();
    ctx.translate(motion.x, motion.y);
    ctx.rotate(motion.rotationRad);
    ctx.scale(motion.scale, motion.scale);
    ctx.globalAlpha = motion.alpha;

    // 1. Card Shadow (soft layered in style mode; hard offset shadow with shadowBlur=0 in green)
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.translate(motion.isFocused ? 10 : 7, motion.isFocused ? 12 : 9);
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = motion.isFocused
        ? hexToRgba(accentColor, 0.28)
        : 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = motion.isFocused ? 34 : 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = motion.isFocused ? 18 : 11;
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // Secondary ambient tight shadow
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }

    // 2. Clipped Media Body
    ctx.save();
    traceCenteredRoundRect(ctx, w, h, radius);
    ctx.clip();
    drawGalleryItemMedia(
      ctx,
      drawable,
      item.fit,
      -w * 0.5,
      -h * 0.5,
      w,
      h,
      item.fit === 'contain' ? '#111827' : '#0F172A'
    );

    // Subtle accent glint along top edge
    if (!isGreen) {
      const glint = ctx.createLinearGradient(-w * 0.5, -h * 0.5, w * 0.35, h * 0.15);
      glint.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glint.addColorStop(0.28, hexToRgba(accentColor, 0.12));
      glint.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glint;
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    }

    // Dim unfocused items (~70% brightness) when highlight is active
    if (hasActiveFocus && !motion.isFocused) {
      drawUnfocusedDimOverlay(ctx, 0.9, isGreen, () => {
        traceCenteredRoundRect(ctx, w, h, radius);
      });
    }
    ctx.restore();

    // 3. Thin White Border + Accent Glint Trim
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    traceCenteredRoundRect(ctx, w, h, radius);
    ctx.strokeStyle = motion.isFocused && isGreen ? accentColor : '#FFFFFF';
    ctx.lineWidth = borderWidth;
    ctx.stroke();

    // Crisp top-right accent glint line
    ctx.save();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = Math.max(2, borderWidth * 0.75);
    ctx.lineCap = 'round';
    const glintSpan = Math.min(w * 0.28, 64);
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - radius - glintSpan, -h * 0.5);
    ctx.lineTo(w * 0.5 - radius, -h * 0.5);
    ctx.stroke();
    ctx.restore();

    // 4. Pill Chip Caption Overlapping Bottom Edge
    if (hasCaption) {
      const pillH = clamp(Math.round(Math.min(h * 0.22, 42)), 24, 42);
      const pillW = clamp(Math.round(w * 0.84), 84, Math.max(84, w - 12));
      const pillY = h * 0.5 - pillH * 0.52;
      const pillR = pillH * 0.5;

      ctx.save();
      if (isGreen) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(-pillW * 0.5 + 3, pillY + 3, pillW, pillH, pillR);
        ctx.fill();
      } else {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }

      ctx.fillStyle = isGreen ? '#1E293B' : 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(-pillW * 0.5, pillY, pillW, pillH, pillR);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = motion.isFocused ? accentColor : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const dir = resolveTextDirection(custom, rawCaption);
      const font =
        custom.quoteFontOverride ||
        (dir === 'ltr'
          ? GAL_FLOAT_CONFIG.defaultEnglishQuoteFont || 'Plus Jakarta Sans'
          : GAL_FLOAT_CONFIG.defaultQuoteFont);

      drawGalleryItemCaption({
        ctx,
        caption: rawCaption,
        boxX: -pillW * 0.5 + 12,
        boxY: pillY + 3,
        boxW: Math.max(40, pillW - 24),
        boxH: Math.max(16, pillH - 6),
        fontFamily: font,
        fontWeight: 700,
        minFontSize: 11,
        maxFontSize: clamp(Math.round(pillH * 0.52), 12, 20),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: dir,
        textColor: '#F8FAFC',
        keywordColor,
        t,
        revealStartSec: schedule.itemStarts[slot.index] ?? schedule.intro,
        alpha: 1,
        underlineKeywords: false,
      });
      ctx.restore();
    }

    ctx.restore();
  }
}

export function getGalFloatEventTimes(
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
    GAL_FLOAT_CONFIG.defaultQuoteFont,
    GAL_FLOAT_CONFIG.defaultEnglishQuoteFont || 'Plus Jakarta Sans'
  );
}
