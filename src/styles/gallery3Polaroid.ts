import {
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import { clamp, resolveTextDirection, stripKeywordMarkers } from '../utils/math';
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

export const GAL_POLAROID_CONFIG: StyleMetadata = {
  id: 'gal_polaroid',
  mode: 'image',
  nameAr: 'بولارويد معلّقة',
  nameEn: 'Pinned Polaroids',
  descriptionAr: 'صور بولارويد بيضاء بشريط لاصق وحركة تأرجح لطيفة على جدار دافئ',
  defaultAccent: '#D97706',
  defaultKeywordColor: '#B45309',
  defaultQuoteFont: 'Aref Ruqaa',
  defaultAuthorFont: 'Katibeh',
  defaultEnglishQuoteFont: 'Special Elite',
  defaultEnglishAuthorFont: 'Lora',
  supportedBackgrounds: ['style', 'green'],
  recommendedBackground: 'green',
};

function getCachedWarmWallBackground(
  W: number,
  H: number,
  seed: number
): HTMLCanvasElement {
  const key = `gal-polaroid-wall|${W}x${H}|${seed}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    ctx.fillStyle = '#2A1F18';
    ctx.fillRect(0, 0, W, H);

    // Subtle warm spotlight from top center
    const lamp = ctx.createRadialGradient(W * 0.5, H * 0.25, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.72);
    lamp.addColorStop(0, 'rgba(217, 155, 92, 0.14)');
    lamp.addColorStop(0.55, 'rgba(66, 46, 33, 0.08)');
    lamp.addColorStop(1, 'rgba(12, 8, 6, 0.52)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);

    // Very subtle plaster texture speckles
    const rng = mulberry32(combineSeed(seed, 5507));
    for (let i = 0; i < 180; i++) {
      const px = rng() * W;
      const py = rng() * H;
      const r = 0.8 + rng() * 1.8;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 220, 0.025)' : 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(px, py, r, r);
    }
  });
}

export function renderGalPolaroid(
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
  const accentColor = custom.accentColor || GAL_POLAROID_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || GAL_POLAROID_CONFIG.defaultKeywordColor || accentColor;

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const wall = getCachedWarmWallBackground(W, H, custom.seed);
    ctx.drawImage(wall, 0, 0, W, H);
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
    styleId: 'gal_polaroid',
    floatIntensity,
    highlightEnabled,
  });

  const focus = computeGalleryFocusWeights(t, schedule, highlightEnabled, 'gal_polaroid');
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
        styleId: 'gal_polaroid',
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
    const sidePad = clamp(Math.round(w * 0.065), 6, 18);
    const topPad = sidePad;
    const bottomStripH = clamp(Math.round(h * 0.21), 24, 62);
    const photoW = Math.max(24, w - sidePad * 2);
    const photoH = Math.max(24, h - topPad - bottomStripH);
    const photoX = -w * 0.5 + sidePad;
    const photoY = -h * 0.5 + topPad;

    const drawable = resolveGalleryItemDrawable(content, item, slot.index, motion.videoSourceTime);
    const rawCaption = item.caption || '';
    const hasCaption = stripKeywordMarkers(rawCaption).trim().length > 0;

    ctx.save();
    // Pivot slightly toward top tape pin for realistic hanging swing
    ctx.translate(motion.x, motion.y);
    ctx.rotate(motion.rotationRad);
    ctx.scale(motion.scale, motion.scale);
    ctx.globalAlpha = motion.alpha;

    // 1. Polaroid Paper Shadow (soft on wall; hard offset with shadowBlur=0 on green)
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1E140E';
      ctx.fillRect(-w * 0.5 + 8, -h * 0.5 + 10, w, h);
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = motion.isFocused ? 28 : 18;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = motion.isFocused ? 14 : 9;
      ctx.fillStyle = '#FAF6EF';
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
      ctx.restore();
    }

    // 2. Crisp Polaroid White Paper Body
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#FAF6EF';
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    ctx.strokeStyle = motion.isFocused ? accentColor : '#E5DDD0';
    ctx.lineWidth = motion.isFocused ? 2.4 : 1.2;
    ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);

    // 3. Clipped Media Window
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoX, photoY, photoW, photoH);
    ctx.clip();
    drawGalleryItemMedia(ctx, drawable, item.fit, photoX, photoY, photoW, photoH, '#1C1917');

    if (hasActiveFocus && !motion.isFocused) {
      drawUnfocusedDimOverlay(ctx, 0.88, isGreen, () => {
        ctx.beginPath();
        ctx.rect(photoX, photoY, photoW, photoH);
      });
    }
    ctx.restore();

    // Thin inner photo recess border
    ctx.strokeStyle = 'rgba(28, 25, 23, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(photoX, photoY, photoW, photoH);

    // 4. Masking Tape at Top Center (translucent in style mode; opaque flat matte strip in green)
    const tapeW = clamp(Math.round(w * 0.34), 34, 86);
    const tapeH = clamp(Math.round(topPad * 1.45), 11, 22);
    const tapeAngle = ((slot.index % 2 === 0 ? -1 : 1) * 3.5 * Math.PI) / 180;
    ctx.save();
    ctx.translate(0, -h * 0.5 + 2);
    ctx.rotate(tapeAngle);
    ctx.fillStyle = isGreen ? '#E8DAB8' : 'rgba(235, 221, 188, 0.78)';
    ctx.fillRect(-tapeW * 0.5, -tapeH * 0.5, tapeW, tapeH);
    ctx.strokeStyle = isGreen ? '#C7B48A' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-tapeW * 0.5, -tapeH * 0.5, tapeW, tapeH);
    ctx.restore();

    // 5. Handwritten Caption inside Polaroid Bottom Strip (Aref Ruqaa / Katibeh)
    if (hasCaption) {
      const dir = resolveTextDirection(custom, rawCaption);
      const font =
        custom.quoteFontOverride ||
        (dir === 'ltr'
          ? GAL_POLAROID_CONFIG.defaultEnglishQuoteFont || 'Special Elite'
          : GAL_POLAROID_CONFIG.defaultQuoteFont);

      drawGalleryItemCaption({
        ctx,
        caption: rawCaption,
        boxX: photoX,
        boxY: photoY + photoH + 3,
        boxW: photoW,
        boxH: Math.max(16, bottomStripH - 6),
        fontFamily: font,
        fontWeight: 700,
        minFontSize: 12,
        maxFontSize: clamp(Math.round(bottomStripH * 0.62), 14, 26),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: dir,
        textColor: '#292524',
        keywordColor,
        t,
        revealStartSec: schedule.itemStarts[slot.index] ?? schedule.intro,
        alpha: 1,
        underlineKeywords: true,
      });
    }

    ctx.restore();
  }
}

export function getGalPolaroidEventTimes(
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
    GAL_POLAROID_CONFIG.defaultQuoteFont,
    GAL_POLAROID_CONFIG.defaultEnglishQuoteFont || 'Special Elite'
  );
}
