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
} from './galleryCore';

export const GAL_BUBBLES_CONFIG: StyleMetadata = {
  id: 'gal_bubbles',
  mode: 'image',
  nameAr: 'فقاعات',
  nameEn: 'Iridescent Bubbles',
  descriptionAr: 'فقاعات دائرية بحافة قزحية ولمعة ضوئية وحركة طفو ناعمة',
  defaultAccent: '#38BDF8',
  defaultKeywordColor: '#F472B6',
  defaultQuoteFont: 'Zain Rounded instance mob',
  defaultAuthorFont: 'Tajawal',
  defaultEnglishQuoteFont: 'Outfit',
  defaultEnglishAuthorFont: 'Plus Jakarta Sans',
  supportedBackgrounds: ['style', 'green', 'black'],
  recommendedBackground: 'green',
};

function getCachedAquaVioletBackground(
  W: number,
  H: number,
  seed: number
): HTMLCanvasElement {
  const key = `gal-bubbles-bg|${W}x${H}|${seed}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0B3B5B');
    grad.addColorStop(0.52, '#2B2B6E');
    grad.addColorStop(1, '#4C1D6E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle aqua-violet soft glow pools
    const g1 = ctx.createRadialGradient(W * 0.25, H * 0.25, 0, W * 0.25, H * 0.25, Math.max(W, H) * 0.45);
    g1.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    g1.addColorStop(1, 'rgba(11, 59, 91, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.78, H * 0.76, 0, W * 0.78, H * 0.76, Math.max(W, H) * 0.45);
    g2.addColorStop(0, 'rgba(192, 132, 252, 0.2)');
    g2.addColorStop(1, 'rgba(76, 29, 110, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  });
}

function drawAmbientMiniBubbles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  seed: number,
  floatIntensity: number
): void {
  const rng = mulberry32(combineSeed(seed, 8821));
  const count = 24;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const bx = rng() * W;
    const baseY = rng() * H;
    const r = lerp(4, 15, rng());
    const speed = lerp(12, 30, rng()) * Math.max(0.25, floatIntensity);
    const driftFreq = lerp(0.5, 1.2, rng());
    const phase = rng() * Math.PI * 2;
    const curY = ((baseY - t * speed) % (H + r * 4) + (H + r * 4)) % (H + r * 4) - r * 2;
    const curX = bx + Math.sin(t * driftFreq + phase) * 14;

    ctx.strokeStyle = 'rgba(224, 242, 254, 0.24)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(curX, curY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(curX - r * 0.35, curY - r * 0.35, Math.max(1.2, r * 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderGalBubbles(
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
  const accentColor = custom.accentColor || GAL_BUBBLES_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || GAL_BUBBLES_CONFIG.defaultKeywordColor || accentColor;

  const floatIntensity = clamp(
    custom.galleryFloatIntensity ?? DEFAULT_GALLERY_FLOAT_INTENSITY,
    0,
    1.5
  );

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedAquaVioletBackground(W, H, custom.seed);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
    drawAmbientMiniBubbles(ctx, W, H, t, custom.seed, floatIntensity);
  }

  const items = getEffectiveGalleryItems(content, custom);
  const boxPx = resolveGalleryBoxPixels(custom, size);
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
    styleId: 'gal_bubbles',
    floatIntensity,
    highlightEnabled,
  });

  const focus = computeGalleryFocusWeights(t, schedule, highlightEnabled, 'gal_bubbles');
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
        styleId: 'gal_bubbles',
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
    const diameter = Math.min(slot.width, slot.height);
    const radius = diameter * 0.5;
    const drawable = resolveGalleryItemDrawable(content, item, slot.index, motion.videoSourceTime);
    const rawCaption = item.caption || '';
    const hasCaption = stripKeywordMarkers(rawCaption).trim().length > 0;

    ctx.save();
    ctx.translate(motion.x, motion.y);
    ctx.scale(motion.scale, motion.scale);
    ctx.globalAlpha = motion.alpha;

    // 1. Bubble Shadow (soft glow/shadow in style mode; hard offset shadow with shadowBlur=0 in green)
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(7, 9, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
    } else {
      ctx.save();
      ctx.shadowColor = motion.isFocused
        ? hexToRgba(accentColor, 0.45)
        : 'rgba(8, 20, 48, 0.42)';
      ctx.shadowBlur = motion.isFocused ? 30 : 18;
      ctx.shadowOffsetY = 10;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.restore();
    }

    // 2. Clipped Circular Media Inside Bubble
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    drawGalleryItemMedia(
      ctx,
      drawable,
      item.fit,
      -radius,
      -radius,
      diameter,
      diameter,
      '#0F172A'
    );

    if (hasActiveFocus && !motion.isFocused) {
      drawUnfocusedDimOverlay(ctx, 0.88, isGreen, () => {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
      });
    }

    // Inner shade & specular bubble polish (style mode ONLY)
    if (!isGreen) {
      const innerShade = ctx.createRadialGradient(
        -radius * 0.25,
        -radius * 0.25,
        radius * 0.48,
        0,
        0,
        radius
      );
      innerShade.addColorStop(0, 'rgba(255, 255, 255, 0)');
      innerShade.addColorStop(0.76, 'rgba(15, 23, 42, 0.14)');
      innerShade.addColorStop(1, 'rgba(56, 189, 248, 0.34)');
      ctx.fillStyle = innerShade;
      ctx.fillRect(-radius, -radius, diameter, diameter);

      // Soft curved specular highlight arc
      ctx.save();
      ctx.rotate(-0.65);
      const spec = ctx.createLinearGradient(0, -radius * 0.86, 0, -radius * 0.38);
      spec.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
      spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.ellipse(0, -radius * 0.65, radius * 0.42, radius * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 3. Bubble Rim:
    // - GREEN mode: crisp flat solid ring + small hard highlight dot (zero glow, zero feather)
    // - Style mode: thin iridescent gradient rim
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    if (isGreen) {
      ctx.strokeStyle = motion.isFocused ? accentColor : '#E0F2FE';
      ctx.lineWidth = clamp(Math.round(radius * 0.055), 3, 6);
      ctx.stroke();

      // Small hard specular highlight dot inside top-left rim
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-radius * 0.52, -radius * 0.52, clamp(radius * 0.08, 3, 9), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const irid = ctx.createLinearGradient(-radius, -radius, radius, radius);
      irid.addColorStop(0, '#E0F2FE');
      irid.addColorStop(0.35, accentColor);
      irid.addColorStop(0.7, '#C084FC');
      irid.addColorStop(1, '#F9A8D4');
      ctx.strokeStyle = irid;
      ctx.lineWidth = motion.isFocused ? 3.8 : 2.6;
      ctx.stroke();
    }

    // 4. Optional Caption Pill Below Bubble (within reserved captionPadBottom)
    if (hasCaption) {
      const pillH = clamp(Math.round(Math.min(diameter * 0.22, 38)), 22, 38);
      const pillW = clamp(Math.round(diameter * 0.92), 78, Math.max(78, diameter + 18));
      const pillY = radius - pillH * 0.28;
      const pillR = pillH * 0.5;

      ctx.save();
      if (isGreen) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(-pillW * 0.5 + 3, pillY + 3, pillW, pillH, pillR);
        ctx.fill();
      }
      ctx.fillStyle = isGreen ? '#1E293B' : 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-pillW * 0.5, pillY, pillW, pillH, pillR);
      ctx.fill();
      ctx.strokeStyle = motion.isFocused ? accentColor : '#BAE6FD';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const dir = resolveTextDirection(custom, rawCaption);
      const font =
        custom.quoteFontOverride ||
        (dir === 'ltr'
          ? GAL_BUBBLES_CONFIG.defaultEnglishQuoteFont || 'Outfit'
          : GAL_BUBBLES_CONFIG.defaultQuoteFont);

      drawGalleryItemCaption({
        ctx,
        caption: rawCaption,
        boxX: -pillW * 0.5 + 10,
        boxY: pillY + 2,
        boxW: Math.max(40, pillW - 20),
        boxH: Math.max(16, pillH - 4),
        fontFamily: font,
        fontWeight: 700,
        minFontSize: 11,
        maxFontSize: clamp(Math.round(pillH * 0.54), 12, 20),
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

export function getGalBubblesEventTimes(
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
    GAL_BUBBLES_CONFIG.defaultQuoteFont,
    GAL_BUBBLES_CONFIG.defaultEnglishQuoteFont || 'Outfit'
  );
}
