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
import {
  buildBranchSceneEventTimes,
  buildBranchTreeLayout,
  BranchNodeGeometry,
  BranchTreeLayoutPlan,
  getBranchHighlightAlpha,
  sampleBranchCamera,
  sampleCubicBezier,
  traceTrimmedCubicBezier,
  withBranchCameraLayer,
} from './branchCore';
import {
  buildCalmFlightPlan,
  CalmFlightKeywordTarget,
  CalmFlightPlan,
  CalmFlightStop,
  computeCalmStopAnchor,
  drawCalmFlyerTrail,
  drawFeatheredScheduleLine,
  drawFlyerCreature,
  drawStyleBackdropAndBokeh,
  FLYER_ENGLISH_FONTS,
  FLYER_LIGHT_PALETTE,
  getFlyerCreatureMeta,
  NON_MONO_ARABIC_FONTS,
  resolveCalmFlyerSpeed,
  resolveFlyerCreature,
  resolveFlyerTheme,
  sampleCalmFlight,
} from './flyer_core';

export const BR_FLYER_CONFIG = {
  id: 'br_flyer' as const,
  mode: 'branch' as const,
  nameAr: 'تفرّع الكائن الطائر',
  nameEn: 'Flyer Branching',
  descriptionAr:
    'كائن طائر مضيء يحلّق بهدوء وانسيابية بين العقد المتفرعة مع كشف ناعم للنص وتوهج الكلمات المفتاحية',
  defaultAccent: '#F472B6',
  defaultKeywordColor: '#FDE68A',
  defaultQuoteFont: 'Cairo' as const,
  defaultAuthorFont: 'Cairo' as const,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as const,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as const,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: FLYER_LIGHT_PALETTE,
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedBranchLayouts: ['auto', 'radial', 'horizontal', 'vertical'] as BranchLayoutMode[],
};

const BR_FLYER_LAYOUT_OPTS = {
  styleId: 'br_flyer' as const,
  allowedArabicFonts: NON_MONO_ARABIC_FONTS,
  defaultArabicFont: 'Cairo' as const,
  defaultEnglishFont: 'Plus Jakarta Sans' as const,
  fontWeight: 700,
  lineHeightRatio: 1.46,
  minRootFont: 28,
  maxRootFont: 46,
  minBranchFont: 21,
  maxBranchFont: 34,
  minSubFont: 16,
  maxSubFont: 25,
  supportedLayouts: ['radial', 'horizontal', 'vertical'] as ('radial' | 'horizontal' | 'vertical')[],
  nodePadXFactor: 0.82,
  nodePadYFactor: 0.46,
  minNodeGap: 16,
  keywordOffsetSec: 0.24,
};

/**
 * Computes each node's schedule-driven reveal window (decoupled from creature position).
 * Keeps at least 0.8 s of full visibility before exitStart.
 */
function getNodeRevealWindow(
  node: BranchNodeGeometry,
  plan: BranchTreeLayoutPlan
): { startT: number; endT: number } {
  const maxRevealEnd = Math.max(node.popTime + 0.22, plan.schedule.exitStart - 0.8);
  const desiredDur = node.level === 'root' ? 0.56 : node.level === 'branch' ? 0.52 : 0.44;
  const startT = node.popTime + 0.04;
  const endT = Math.min(maxRevealEnd, startT + desiredDur);
  return { startT, endT: Math.max(startT + 0.16, endT) };
}

/**
 * Builds the calm decoupled creature flight plan for br_flyer.
 * - Visit order: root -> branch 0 -> subs of branch 0 -> branch 1 -> subs of branch 1 ...
 * - Return-to-root hops are strictly skipped (creature drifts directly to next branch node).
 * - Connectors draw by schedule; creature glides softly along connector midpoints during hops.
 */
export function buildBrFlyerCalmFlightPlan(
  plan: BranchTreeLayoutPlan,
  custom: StyleCustomization,
  W: number,
  H: number
): CalmFlightPlan {
  const calmSpeed = resolveCalmFlyerSpeed(custom);

  // Ordered visit sequence (NO return-to-root hops)
  const orderedNodes: BranchNodeGeometry[] = [plan.root];
  for (let bi = 0; bi < plan.branches.length; bi++) {
    orderedNodes.push(plan.branches[bi]);
    const subs = plan.subs[bi] || [];
    for (let si = 0; si < subs.length; si++) {
      orderedNodes.push(subs[si]);
    }
  }

  const connectorToNode = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < plan.connectors.length; i++) {
    const conn = plan.connectors[i];
    const mid = sampleCubicBezier(conn.p0, conn.p1, conn.p2, conn.p3, 0.5);
    connectorToNode.set(conn.toNodeId, mid);
  }

  const stops: CalmFlightStop[] = [];
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i];
    const nextNode = i + 1 < orderedNodes.length ? orderedNodes[i + 1] : null;
    const revWin = getNodeRevealWindow(node, plan);

    const nodeBox = {
      x: node.cx - node.w * 0.5,
      y: node.cy - node.h * 0.5,
      w: node.w,
      h: node.h,
    };
    const textBox = {
      x: node.x + node.padX,
      y: node.y + node.padY,
      w: Math.max(16, node.w - node.padX * 2),
      h: Math.max(16, node.h - node.padY * 2),
    };
    const anchor = computeCalmStopAnchor(nodeBox, textBox, W, H);

    // Gentle ~0.8 s keyword orbit targets
    const keywords: CalmFlightKeywordTarget[] = [];
    for (let ki = 0; ki < node.layout.keywordLineRects.length; ki++) {
      const rect = node.layout.keywordLineRects[ki];
      const kwTime = node.keywordTimes[rect.groupId] ?? revWin.endT;
      keywords.push({
        cx: (rect.leftX + rect.rightX) * 0.5,
        cy: (rect.topY + rect.bottomY) * 0.5,
        rx: clamp(rect.width * 0.54 + 10, 16, 54),
        ry: clamp((rect.bottomY - rect.topY) * 0.6 + 8, 12, 26),
        startTime: Math.max(revWin.endT, kwTime),
        duration: 0.8,
      });
    }

    // Use connector midpoint when gliding directly from a node's parent;
    // leave cross-branch hops undefined so buildCalmFlightPlan crafts a sculpted Cubic Bézier arc
    let hopControlPoint: { x: number; y: number } | undefined;
    if (i > 0) {
      const prevNode = orderedNodes[i - 1];
      const prevAnchor = stops[i - 1].anchor;
      const isDirectChild =
        (node.level === 'branch' && prevNode.level === 'root') ||
        (node.level === 'sub' &&
          (prevNode.level === 'branch' || prevNode.level === 'sub') &&
          prevNode.branchIndex === node.branchIndex);
      if (isDirectChild && connectorToNode.has(node.id)) {
        const cm = connectorToNode.get(node.id)!;
        hopControlPoint = {
          x: lerp(prevAnchor.x, cm.x, 0.55),
          y: Math.min(cm.y, lerp(prevAnchor.y, anchor.y, 0.5)) - 14,
        };
      }
    }

    stops.push({
      id: node.id,
      activeStart: node.popTime,
      activeEnd: nextNode ? nextNode.popTime : plan.schedule.exitStart,
      anchor,
      nodeBox,
      textBox,
      textRevealStart: revWin.startT,
      textRevealEnd: revWin.endT,
      hopControlPoint,
      keywords,
    });
  }

  return buildCalmFlightPlan({
    stops,
    calmSpeed,
    totalDuration: plan.schedule.totalDuration,
    exitStart: plan.schedule.exitStart,
    W,
    H,
    seed: custom.seed,
  });
}

export function getBrFlyerEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...BR_FLYER_LAYOUT_OPTS,
  });
  return buildBranchSceneEventTimes(plan, 'chime');
}

export const renderBrFlyer: PureStyleRenderer = (
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
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';

  const creature = resolveFlyerCreature(custom.flyerCreature);
  const calmSpeed = resolveCalmFlyerSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKw = custom.keywordColor || creatureMeta.defaultKeyword;
  const keywordColor =
    isLight && (rawKw.toUpperCase() === '#FDE047' || rawKw.toUpperCase() === '#FFD166')
      ? '#D97706'
      : rawKw;

  const textColor = isGreen
    ? '#FFFFFF'
    : isBlack
      ? '#FFFFFF'
      : isLight
        ? '#0F172A'
        : '#F8FAFC';

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
    calmSpeed
  );

  // 2. Final-size deterministic tree layout + calm flight plan
  const plan = buildBranchTreeLayout({
    ctx,
    custom,
    size,
    ...BR_FLYER_LAYOUT_OPTS,
  });

  const calmFlight = buildBrFlyerCalmFlightPlan(plan, custom, W, H);
  const { schedule } = plan;
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);
  if (masterAlpha <= 0.005) return;

  const cam = sampleBranchCamera(plan, t);
  const highlightCurrent = custom.branchHighlightCurrent !== false;

  withBranchCameraLayer(ctx, plan, cam, bgMode, (ctx) => {

  // 3. Connectors drawn cleanly by schedule (soft glowing arcs in style/black, solid hard lines in green)
  for (let i = 0; i < plan.connectors.length; i++) {
    const conn = plan.connectors[i];
    const drawP = easeInOutSine(progress(t, conn.startTime, conn.endTime));
    if (drawP <= 0.005) continue;

    const focusAlpha = getBranchHighlightAlpha(t, conn.branchIndex, schedule, highlightCurrent);
    ctx.save();
    ctx.globalAlpha = isGreen
      ? masterAlpha > 0.2
        ? 1
        : 0
      : clamp(focusAlpha * masterAlpha, 0, 1);

    if (ctx.globalAlpha > 0) {
      const lineW = conn.level === 'branch' ? 3.2 : 2.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (isGreen) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = lineW;
        traceTrimmedCubicBezier(ctx, conn.p0, conn.p1, conn.p2, conn.p3, drawP);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.shadowColor = hexToRgba(accentColor, 0.42);
        ctx.shadowBlur = 12;
        ctx.strokeStyle = hexToRgba(accentColor, isLight ? 0.26 : 0.34);
        ctx.lineWidth = lineW + 5;
        traceTrimmedCubicBezier(ctx, conn.p0, conn.p1, conn.p2, conn.p3, drawP);
        ctx.stroke();
        ctx.restore();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isLight ? accentColor : '#E0F2FE';
        ctx.lineWidth = lineW;
        traceTrimmedCubicBezier(ctx, conn.p0, conn.p1, conn.p2, conn.p3, drawP);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 4. Nodes (glass chips in style, outlined bright in black, flat crisp in green)
  for (let i = 0; i < plan.allNodes.length; i++) {
    const node = plan.allNodes[i];
    const popP = progress(t, node.popTime - 0.14, node.popTime + 0.24);
    if (popP <= 0.005) continue;

    const scalePop = lerp(0.92, 1.0, easeOutBack(popP, 1.28));
    const focusAlpha = getBranchHighlightAlpha(t, node.branchIndex, schedule, highlightCurrent);
    const isDimmedGreen = isGreen && highlightCurrent && focusAlpha < 0.7;

    const nx = node.cx - node.w * 0.5;
    const ny = node.cy - node.h * 0.5;
    const radius = node.level === 'root' ? 20 : node.level === 'branch' ? 16 : 12;

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

      // Node container
      if (isGreen) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#070B14';
        ctx.beginPath();
        ctx.roundRect(nx + 4, ny + 4, node.w, node.h, radius);
        ctx.fill();

        ctx.fillStyle = isDimmedGreen
          ? '#182235'
          : node.level === 'root'
            ? '#0C162B'
            : '#0F172A';
        ctx.beginPath();
        ctx.roundRect(nx, ny, node.w, node.h, radius);
        ctx.fill();

        ctx.strokeStyle = isDimmedGreen
          ? '#64748B'
          : node.level === 'root'
            ? accentColor
            : '#E2E8F0';
        ctx.lineWidth = node.level === 'root' ? 2.5 : 2;
        ctx.stroke();
      } else if (isBlack) {
        ctx.save();
        if (focusAlpha > 0.7) {
          ctx.shadowColor = hexToRgba(accentColor, 0.45);
          ctx.shadowBlur = node.level === 'root' ? 18 : 12;
        }
        ctx.strokeStyle =
          node.level === 'root'
            ? accentColor
            : focusAlpha > 0.7
              ? hexToRgba(accentColor, 0.85)
              : 'rgba(248, 250, 252, 0.48)';
        ctx.lineWidth = node.level === 'root' ? 2.4 : 1.6;
        ctx.beginPath();
        ctx.roundRect(nx, ny, node.w, node.h, radius);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.shadowColor = isLight
          ? 'rgba(15, 23, 42, 0.12)'
          : hexToRgba(accentColor, node.level === 'root' ? 0.34 : 0.2);
        ctx.shadowBlur = node.level === 'root' ? 22 : 14;
        ctx.shadowOffsetY = 6;

        const grad = ctx.createLinearGradient(nx, ny, nx + node.w, ny + node.h);
        if (isLight) {
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
          grad.addColorStop(1, hexToRgba(accentColor, node.level === 'root' ? 0.14 : 0.08));
        } else {
          grad.addColorStop(0, 'rgba(20, 31, 56, 0.78)');
          grad.addColorStop(1, hexToRgba(accentColor, node.level === 'root' ? 0.18 : 0.1));
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(nx, ny, node.w, node.h, radius);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = isLight
          ? hexToRgba(accentColor, node.level === 'root' ? 0.56 : 0.34)
          : hexToRgba(accentColor, node.level === 'root' ? 0.72 : 0.36);
        ctx.lineWidth = node.level === 'root' ? 2 : 1.3;
        ctx.beginPath();
        ctx.roundRect(nx, ny, node.w, node.h, radius);
        ctx.stroke();
      }

      // Schedule-driven soft feathered RTL text reveal (decoupled from creature x-position)
      const revWin = getNodeRevealWindow(node, plan);
      const lineCount = Math.max(1, node.layout.lines.length);
      const lineSpan = (revWin.endT - revWin.startT) / lineCount;
      const isLtr = node.layout.direction === 'ltr';
      const nodeTextColor = isDimmedGreen ? '#CBD5E1' : textColor;
      const nodeKwColor = isDimmedGreen ? '#E2C675' : keywordColor;

      for (let li = 0; li < node.layout.lines.length; li++) {
        const line = node.layout.lines[li];
        const lStart = revWin.startT + li * lineSpan * 0.78;
        const lEnd = Math.min(revWin.endT, lStart + lineSpan * 1.15);
        const lineP = easeInOutSine(progress(t, lStart, lEnd));
        if (lineP <= 0.005) continue;

        drawFeatheredScheduleLine({
          ctx,
          line,
          originX: 0,
          originY: 0,
          revealProgress: lineP,
          isLtr,
          isGreen,
          fontFamily: node.layout.fontFamily,
          fontWeight: node.layout.fontWeight,
          fontSize: node.fontSize,
          direction: node.layout.direction,
          textColor: nodeTextColor,
          keywordColor: nodeKwColor,
          isKeywordActive: (word) => {
            if (!word.isKeyword || word.groupId === null) return false;
            const kwT = node.keywordTimes[word.groupId] ?? revWin.endT;
            return t >= kwT;
          },
          drawUnderline: (targetCtx, offX, offY) => {
            for (let ki = 0; ki < node.layout.keywordLineRects.length; ki++) {
              const rect = node.layout.keywordLineRects[ki];
              if (rect.lineIndex !== li) continue;
              const kwT = node.keywordTimes[rect.groupId] ?? revWin.endT;
              if (t < kwT) continue;
              const ulP = easeOutCubic(progress(t, kwT, kwT + 0.22));
              if (ulP <= 0.01) continue;

              const ulY = rect.baselineY + Math.max(4, node.fontSize * 0.22) - offY;
              const xStart = (isLtr ? rect.leftX : rect.rightX) - offX;
              const xEnd = (isLtr ? rect.rightX : rect.leftX) - offX;
              const xCur = lerp(xStart, xEnd, ulP);

              targetCtx.save();
              targetCtx.strokeStyle = nodeKwColor;
              targetCtx.lineWidth = isGreen ? 2 : Math.max(1.6, node.fontSize * 0.065);
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
  const creatureScale = clamp(plan.branchFontSize / 32, 0.72, 1.12);
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

  }, size.scale);
};
