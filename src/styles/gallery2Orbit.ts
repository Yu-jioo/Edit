import {
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  computeVideoSourceTime,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  progress,
  resolveTextDirection,
  stripKeywordMarkers,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  computeGalleryEventTimes,
  computeGallerySchedule,
  DEFAULT_GALLERY_FLOAT_INTENSITY,
  drawGalleryItemCaption,
  drawGalleryItemMedia,
  drawUnfocusedDimOverlay,
  GALLERY_ENTRANCE_DUR_SEC,
  getEffectiveGalleryItems,
  resolveGalleryBackground,
  resolveGalleryBoxPixels,
  resolveGalleryItemDrawable,
  traceCenteredRoundRect,
} from './galleryCore';

export const GAL_ORBIT_CONFIG: StyleMetadata = {
  id: 'gal_orbit',
  mode: 'image',
  nameAr: 'مدار ثلاثي الأبعاد',
  nameEn: '3D Orbit Ring',
  descriptionAr: 'حلقة مدارية ثلاثية الأبعاد بعمق متدرج وانعكاس أرضي ونجوم خافتة',
  defaultAccent: '#38BDF8',
  defaultKeywordColor: '#FBBF24',
  defaultQuoteFont: 'Readex Pro',
  defaultAuthorFont: 'Cairo',
  defaultEnglishQuoteFont: 'Outfit',
  defaultEnglishAuthorFont: 'Plus Jakarta Sans',
  supportedBackgrounds: ['style', 'green'],
  recommendedBackground: 'green',
};

function getCachedSpaceBackground(
  W: number,
  H: number,
  seed: number,
  accentColor: string
): HTMLCanvasElement {
  const key = `gal-orbit-bg|${W}x${H}|${seed}|${accentColor}`;
  return getOrGenerateCachedCanvas(key, W, H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#070B18');
    grad.addColorStop(0.55, '#0F172A');
    grad.addColorStop(1, '#131D36');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle horizon glow
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.58, 0, W * 0.5, H * 0.58, Math.max(W, H) * 0.5);
    glow.addColorStop(0, hexToRgba(accentColor, 0.14));
    glow.addColorStop(1, 'rgba(7, 11, 24, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Faint deterministic stars
    const rng = mulberry32(combineSeed(seed, 7219));
    const starCount = 85;
    for (let i = 0; i < starCount; i++) {
      const sx = rng() * W;
      const sy = rng() * H * 0.72;
      const sr = lerp(0.8, 2.1, rng());
      const sa = lerp(0.18, 0.62, rng());
      ctx.fillStyle = `rgba(226, 232, 240, ${sa.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function getCachedFloorReflection(
  w: number,
  h: number,
  accentColor: string
): HTMLCanvasElement {
  const rw = Math.max(64, Math.round(w));
  const rh = Math.max(24, Math.round(h));
  const key = `gal-orbit-floor|${rw}x${rh}|${accentColor}`;
  return getOrGenerateCachedCanvas(key, rw, rh, (ctx) => {
    ctx.clearRect(0, 0, rw, rh);
    const rg = ctx.createRadialGradient(
      rw * 0.5,
      rh * 0.48,
      rw * 0.04,
      rw * 0.5,
      rh * 0.5,
      rw * 0.48
    );
    rg.addColorStop(0, hexToRgba(accentColor, 0.28));
    rg.addColorStop(0.55, 'rgba(148, 163, 184, 0.10)');
    rg.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, rw, rh);

    // Thin orbital floor track ellipse
    ctx.strokeStyle = hexToRgba(accentColor, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(rw * 0.5, rh * 0.5, rw * 0.44, rh * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function renderGalOrbit(
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
  const accentColor = custom.accentColor || GAL_ORBIT_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || GAL_ORBIT_CONFIG.defaultKeywordColor || accentColor;

  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedSpaceBackground(W, H, custom.seed, accentColor);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  const items = getEffectiveGalleryItems(content, custom);
  const n = items.length;
  const boxPx = resolveGalleryBoxPixels(custom, size);
  const floatIntensity = clamp(
    custom.galleryFloatIntensity ?? DEFAULT_GALLERY_FLOAT_INTENSITY,
    0,
    1.5
  );
  const highlightEnabled = custom.galleryHighlightCurrent !== false;

  const schedule = computeGallerySchedule({
    itemCount: n,
    appearance: custom.galleryAppearance,
    interval: custom.galleryInterval,
    endHold: custom.galleryEndHold,
  });

  const pad = clamp(Math.round(Math.min(boxPx.boxWidth, boxPx.boxHeight) * 0.045), 14, 34);
  const innerW = Math.max(80, boxPx.boxWidth - pad * 2);
  const innerH = Math.max(80, boxPx.boxHeight - pad * 2);

  // Reserve floor reflection band at bottom ONLY when not green
  const reflectionBandH = isGreen ? 0 : Math.min(80, Math.round(innerH * 0.14));
  const orbitCenterX = boxPx.boxX + boxPx.boxWidth * 0.5;
  const orbitCenterY = boxPx.boxY + pad + (innerH - reflectionBandH) * 0.5;

  // Base card size adapted to box size and item count
  const maxCardW = clamp(
    innerW * (n === 1 ? 0.62 : n <= 3 ? 0.44 : n <= 5 ? 0.36 : 0.3),
    68,
    innerW * 0.68
  );
  const maxCardH = clamp(
    (innerH - reflectionBandH) * (n === 1 ? 0.68 : 0.52),
    68,
    (innerH - reflectionBandH) * 0.72
  );

  // Elliptical radii strictly bounded so frontmost item (scale 1.08) + bob stays inside boxPx
  const maxScale = highlightEnabled ? 1.08 : 1.0;
  const bobAmp = clamp(Math.min(innerW, innerH) * 0.015, 3, 12) * floatIntensity;
  const radiusX =
    n <= 1 ? 0 : Math.max(0, (innerW - maxCardW * maxScale) * 0.46);
  const radiusY =
    n <= 1
      ? 0
      : Math.max(0, Math.min(innerH * 0.18, (innerH - reflectionBandH - maxCardH * maxScale) * 0.42 - bobAmp));

  // Cached floor reflection in style mode only (strictly removed in green)
  if (!isGreen && reflectionBandH > 18) {
    const reflW = Math.min(innerW, Math.max(120, radiusX * 2.25 + maxCardW));
    const reflCanvas = getCachedFloorReflection(reflW, reflectionBandH, accentColor);
    const reflY = boxPx.boxY + boxPx.boxHeight - pad - reflectionBandH;
    const masterFade =
      easeOutCubic(progress(t, schedule.intro * 0.5, schedule.intro + 0.45)) *
      (1 - easeInCubic(progress(t, schedule.exitStart, schedule.total)));
    if (masterFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = masterFade;
      ctx.drawImage(reflCanvas, orbitCenterX - reflW * 0.5, reflY, reflW, reflectionBandH);
      ctx.restore();
    }
  }

  // Orbit rotation phase:
  // In 'stagger', as each item appears it smoothly brings the newest item toward the front,
  // then during endHold the ring rotates steadily so the front item cycles cleanly.
  const angleStep = (Math.PI * 2) / Math.max(1, n);
  let ringPhase = 0;
  if (n > 1) {
    if (schedule.appearance === 'stagger') {
      // Smoothly advance angle so each appearing item steps to the front (angle = Math.PI / 2)
      const activeFloatIdx = clamp(
        (t - schedule.intro) / Math.max(0.1, schedule.interval),
        0,
        n - 1
      );
      const holdElapsed = Math.max(0, t - schedule.lastAppearEnd);
      const holdCycleSpeed = (Math.PI * 2) / Math.max(3.6, schedule.endHold * 1.15);
      ringPhase = -activeFloatIdx * angleStep + holdElapsed * holdCycleSpeed;
    } else {
      const elapsed = Math.max(0, t - schedule.intro);
      const cycleSpeed = (Math.PI * 2) / Math.max(4.5, (schedule.exitStart - schedule.intro) * 1.2);
      ringPhase = elapsed * cycleSpeed;
    }
  }

  interface OrbitRenderItem {
    index: number;
    cx: number;
    cy: number;
    cardW: number;
    cardH: number;
    scale: number;
    depthNorm: number; // 0 = back, 1 = front
    alpha: number;
    isFront: boolean;
    videoSourceTime: number;
    entranceP: number;
  }

  const exitRaw = progress(t, schedule.exitStart, schedule.total);
  const exitEase = easeInCubic(exitRaw);
  const exitAlpha = 1 - exitEase;

  const prepared: OrbitRenderItem[] = [];
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const itemStart = schedule.itemStarts[i] ?? schedule.intro;
    const entranceRaw = progress(t, itemStart, itemStart + GALLERY_ENTRANCE_DUR_SEC);
    if (entranceRaw <= 0.001 || exitRaw >= 0.999) continue;

    // Angle where Math.PI/2 is directly in front (closest to viewer)
    const theta = Math.PI * 0.5 + i * angleStep + ringPhase;
    const depthSin = Math.sin(theta); // -1 (back) .. +1 (front)
    const depthNorm = n === 1 ? 1 : (depthSin + 1) * 0.5;

    const rawAspect =
      item.displayWidth > 0 && item.displayHeight > 0
        ? item.displayWidth / item.displayHeight
        : 16 / 9;
    const mediaAspect = clamp(rawAspect, 0.5, 2.2);

    let cardW = maxCardW;
    let cardH = cardW / mediaAspect;
    if (cardH > maxCardH) {
      cardH = maxCardH;
      cardW = cardH * mediaAspect;
    }

    // Pseudo-3D depth scaling & alpha
    const depthScale = n === 1 ? 1.0 : lerp(0.66, highlightEnabled ? 1.08 : 1.0, Math.pow(depthNorm, 1.25));
    const entranceScale = lerp(0.9, 1.0, clamp(easeOutBack(entranceRaw, 1.25), 0, 1.08));
    const scale = depthScale * entranceScale * lerp(1.0, 0.95, exitEase);

    const floatAge = Math.max(0, t - itemStart);
    const bobY = Math.sin(floatAge * 1.1 + i * 1.7) * bobAmp;
    const riseY = (1 - easeOutCubic(entranceRaw)) * 26;
    const dropY = exitEase * 22;

    const halfW = (cardW * scale) * 0.5 + 4;
    const halfH = (cardH * scale) * 0.5 + 4;
    const minX = boxPx.boxX + pad + halfW;
    const maxX = boxPx.boxX + boxPx.boxWidth - pad - halfW;
    const minY = boxPx.boxY + pad + halfH;
    const maxY = boxPx.boxY + boxPx.boxHeight - pad - reflectionBandH - halfH;

    const rawX = orbitCenterX + Math.cos(theta) * radiusX;
    const rawY = orbitCenterY + depthSin * radiusY + bobY + riseY + dropY;
    const cx = clamp(rawX, Math.min(minX, orbitCenterX), Math.max(maxX, orbitCenterX));
    const cy = clamp(rawY, Math.min(minY, orbitCenterY), Math.max(maxY, orbitCenterY));

    const depthAlpha = highlightEnabled ? lerp(0.68, 1.0, depthNorm) : lerp(0.8, 1.0, depthNorm);
    const entranceAlpha = easeOutCubic(clamp(entranceRaw * 1.45, 0, 1));
    const alpha = clamp(entranceAlpha * exitAlpha * depthAlpha, 0, 1);

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

    prepared.push({
      index: i,
      cx,
      cy,
      cardW: Math.round(cardW),
      cardH: Math.round(cardH),
      scale,
      depthNorm,
      alpha,
      isFront: false,
      videoSourceTime,
      entranceP: entranceRaw,
    });
  }

  // Sort back-to-front by depthNorm; highest depthNorm is the front focus item
  prepared.sort((a, b) => a.depthNorm - b.depthNorm);
  if (prepared.length > 0) {
    prepared[prepared.length - 1].isFront = true;
  }

  for (const entry of prepared) {
    const item = items[entry.index];
    const w = entry.cardW;
    const h = entry.cardH;
    const radius = clamp(Math.round(Math.min(w, h) * 0.065), 8, 20);
    const drawable = resolveGalleryItemDrawable(content, item, entry.index, entry.videoSourceTime);
    const rawCaption = item.caption || '';
    const hasCaption = stripKeywordMarkers(rawCaption).trim().length > 0;

    ctx.save();
    ctx.translate(entry.cx, entry.cy);
    ctx.scale(entry.scale, entry.scale);
    ctx.globalAlpha = entry.alpha;

    // Shadow / focus glow (strictly hard offset in green)
    if (isGreen) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.translate(entry.isFront ? 9 : 6, entry.isFront ? 10 : 7);
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#090D16';
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = entry.isFront
        ? hexToRgba(accentColor, 0.42)
        : 'rgba(2, 6, 23, 0.55)';
      ctx.shadowBlur = entry.isFront ? 32 : 18;
      ctx.shadowOffsetY = entry.isFront ? 14 : 8;
      traceCenteredRoundRect(ctx, w, h, radius);
      ctx.fillStyle = '#0B1120';
      ctx.fill();
      ctx.restore();
    }

    // Media clipped to rounded frame
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
      '#0B1120'
    );

    if (highlightEnabled && !entry.isFront) {
      drawUnfocusedDimOverlay(ctx, 1 - entry.depthNorm * 0.7, isGreen, () => {
        traceCenteredRoundRect(ctx, w, h, radius);
      });
    }

    // Bottom caption strip inside the card
    if (hasCaption) {
      const capH = clamp(Math.round(h * 0.24), 26, 48);
      ctx.fillStyle = isGreen ? '#0B1120' : 'rgba(7, 11, 24, 0.84)';
      ctx.fillRect(-w * 0.5, h * 0.5 - capH, w, capH);
      const dir = resolveTextDirection(custom, rawCaption);
      const font =
        custom.quoteFontOverride ||
        (dir === 'ltr'
          ? GAL_ORBIT_CONFIG.defaultEnglishQuoteFont || 'Outfit'
          : GAL_ORBIT_CONFIG.defaultQuoteFont);
      drawGalleryItemCaption({
        ctx,
        caption: rawCaption,
        boxX: -w * 0.5 + 10,
        boxY: h * 0.5 - capH + 3,
        boxW: Math.max(40, w - 20),
        boxH: Math.max(16, capH - 6),
        fontFamily: font,
        fontWeight: 700,
        minFontSize: 11,
        maxFontSize: clamp(Math.round(capH * 0.52), 12, 22),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: dir,
        textColor: '#F8FAFC',
        keywordColor,
        t,
        revealStartSec: schedule.itemStarts[entry.index] ?? schedule.intro,
        alpha: 1,
        underlineKeywords: entry.isFront,
      });
    }
    ctx.restore();

    // Rim border
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    traceCenteredRoundRect(ctx, w, h, radius);
    ctx.strokeStyle = entry.isFront ? accentColor : 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = entry.isFront ? 3 : 1.6;
    ctx.stroke();

    ctx.restore();
  }
}

export function getGalOrbitEventTimes(
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
    GAL_ORBIT_CONFIG.defaultQuoteFont,
    GAL_ORBIT_CONFIG.defaultEnglishQuoteFont || 'Outfit'
  );
}
