import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  progress,
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  computeAutoHoldDuration,
  computePhraseAutoHoldDuration,
  countLogicalKeystrokes,
  computeBranchSchedule,
  computeChatSchedule,
  computePointsSchedule,
  computeVideoSourceTime,
  computeVideoTimeline,
  clampVideoBoxToSafeMargin,
  countBranchStats,
  countChatTotalWords,
  countPointsStats,
  DEFAULT_BRANCH_DATA,
  DEFAULT_BRANCH_TIMING,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  DEFAULT_IMAGE_CAPTION,
  DEFAULT_IMAGE_SOURCE_LINE,
  DEFAULT_IMAGE_TIMELINE,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  DEFAULT_SPOTLIGHT_REGION,
  DEFAULT_VIDEO_BOX,
  DEFAULT_VIDEO_TIMELINE,
  detectTextDirection,
  formatPointMarker,
  getBranchPositionBox,
  getChatPositionBox,
  getDefaultVideoBoxForPosition,
  getEffectiveTimeline,
  getImagePositionBox,
  getPointsPositionBox,
  getRenderSize,
  getTargetBitrate,
  getTypingConfigForCustomization,
  getPhrasePositionBox,
  isGreenishColor,
  isRgbPixelGreenHue,
  MAX_BRANCH_BRANCHES,
  MAX_BRANCH_SUBS,
  MAX_BRANCH_TOTAL_NODES,
  MAX_POINTS_ITEMS,
  parseQuickPasteBranchTree,
  parseQuickPasteChatMessages,
  parseQuickPastePointsItems,
  resizeVideoBoxFromCorner,
  resolveBackgroundMode,
  resolveTextDirection,
  sanitizeBranchColorForGreen,
  sanitizeBranchTree,
  scaleVideoBoxFromBase,
  snapVideoBoxToGuides,
  toArabicIndicDigits,
  videoBoxToPixels,
} from './math';
import { mulberry32, combineSeed, deterministicWave } from './random';
import {
  applyStudioCanvasTextProps,
  computeTypingScheduleForLayout,
  evaluateLineTypingAtTime,
  formatQuoteWithMarks,
  getFontCalibration,
  layoutArabicQuote,
  parseKeywordMarkup,
  resolveStudioFontSpec,
  segmentTextIntoBidiRuns,
  splitIntoKeystrokeClusters,
} from './textLayout';
import { buildExportFileName } from './exporter';
import {
  ALL_STYLES_LIST,
  ARABIC_FONTS_LIST,
  AUTHOR_ARABIC_FONTS_LIST,
  BRANCH_STYLES_LIST,
  CHAT_STYLES_LIST,
  DEFAULT_BRANCH_CAMERA,
  DEFAULT_BRANCH_CAMERA_ZOOM,
  DEFAULT_CALM_FLYER_SPEED,
  DEFAULT_FLYER_FLIGHT_SPEED,
  DEFAULT_POINTS_CAMERA,
  DEFAULT_POINTS_CAMERA_ZOOM,
  drawCreaturePreviewThumbnail,
  ENGLISH_FONTS_LIST,
  FLYER_CREATURES,
  FLYER_DEFAULT_TINTS,
  getEventTimes,
  getSceneEventTimes,
  getStyleMetadata,
  IMAGE_STYLES_LIST,
  isCalmFlyerStyle,
  isGalleryActive,
  isGalleryBoxFullscreen,
  isPointsCameraActive,
  MAX_GALLERY_ITEMS,
  MAX_GALLERY_VIDEOS,
  PHRASE_STYLES_LIST,
  POINTS_STYLES_LIST,
  QUOTE_STYLES_LIST,
  renderQuoteFrame,
  resolveActiveStyleId,
  resolveBranchCameraMode,
  resolveBranchCameraZoom,
  resolveBranchMetroPalette,
  resolveBranchStyleId,
  resolveBranchTreeTheme,
  resolveCalmFlyerSpeed,
  resolveFlyerCreature,
  resolveFlyerFlightSpeed,
  resolveFlyerTheme,
  resolveGalleryBackground,
  resolveGalleryStyleId,
  resolvePointsCameraMode,
  resolvePointsCameraZoom,
  resolvePointsFlyerLayout,
  resolveTimelineTheme,
  sampleGalleryItemMotion,
  samplePointsCamera,
  VIDEO_STYLES_LIST,
  GALLERY_STYLES_LIST,
  DEFAULT_GALLERY_ITEMS,
  computeGalleryLayout,
  computeGallerySchedule,
  computeGalleryFocusWeights,
  computeDrawableGreenRatio,
  resolveGalleryBoxPixels,
  GAL_CIRCLE_CONFIG,
  CIRCLE_FOCUS_MAX_SCALE,
  CIRCLE_STEP_ROTATE_SEC,
  DEFAULT_GALLERY_CIRCLE_SPEED,
  DEFAULT_GALLERY_CIRCLE_RING_THICKNESS,
  computeCircleGalleryGeometry,
  sampleCircleGalleryState,
  getFocusAngleRad,
} from '../styles';
import {
  buildBranchTreeLayout,
  resolveEffectiveBranchLayout,
  sampleBranchCamera,
} from '../styles/branchCore';
import { buildBrFlyerCalmFlightPlan } from '../styles/branch1Flyer';
import {
  getMetroLineColors,
  METRO_NEON_PALETTE,
  METRO_PASTEL_PALETTE,
} from '../styles/branch2Metro';
import { NEURAL_BRANCH_HUES } from '../styles/branch3Neural';
import { TREE_THEMES } from '../styles/branch4Tree';
import {
  applyScreenEdgeFeatherMask,
  DEFAULT_CAMERA_EDGE_FEATHER_RATIO,
} from '../styles/pointsCamera';
import {
  buildHorizontalCardsFlyerPlan,
  buildPhraseFlyerPlan,
  buildPointsFlyerPlan,
  computeCubicBezierSegmentFromTangents,
  computeFireflyGlowIntensity,
  evaluateCubicBezier,
  getHorizontalLineRevealEdgeX,
  measureCubicBezierLength,
  sampleCalmFlight,
  sampleFlightWaypoints,
} from '../styles/flyer_core';
import { fitImageSlotInBox } from '../styles/image1Polaroid';
import { buildAutoFitPointsLayout, PTS_CLEAN_CONFIG } from '../styles/points1Clean';
import { getPtsTimelineInteractiveTargets } from '../styles/points4Timeline';
import { fitVideoShellInBox } from '../styles/videoShared';
import {
  ArabicFontFamily,
  BackgroundMode,
  BranchStyleId,
  BranchTreeData,
  GalleryItemConfig,
  GalleryRuntimeMediaEntry,
  GalleryStyleId,
  ChatMessage,
  ChatStyleId,
  FlyerCreatureId,
  FlyerCricketPresetId,
  ImageStyleId,
  PhrasePosition,
  PointsItem,
  PointsStyleId,
  QuoteContent,
  StyleCustomization,
  TimelineConfig,
  VideoStyleId,
} from '../types';
import { getCachedPtsTimelineBackdrop, getImageGreenPixelRatio } from './assetCache';
import {
  buildFlyerCricketGraph,
  buildSfxGraph,
  DEFAULT_FLYER_CRICKET_PRESET,
  DEFAULT_FLYER_CRICKET_VOLUME,
  FLYER_CRICKET_PRESETS,
  hasFlyerCricketAudio,
  resolveFlyerCricketPreset,
  resolveFlyerCricketVolume,
} from './sfx';

test('detectTextDirection and resolveTextDirection identify Arabic vs English strings and obey manual overrides', () => {
  // Pure Arabic
  assert.equal(detectTextDirection('العلم نور والجهل ظلام'), 'rtl');
  // Pure English
  assert.equal(detectTextDirection('The only way to do great work is to love what you do.'), 'ltr');
  // Mixed with numbers & symbols
  assert.equal(detectTextDirection('3 mistakes that destroy your productivity!'), 'ltr');
  assert.equal(detectTextDirection('٣ أخطاء تدمّر إنتاجيتك يومياً!'), 'rtl');
  // Empty defaults to RTL
  assert.equal(detectTextDirection(''), 'rtl');

  // Manual override takes precedence over content
  const customLtr: StyleCustomization = {
    mode: 'quote',
    styleId: 'midnight-blue',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#FFFFFF',
    textDirection: 'ltr',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    minimalShape: 'arch',
    seed: 1,
  };
  assert.equal(resolveTextDirection(customLtr, 'نص عربي'), 'ltr');

  const customRtl: StyleCustomization = {
    ...customLtr,
    textDirection: 'rtl',
  };
  assert.equal(resolveTextDirection(customRtl, 'English text'), 'rtl');

  const customAuto: StyleCustomization = {
    ...customLtr,
    textDirection: 'auto',
  };
  assert.equal(resolveTextDirection(customAuto, 'English quote'), 'ltr');
  assert.equal(resolveTextDirection(customAuto, 'اقتباس عربي'), 'rtl');
});

test('formatQuoteWithMarks produces English curly quotes when direction is ltr and Arabic guillemets when rtl', () => {
  const enQuote = 'Stay hungry, stay foolish';
  assert.equal(formatQuoteWithMarks(enQuote, 'guillemets', 'ltr'), '“Stay hungry, stay foolish”');
  assert.equal(formatQuoteWithMarks(enQuote, 'double', 'ltr'), '“Stay hungry, stay foolish”');
  assert.equal(formatQuoteWithMarks(enQuote, 'none', 'ltr'), 'Stay hungry, stay foolish');

  const arQuote = 'العلم نور';
  assert.equal(formatQuoteWithMarks(arQuote, 'guillemets', 'rtl'), '«العلم نور»');
});

test('getPhrasePositionBox handles left and right positioning for both LTR and RTL', () => {
  const rtlRight = getPhrasePositionBox('right', '16:9', 1920, 1080, 'rtl');
  assert.equal(rtlRight.align, 'right');
  assert.ok(rtlRight.boxX > 900);

  const ltrRight = getPhrasePositionBox('right', '16:9', 1920, 1080, 'ltr');
  assert.equal(ltrRight.align, 'left');

  const ltrLeft = getPhrasePositionBox('left', '16:9', 1920, 1080, 'ltr');
  assert.equal(ltrLeft.align, 'left');
  assert.ok(ltrLeft.boxX < 300);
});

test('layoutArabicQuote and typing engine properly compute LTR layouts, words, and typing reveal', () => {
  const ctx = createMockMeasureCtx();
  const enPhrase = 'The secret to *consistency* and momentum';
  const layout = layoutArabicQuote(ctx, {
    text: enPhrase,
    quotationMarks: 'none',
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: 700,
    minFontSize: 24,
    maxFontSize: 64,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.5,
    boxX: 100,
    boxY: 100,
    boxWidth: 800,
    boxHeight: 400,
    align: 'left',
    direction: 'ltr',
  });

  assert.ok(layout.lines.length >= 1);
  assert.equal(layout.direction, 'ltr');
  const kwWords = layout.words.filter((w) => w.isKeyword);
  assert.ok(kwWords.length >= 1);
  assert.equal(kwWords[0].text, 'consistency');

  // Verify LTR typing schedule
  const schedule = computeTypingScheduleForLayout(ctx, layout, 0.5, 18, 0.1);
  assert.ok(schedule.allSteps.length > 0);

  // Before typing starts
  const before = evaluateLineTypingAtTime(layout.lines[0], schedule.lines[0], 0.2, 'ltr');
  assert.equal(before.hasStarted, false);
  assert.equal(before.revealedRightX, layout.lines[0].leftX);

  // After typing finishes
  const after = evaluateLineTypingAtTime(
    layout.lines[0],
    schedule.lines[0],
    schedule.typingEndTime + 0.5,
    'ltr'
  );
  assert.equal(after.isFinished, true);
  assert.equal(after.revealedRightX, layout.lines[0].rightX);
});

test('all quote styles and phrase styles successfully compute event times for English content', () => {
  const ctx = createMockMeasureCtx();
  const timelineCfg = {
    enterDuration: 1.5,
    holdDuration: 5.0,
    exitDuration: 1.0,
    autoHold: false,
  };

  for (const style of ALL_STYLES_LIST) {
    const custom: StyleCustomization = {
      mode: style.mode,
      styleId: style.id,
      phraseStyleId: style.mode === 'phrase' ? (style.id as any) : 'calligraphy-ink',
      format: '16:9',
      position: 'center',
      backgroundMode: 'style',
      greenScreen: false,
      accentColor: style.defaultAccent,
      keywordColor: style.defaultKeywordColor || style.defaultAccent,
      textDirection: 'ltr',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1.0,
      minimalShape: 'arch',
      seed: 1042,
      typingSpeed: 18,
      pixelDensity: 2,
      terminalBootLine: false,
    };

    const events = getSceneEventTimes(
      ctx,
      {
        quoteText: 'The only way to do *great work* is to love what you do.',
        authorName: 'Steve Jobs',
        subtitle: 'Co-founder of Apple Inc.',
        photoSource: null,
        photoId: 'steve',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'guillemets',
      },
      timelineCfg,
      custom,
      {
        width: 1920,
        height: 1080,
        baseWidth: 1920,
        baseHeight: 1080,
        scale: 1,
      }
    );

    assert.ok(events.enterStart >= 0);
    assert.ok(Array.isArray(events.keywordTimes));
    assert.ok(events.keywordTimes.length >= 1);
  }
});

test('math helpers clamp, lerp, progress, and easing work deterministically', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);

  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(progress(1.5, 1.0, 2.0), 0.5);
  assert.equal(progress(0.5, 1.0, 2.0), 0);
  assert.equal(progress(2.5, 1.0, 2.0), 1);

  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);

  assert.equal(easeInCubic(0), 0);
  assert.equal(easeInCubic(1), 1);
  assert.ok(easeInCubic(0.5) < 0.5);

  assert.equal(easeInOutCubic(0.5), 0.5);
});

test('auto hold time calculates ~0.4s per word with minimum 4s in quote mode', () => {
  // 4-word quote -> minimum 4s
  assert.equal(computeAutoHoldDuration('العلم نور والجهل ظلام'), 4);

  // 15-word quote -> 15 * 0.4 = 6.0s
  const fifteenWords = 'واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة أحد اثنا ثلاثة أربعة خمسة';
  assert.equal(computeAutoHoldDuration(fifteenWords), 6);

  const timeline = getEffectiveTimeline(
    { enterDuration: 1.5, holdDuration: 5, exitDuration: 1.0, autoHold: true },
    fifteenWords
  );
  assert.equal(timeline.total, 8.5);
  assert.equal(timeline.exitStart, 7.5);

  // Extended enter duration up to 8s
  const longEnter = getEffectiveTimeline(
    { enterDuration: 7.5, holdDuration: 4.0, exitDuration: 1.0, autoHold: false },
    'اختبار'
  );
  assert.equal(longEnter.enter, 7.5);
  assert.equal(longEnter.total, 12.5);
});

test('phrase mode auto-hold (~0.35s/word, min 2s, max 8s) and auto-extension ensure >= 0.8s visibility', () => {
  assert.equal(computePhraseAutoHoldDuration('السر في *الاستمرارية*'), 2);
  const tenWords = 'واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة';
  assert.equal(computePhraseAutoHoldDuration(tenWords), 3.5);

  // Short manual hold on many words should auto-extend so >= 0.8s visibility remains
  const extended = getEffectiveTimeline(
    { enterDuration: 0.8, holdDuration: 1.5, exitDuration: 0.6, autoHold: false },
    tenWords,
    'phrase',
    0.75
  );
  assert.equal(extended.holdExtended, true);
  assert.ok(extended.hold > 1.5);
  assert.ok(extended.extendedReasonAr && extended.extendedReasonAr.length > 0);
});

test('parseKeywordMarkup handles single/multiple keywords, multi-word groups, escaped asterisks, unmatched warning, and tashkeel', () => {
  const parsed1 = parseKeywordMarkup('السر الحقيقي في *الاستمرارية* دائماً');
  assert.equal(parsed1.unmatchedAsteriskWarning, false);
  assert.deepEqual(parsed1.keywordGroups, ['الاستمرارية']);
  assert.equal(parsed1.flatTokens.length, 5);
  assert.equal(parsed1.flatTokens[3].text, 'الاستمرارية');
  assert.equal(parsed1.flatTokens[3].isKeyword, true);
  assert.equal(parsed1.flatTokens[3].groupId, 0);

  // Multi-word group + second keyword + tashkeel
  const parsed2 = parseKeywordMarkup('إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ*');
  assert.equal(parsed2.unmatchedAsteriskWarning, false);
  assert.deepEqual(parsed2.keywordGroups, ['العَمَلَ المُتَوَاصِلَ', 'الفَارِقَ']);
  const kwTokens = parsed2.flatTokens.filter((t) => t.isKeyword);
  assert.equal(kwTokens.length, 3);
  assert.equal(kwTokens[0].groupId, 0);
  assert.equal(kwTokens[1].groupId, 0);
  assert.equal(kwTokens[2].groupId, 1);

  // Escaped asterisk
  const parsedEsc = parseKeywordMarkup('ملاحظة \\* مهمة *جداً*');
  assert.equal(parsedEsc.unmatchedAsteriskWarning, false);
  assert.ok(parsedEsc.cleanText.includes('*'));
  assert.deepEqual(parsedEsc.keywordGroups, ['جداً']);

  // Unmatched asterisk ignored with warning flag
  const parsedUnmatched = parseKeywordMarkup('السر في *الاستمرارية');
  assert.equal(parsedUnmatched.unmatchedAsteriskWarning, true);
  assert.equal(parsedUnmatched.keywordGroups.length, 0);
  assert.ok(!parsedUnmatched.cleanText.includes('*'));
});

test('getPhrasePositionBox returns expected regions and disables left/right in 9:16', () => {
  const topBox = getPhrasePositionBox('top', '16:9', 1920, 1080);
  assert.equal(topBox.boxHeight, Math.round(1080 * 0.28));

  const rightBox16x9 = getPhrasePositionBox('right', '16:9', 1920, 1080);
  assert.equal(rightBox16x9.boxWidth, Math.round(1920 * 0.44));

  // In 9:16, right falls back to center box (~70% x 40%)
  const rightBox9x16 = getPhrasePositionBox('right', '9:16', 1080, 1920);
  const centerBox9x16 = getPhrasePositionBox('center', '9:16', 1080, 1920);
  assert.equal(rightBox9x16.boxX, centerBox9x16.boxX);
  assert.equal(rightBox9x16.boxWidth, centerBox9x16.boxWidth);
});

test('isGreenishColor and resolveBackgroundMode enforce background constraints', () => {
  assert.equal(isGreenishColor('#00FF00'), true);
  assert.equal(isGreenishColor('#A8FF35'), true);
  assert.equal(isGreenishColor('#FF3B5C'), false);
  assert.equal(isGreenishColor('#FFD400'), false);

  const mockCustom = {
    mode: 'phrase' as const,
    styleId: 'cinematic' as const,
    phraseStyleId: 'calligraphy-ink' as const,
    format: '16:9' as const,
    fontFamily: 'Aref Ruqaa' as const,
    quoteFontOverride: '' as const,
    authorFontOverride: '' as const,
    fontSizeMultiplier: 1,
    accentColor: '#FFD400',
    keywordColor: '#B3261E',
    quotationMarks: 'none' as const,
    vignetteIntensity: 0.4,
    grainIntensity: 0.3,
    backgroundBlur: 0.5,
    minimalShape: 'circle' as const,
    seed: 1,
    greenScreen: false,
    backgroundMode: 'green' as const,
    position: 'bottom' as const,
    annotationType: 'circle' as const,
  };
  assert.equal(resolveBackgroundMode(mockCustom), 'green');
  assert.equal(resolveBackgroundMode({ ...mockCustom, backgroundMode: undefined, greenScreen: true }), 'green');
  assert.equal(resolveBackgroundMode({ ...mockCustom, backgroundMode: undefined, greenScreen: false }), 'style');
});

test('buildExportFileName formats quote and phrase MP4 filenames accurately', () => {
  const baseCustom = {
    mode: 'quote' as const,
    styleId: 'cinematic' as const,
    phraseStyleId: 'calligraphy-ink' as const,
    format: '16:9' as const,
    fontFamily: 'Amiri' as const,
    quoteFontOverride: '' as const,
    authorFontOverride: '' as const,
    fontSizeMultiplier: 1,
    accentColor: '#FFD400',
    keywordColor: '#FFB800',
    quotationMarks: 'guillemets' as const,
    vignetteIntensity: 0.4,
    grainIntensity: 0.3,
    backgroundBlur: 0.5,
    minimalShape: 'circle' as const,
    seed: 1,
    greenScreen: false,
    backgroundMode: 'style' as const,
    position: 'center' as const,
  };
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'quote-cinematic-style-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      { ...baseCustom, mode: 'phrase', backgroundMode: 'green', position: 'bottom' },
      '4K',
      'mp4'
    ),
    'phrase-calligraphy-ink-green-bottom-4K.mp4'
  );
});

test('mulberry32 PRNG and deterministicWave produce identical output for identical seeds', () => {
  const rng1 = mulberry32(combineSeed(42, 10));
  const rng2 = mulberry32(combineSeed(42, 10));
  for (let i = 0; i < 10; i++) {
    assert.equal(rng1(), rng2());
  }

  const w1 = deterministicWave(2.35, 12345, 1.5);
  const w2 = deterministicWave(2.35, 12345, 1.5);
  assert.equal(w1, w2);
});

test('render size and target bitrate scale accurately for 1080p, 1440p, and 4K', () => {
  const s1080 = getRenderSize('16:9', '1080p');
  assert.equal(s1080.width, 1920);
  assert.equal(s1080.height, 1080);
  assert.equal(s1080.scale, 1);

  const s4kShorts = getRenderSize('9:16', '4K');
  assert.equal(s4kShorts.width, 2160);
  assert.equal(s4kShorts.height, 3840);
  assert.equal(s4kShorts.scale, 2);

  assert.equal(getTargetBitrate('1080p', 30, 'high'), 20_000_000);
  assert.equal(getTargetBitrate('4K', 30, 'high'), 80_000_000);
});

test('formatQuoteWithMarks preserves Arabic characters and diacritics intact', () => {
  const diacriticText = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
  assert.equal(formatQuoteWithMarks(diacriticText, 'guillemets'), '«إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ»');
  assert.equal(formatQuoteWithMarks(diacriticText, 'double'), '"إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ"');
  assert.equal(formatQuoteWithMarks(diacriticText, 'none'), 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ');
});

function createMockMeasureCtx(): CanvasRenderingContext2D {
  let currentFont = '700 48px Cairo';
  const parsePx = () => {
    const m = currentFont.match(/(\d+(?:\.\d+)?)px/);
    return m ? parseFloat(m[1]) : 48;
  };
  return {
    save() {},
    restore() {},
    get font() {
      return currentFont;
    },
    set font(v: string) {
      currentFont = v;
    },
    measureText(text: string) {
      const px = parsePx();
      const clusters = splitIntoKeystrokeClusters(text);
      return {
        width: clusters.length * px * 0.52,
      } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
}

test('PHRASE_STYLES_LIST has 6 styles including pixel_terminal, old_typewriter, and phrase_flyer', () => {
  assert.equal(PHRASE_STYLES_LIST.length, 6);
  assert.equal(PHRASE_STYLES_LIST[3].id, 'pixel_terminal');
  assert.equal(PHRASE_STYLES_LIST[3].nameAr, 'شاشة كمبيوتر سينمائية');
  assert.deepEqual(PHRASE_STYLES_LIST[3].supportedBackgrounds, ['style', 'black']);
  assert.equal(PHRASE_STYLES_LIST[3].recommendedBackground, 'black');

  assert.equal(PHRASE_STYLES_LIST[4].id, 'old_typewriter');
  assert.equal(PHRASE_STYLES_LIST[4].nameAr, 'آلة كتابة قديمة');
  assert.deepEqual(PHRASE_STYLES_LIST[4].supportedBackgrounds, ['style', 'green']);
  assert.equal(PHRASE_STYLES_LIST[4].recommendedBackground, 'green');

  assert.equal(PHRASE_STYLES_LIST[5].id, 'phrase_flyer');
  assert.equal(PHRASE_STYLES_LIST[5].recommendedBackground, 'black');
});

test('splitIntoKeystrokeClusters keeps Arabic base letters and harakat grouped per logical keystroke', () => {
  const clusters = splitIntoKeystrokeClusters('إِنَّ العَمَلَ');
  // Base letters: إ(نّ) + space + ا ل ع م ل => 8 clusters, diacritics stay attached to their base letters
  assert.equal(clusters.length, 8);
  assert.equal(clusters.join(''), 'إِنَّ العَمَلَ');
  assert.equal(countLogicalKeystrokes('إِنَّ *العَمَلَ*'), 8);
});

test('typing auto-hold extension guarantees typing finishes by enter + 0.35*hold and leaves >= 0.8s visibility', () => {
  const eighteenWords =
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه الإصرار اليومي والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة دائماً';
  const customSlow: StyleCustomization = {
    mode: 'phrase',
    styleId: 'pixel_terminal',
    phraseStyleId: 'pixel_terminal',
    format: '16:9',
    position: 'center',
    backgroundMode: 'black',
    greenScreen: false,
    accentColor: '#4DD8FF',
    keywordColor: '#FFB000',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    minimalShape: 'arch',
    seed: 1042,
    typingSpeed: 10,
    pixelDensity: 2,
    terminalBootLine: true,
  };

  const typingCfg = getTypingConfigForCustomization(customSlow);
  assert.ok(typingCfg);

  const eff = getEffectiveTimeline(
    { enterDuration: 0.8, holdDuration: 2.5, exitDuration: 0.6, autoHold: false },
    eighteenWords,
    'phrase',
    0.35,
    typingCfg
  );

  assert.equal(eff.holdExtended, true);
  assert.ok(eff.hold > 2.5);
  assert.ok(eff.extendedReasonAr && eff.extendedReasonAr.includes('تم تمديد وقت الثبات تلقائياً'));
});

test('pixel_terminal and old_typewriter pass all 5 phrase cases across 16:9 & 9:16, all positions, and supported backgrounds', () => {
  const ctx = createMockMeasureCtx();
  const phraseCases = [
    // (1) 3-word phrase with 1 keyword
    'السر في *الاستمرارية*',
    // (2) 8 words with 2 keywords + diacritics
    'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ* فِي حَيَاةِ الإِنْسَانِ',
    // (3) 18 words
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه *الإصرار اليومي* والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة دائماً',
    // (4) Keyword breaking across two lines
    'النجاح يبدأ من *الالتزام اليومي المستمر والعمل الدؤوب المثمر والمتواصل* دائماً',
    // (5) No keyword
    'الاستمرارية الهادئة تبني كل إنجاز عظيم',
  ];

  const styles: ('pixel_terminal' | 'old_typewriter')[] = ['pixel_terminal', 'old_typewriter'];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'top', 'bottom', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs: BackgroundMode[] = meta.supportedBackgrounds || ['style'];

    for (const phraseText of phraseCases) {
      for (const format of formats) {
        const baseW = format === '16:9' ? 1920 : 1080;
        const baseH = format === '16:9' ? 1080 : 1920;

        for (const position of positions) {
          for (const bgMode of supportedBgs) {
            const custom: StyleCustomization = {
              mode: 'phrase',
              styleId,
              phraseStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              minimalShape: 'arch',
              seed: 1042,
              typingSpeed: 18,
              pixelDensity: 2,
              terminalBootLine: false,
            };

            const posBox = getPhrasePositionBox(position, format, baseW, baseH);
            const isFullscreen = position === 'fullscreen';
            const innerW = Math.round(posBox.boxWidth * (isFullscreen ? 0.88 : 0.84));
            const innerH = Math.round(posBox.boxHeight * (isFullscreen ? 0.76 : 0.74));

            const layout = layoutArabicQuote(ctx, {
              text: phraseText,
              quotationMarks: 'none',
              fontFamily: meta.defaultQuoteFont,
              fontWeight: 700,
              minFontSize: 22,
              maxFontSize: isFullscreen ? 118 : 88,
              fontSizeMultiplier: 1.0,
              keywordScaleMultiplier: 1.0,
              lineHeightRatio: 1.48,
              boxX: posBox.boxX + (posBox.boxWidth - innerW) / 2,
              boxY: posBox.boxY + (posBox.boxHeight - innerH) / 2,
              boxWidth: innerW,
              boxHeight: innerH,
              align: posBox.align,
            });

            assert.ok(layout.lines.length >= 1);
            assert.ok(layout.totalHeight <= innerH * 1.15);

            // For case (4), verify keyword breaking across lines produces per-line rects
            if (phraseText === phraseCases[3]) {
              assert.ok(layout.keywordLineRects.length >= 1);
            }

            // Verify typing schedule and event times
            const timelineCfg = {
              enterDuration: 0.8,
              holdDuration: 2.5,
              exitDuration: 0.6,
              autoHold: false,
            };
            const events = getSceneEventTimes(
              ctx,
              {
                quoteText: phraseText,
                authorName: '',
                subtitle: '',
                photoSource: null,
                photoId: 'default',
                crop: { zoom: 1, offsetX: 0, offsetY: 0 },
                quotationMarks: 'none',
              },
              timelineCfg,
              custom,
              {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              }
            );

            assert.ok(events.enterStart >= 0);
            assert.ok(events.keystrokeTimes && events.keystrokeTimes.length > 0);
            assert.equal(events.isMechanicalTypewriter, styleId === 'old_typewriter');

            // Verify keystroke times are monotonically increasing
            for (let i = 1; i < events.keystrokeTimes!.length; i++) {
              assert.ok(events.keystrokeTimes![i] >= events.keystrokeTimes![i - 1]);
            }

            // Verify evaluateLineTypingAtTime progresses from unstarted to finished
            const schedule = computeTypingScheduleForLayout(
              ctx,
              layout,
              events.enterStart,
              18,
              styleId === 'old_typewriter' ? 0.14 : 0.08
            );
            const beforeState = evaluateLineTypingAtTime(layout.lines[0], schedule.lines[0], 0);
            assert.equal(beforeState.hasStarted, false);
            assert.equal(beforeState.revealedLeftX, layout.lines[0].rightX);

            const lastIdx = schedule.lines.length - 1;
            const afterState = evaluateLineTypingAtTime(
              layout.lines[lastIdx],
              schedule.lines[lastIdx],
              schedule.typingEndTime + 0.5
            );
            assert.equal(afterState.isFinished, true);
            assert.equal(afterState.revealedLeftX, layout.lines[lastIdx].leftX);
          }
        }
      }
    }
  }
});

function createMockCanvasContextForChat(): CanvasRenderingContext2D {
  const noop = () => {};
  const gradientMock = { addColorStop: noop };
  const imageDataMock = (w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
  });
  const makeCtx = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = {
      font: '700 40px Cairo',
      fillStyle: '#ffffff',
      strokeStyle: '#ffffff',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      direction: 'rtl',
      textAlign: 'right',
      textBaseline: 'middle',
      imageSmoothingEnabled: true,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      bezierCurveTo: noop,
      arc: noop,
      ellipse: noop,
      rect: noop,
      roundRect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      strokeRect: noop,
      clearRect: noop,
      fillText: noop,
      strokeText: noop,
      drawImage: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      transform: noop,
      setTransform: noop,
      setLineDash: noop,
      createLinearGradient: () => gradientMock,
      createRadialGradient: () => gradientMock,
      createPattern: () => ({}),
      createImageData: (w: number, h: number) => imageDataMock(w, h),
      putImageData: noop,
      measureText: (str: string) => {
        const m = String(ctx.font).match(/(\d+(?:\.\d+)?)px/);
        const px = m ? parseFloat(m[1]) : 32;
        return { width: Array.from(str).length * px * 0.52 };
      },
    };
    return ctx;
  };

  if (typeof globalThis.document === 'undefined') {
    (globalThis as unknown as Record<string, unknown>).document = {
      createElement: () => ({
        width: 100,
        height: 100,
        getContext: () => makeCtx(),
      }),
    };
  }

  return makeCtx() as unknown as CanvasRenderingContext2D;
}

test('Chat mode: quick-paste parser, position boxes, export filename, and bidi runs', () => {
  // 1) Quick-paste parser
  const parsed = parseQuickPasteChatMessages(
    'س: كيف أتعلم TypeScript بسرعة؟\n\nج: ابدأ ببناء مشروع *حقيقي* صغير اليوم.\n   \nس:   \nج: بالتوفيق!'
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].role, 'user');
  assert.equal(parsed[0].text, 'كيف أتعلم TypeScript بسرعة؟');
  assert.equal(parsed[1].role, 'ai');
  assert.equal(parsed[1].text, 'ابدأ ببناء مشروع *حقيقي* صغير اليوم.');
  assert.equal(parsed[2].role, 'ai');
  assert.equal(parsed[2].text, 'بالتوفيق!');

  // 2) Chat window region dimensions
  const centerBox = getChatPositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((centerBox.boxWidth / 1920) * 100), 62);
  assert.equal(Math.round((centerBox.boxHeight / 1080) * 100), 84);

  const rightBox = getChatPositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((rightBox.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((rightBox.boxHeight / 1080) * 100), 84);

  const leftBox = getChatPositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((leftBox.boxWidth / 1920) * 100), 44);
  assert.ok(leftBox.boxX < rightBox.boxX);

  const fullBox = getChatPositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((fullBox.boxX / 1920) * 100), 6);
  assert.equal(Math.round((fullBox.boxWidth / 1920) * 100), 88);

  // In 9:16, left/right fallback safely to center
  const vertRight = getChatPositionBox('right', '9:16', 1080, 1920);
  const vertCenter = getChatPositionBox('center', '9:16', 1080, 1920);
  assert.equal(vertRight.boxX, vertCenter.boxX);
  assert.equal(vertRight.boxWidth, vertCenter.boxWidth);

  // 3) Export filename contract: chat-{style}-{bg}-{position}-{res}.mp4
  const fn1 = buildExportFileName(
    {
      mode: 'chat',
      styleId: 'midnight-blue',
      chatStyleId: 'chat_modern',
      format: '16:9',
      position: 'right',
      backgroundMode: 'green',
      greenScreen: true,
      accentColor: '#4C8DFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 42,
      minimalShape: 'arch',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fn1, 'chat-chat_modern-green-right-1080p.mp4');

  // 4) Bidi segmentation: never splits Arabic into individual characters, keeps Latin/numbers LTR
  const runs = segmentTextIntoBidiRuns('مرحبا OpenAI 2025 في عالم AI');
  assert.ok(runs.length >= 3);
  assert.equal(runs[0].direction, 'rtl');
  assert.ok(runs[0].text.includes('مرحبا'));

  // 5) Extended timing bounds: thinkingDelay up to 10s and messageGap up to 3s
  const extendedSched = computeChatSchedule(
    DEFAULT_CHAT_MESSAGES,
    {
      userTypingSpeed: 18,
      aiReplySpeed: 9,
      thinkingDelay: 10,
      messageGap: 3,
      endHold: 2,
    },
    'chat_modern'
  );
  assert.equal(extendedSched.items.length, 2);
  const userEnd = extendedSched.items[0].endTime;
  const aiStart = extendedSched.items[1].startTime;
  assert.equal(Number((aiStart - userEnd).toFixed(2)), 3.0);
  assert.equal(
    Number((extendedSched.items[1].thinkingEnd - extendedSched.items[1].thinkingStart).toFixed(2)),
    10.0
  );
});

test('Chat mode: both styles, both formats, all positions, all backgrounds across all 6 test scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  const sixtyWordReply = Array.from(
    { length: 12 },
    (_, i) => `هذه فقرة تفصيلية رقم ${i + 1} تشرح كيف يعمل *الذكاء* الاصطناعي بدقة`
  ).join(' ');

  const testCases: { name: string; messages: ChatMessage[] }[] = [
    {
      name: '1 question + 1 short reply',
      messages: [
        { id: 'm1', role: 'user', text: 'ما هو سر النجاح المستدام؟' },
        { id: 'm2', role: 'ai', text: 'السر يكمن في *الاستمرارية* والتعلم اليومي.' },
      ],
    },
    {
      name: '3 exchanges (6 messages)',
      messages: [
        { id: 'e1', role: 'user', text: 'كيف أبدأ مشروعاً تقنياً؟' },
        { id: 'e2', role: 'ai', text: 'ابدأ بحل *مشكلة* حقيقية تواجه المستخدمين.' },
        { id: 'e3', role: 'user', text: 'وماذا عن اختيار التقنيات؟' },
        { id: 'e4', role: 'ai', text: 'اختر الأدوات التي تتقنها لإطلاق *النسخة* الأولى سريعاً.' },
        { id: 'e5', role: 'user', text: 'متى أطلق المنتج للجمهور؟' },
        { id: 'e6', role: 'ai', text: 'فور جهوزية الميزة الأساسية واختبارها.' },
      ],
    },
    {
      name: 'One 60-word reply that forces scrolling',
      messages: [
        { id: 's1', role: 'user', text: 'اشرح لي خطة العمل بالتفصيل الكامل.' },
        { id: 's2', role: 'ai', text: sixtyWordReply },
      ],
    },
    {
      name: 'Mixed Arabic + English/numbers',
      messages: [
        { id: 'b1', role: 'user', text: 'هل إصدار TypeScript 5.4 يدعم React 19 بشكل كامل؟' },
        { id: 'b2', role: 'ai', text: 'نعم، يعمل بكفاءة 100% مع *WebCodecs* و Vite 6.' },
      ],
    },
    {
      name: 'Keyword breaking across two lines',
      messages: [
        { id: 'k1', role: 'user', text: 'ما أهم ركيزة في هندسة البرمجيات الحديثة؟' },
        {
          id: 'k2',
          role: 'ai',
          text: 'إن أهم ركيزة على الإطلاق في الأنظمة الكبيرة هي *البساطة المعمارية القابلة للصيانة والتطوير المستمر* عبر السنين.',
        },
      ],
    },
    {
      name: 'Empty message ignored cleanly',
      messages: [
        { id: 'z0', role: 'user', text: '   ' },
        { id: 'z1', role: 'user', text: 'سؤال فعلي بعد رسالة فارغة؟' },
        { id: 'z2', role: 'ai', text: '' },
        { id: 'z3', role: 'ai', text: 'تم تجاهل الرسائل الفارغة بنجاح وعرض *الجواب* السليم.' },
      ],
    },
  ];

  const styles: ChatStyleId[] = ['chat_modern', 'chat_terminal'];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs = meta.supportedBackgrounds || ['style', 'black'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {
          for (const tc of testCases) {
            const custom: StyleCustomization = {
              mode: 'chat',
              styleId: 'midnight-blue',
              chatStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 101,
              minimalShape: 'arch',
              pixelDensity: 1, // use 1 in unit test to avoid document.createElement in node
              chatMessages: tc.messages,
              chatUserLabel: 'أنا',
              chatAiLabel: 'الذكاء الاصطناعي',
              chatTiming: DEFAULT_CHAT_TIMING,
              chatTheme: 'dark',
              chatAiReplyStyle: 'plain',
              chatSwapSides: false,
            };

            const timelineCfg = {
              enterDuration: 0.6,
              holdDuration: 4,
              exitDuration: 0.6,
              autoHold: true,
            };

            const contentObj = {
              quoteText: '',
              authorName: '',
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              chatMessages: tc.messages,
              userLabel: 'أنا',
              aiLabel: 'الذكاء الاصطناعي',
            };

            const eff = getEffectiveTimeline(
              timelineCfg,
              '',
              'chat',
              0.35,
              getTypingConfigForCustomization(custom)
            );
            assert.ok(eff.total > 2.0, `Total duration should be > 2s for ${tc.name}`);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: timelineCfg,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.equal(events.enterStart, 0.6);
            assert.ok(Array.isArray(events.keywordTimes));
            assert.ok(Array.isArray(events.sendTimes) && events.sendTimes.length >= 1);
            assert.ok(Array.isArray(events.receiveTimes) && events.receiveTimes.length >= 1);
            assert.ok(Array.isArray(events.keystrokeTimes) && events.keystrokeTimes.length >= 1);

            // Render frames at intro, mid-stream, endHold, and exit without throwing
            const sampleTimes = [0.2, eff.total * 0.45, eff.exitStart - 0.3, eff.total - 0.2];
            for (const t of sampleTimes) {
              renderQuoteFrame(
                ctx,
                t,
                contentObj,
                timelineCfg,
                custom,
                {
                  width: baseW,
                  height: baseH,
                  baseWidth: baseW,
                  baseHeight: baseH,
                  scale: 1,
                }
              );
            }
          }
        }
      }
    }
  }
});

test('Points mode: quick-paste parser, position boxes, markers, schedule auto-hold extension, and export filename', () => {
  // 1) Quick-paste parser strips leading "-", "•", "1.", "١." and ignores empty lines
  const parsed = parseQuickPastePointsItems(
    '- وضوح الهدف قبل البدء\n\n• القوة الحقيقية تكمن في *الاستمرارية*\n1. التعلم السريع من الأخطاء\n١. الالتزام اليومي\n   '
  );
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].text, 'وضوح الهدف قبل البدء');
  assert.equal(parsed[1].text, 'القوة الحقيقية تكمن في *الاستمرارية*');
  assert.equal(parsed[2].text, 'التعلم السريع من الأخطاء');
  assert.equal(parsed[3].text, 'الالتزام اليومي');

  // 2) Marker formatting
  assert.equal(toArabicIndicDigits(12), '١٢');
  assert.equal(formatPointMarker(0, 'arabic-indic', 3), '١');
  assert.equal(formatPointMarker(0, 'western', 3), '1');
  assert.equal(formatPointMarker(0, 'bullets', 3), '•');
  assert.equal(formatPointMarker(0, 'checks', 3), '✓');
  assert.equal(formatPointMarker(0, 'none', 3), '');
  // Countdown marker for pts_ranking: first gets N, last gets 1
  assert.equal(formatPointMarker(0, 'arabic-indic', 4, true), '٤');
  assert.equal(formatPointMarker(3, 'arabic-indic', 4, true), '١');

  // 3) Points region dimensions: center ~70% w x 80% h; left/right ~44% w x 84% h; fullscreen = 6% margin
  const centerBox = getPointsPositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((centerBox.boxWidth / 1920) * 100), 70);
  assert.equal(Math.round((centerBox.boxHeight / 1080) * 100), 80);

  const rightBox = getPointsPositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((rightBox.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((rightBox.boxHeight / 1080) * 100), 84);

  const leftBox = getPointsPositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((leftBox.boxWidth / 1920) * 100), 44);
  assert.ok(leftBox.boxX < rightBox.boxX);

  const fullBox = getPointsPositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((fullBox.boxX / 1920) * 100), 6);
  assert.equal(Math.round((fullBox.boxWidth / 1920) * 100), 88);

  // 4) Schedule & endHold auto-extension when < 0.8s of full visibility would remain after the last item
  const schedDefault = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    DEFAULT_POINTS_TIMING,
    'pts_clean'
  );
  assert.equal(schedDefault.introDuration, 0.6);
  assert.equal(schedDefault.itemTimes.length, 3);
  assert.deepEqual(schedDefault.itemTimes, [0.6, 1.8, 3.0]);

  // Export filename contract: points-{style}-{bg}-{position}-{res}.mp4
  const fnPoints = buildExportFileName(
    {
      mode: 'points',
      styleId: 'midnight-blue',
      pointsStyleId: 'pts_timeline',
      format: '16:9',
      position: 'left',
      backgroundMode: 'green',
      greenScreen: true,
      accentColor: '#2F6BFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 42,
      minimalShape: 'arch',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fnPoints, 'points-pts_timeline-green-left-1080p.mp4');

  // Verify POINTS_STYLES_LIST has all 4 active styles (3 core + 1 flyer)
  assert.equal(POINTS_STYLES_LIST.length, 4);
  assert.deepEqual(
    POINTS_STYLES_LIST.map((s) => s.id),
    [
      'pts_clean',
      'pts_timeline',
      'pts_ranking',
      'pts_flyer',
    ]
  );

  // Verify countPointsStats warnings
  const stats = countPointsStats(DEFAULT_POINTS_TITLE, DEFAULT_POINTS_ITEMS);
  assert.equal(stats.hasLongItem, false);
  assert.ok(stats.totalWords > 5 && stats.totalWords < 80);
});

test('Points mode: all 6 styles, both formats, all positions, all supported backgrounds across all 7 required scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  const testScenarios: { name: string; title: string; items: PointsItem[] }[] = [
    {
      name: '1) 2 short items',
      title: 'نقطتان أساسيتان',
      items: [
        { id: 's1', text: 'التركيز العميق كل صباح' },
        { id: 's2', text: 'المراجعة المستمرة للنتائج' },
      ],
    },
    {
      name: '2) 5 items',
      title: '٥ خطوات لبناء مشروع ناجح',
      items: [
        { id: 'f1', text: 'تحديد المشكلة الحقيقية بدقة' },
        { id: 'f2', text: 'بناء نموذج أولي سريع *MVP*' },
        { id: 'f3', text: 'اختبار المنتج مع مستخدمين حقيقيين' },
        { id: 'f4', text: 'تحسين الأداء وتجربة الاستخدام' },
        { id: 'f5', text: 'التوسع التدريجي المدروس' },
      ],
    },
    {
      name: '3) 8 items with long text',
      title: '٨ مبادئ شاملة للإنتاجية والعمل الاحترافي',
      items: Array.from({ length: 8 }, (_, idx) => ({
        id: `l-${idx + 1}`,
        text: `المبدأ رقم ${idx + 1} يركز على تنظيم الوقت وتوزيع المهام المعقدة إلى خطوات يومية واضحة قابلة للتنفيذ والقياس المستمر`,
      })),
    },
    {
      name: '4) items with diacritics and a keyword',
      title: 'حِكَمٌ فِي *الإِتْقَانِ*',
      items: [
        { id: 'd1', text: 'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ الفَارِقَ الحَقِيقِيَّ' },
        { id: 'd2', text: 'الصَّبْرُ وَالثَّبَاتُ عِنْدَ الشَّدَائِدِ مِفْتَاحُ *النَّجَاحِ*' },
        { id: 'd3', text: 'العِلْمُ نُورٌ يَهْدِي العَقْلَ إِلَى الصَّوَابِ' },
      ],
    },
    {
      name: '5) a keyword breaking across two lines',
      title: 'القاعدة الذهبية',
      items: [
        {
          id: 'k1',
          text: 'النجاح المستدام يعتمد على *الالتزام اليومي المستمر والعمل الدؤوب المثمر والمتواصل دون انقطاع* طوال العام',
        },
        {
          id: 'k2',
          text: 'التطوير التدريجي يحقق نتائج مضاعفة على المدى البعيد',
        },
      ],
    },
    {
      name: '6) mixed Arabic + English/numbers',
      title: 'تقنيات الويب في 2025',
      items: [
        { id: 'm1', text: 'استخدام TypeScript 5.4 مع React 19 لبناء واجهات قوية' },
        { id: 'm2', text: 'تصدير الفيديو بسرعة 60fps عبر *WebCodecs API* مباشرة' },
        { id: 'm3', text: 'تحسين الأداء بنسبة 100% باستخدام OffscreenCanvas' },
      ],
    },
    {
      name: '7) an empty item ignored cleanly',
      title: '٣ أسرار للنجاح',
      items: [
        { id: 'e0', text: '   ' },
        { id: 'e1', text: 'وضوح الرؤية منذ البداية' },
        { id: 'e2', text: '' },
        { id: 'e3', text: 'الاستمرار في *التطوير* اليومي' },
      ],
    },
  ];

  const styles: PointsStyleId[] = [
    'pts_clean',
    'pts_timeline',
    'pts_ranking',
  ];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs = meta.supportedBackgrounds || ['style', 'green', 'black'];
    const supportedMarkers = meta.supportedMarkerTypes || ['arabic-indic'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {
          for (const scenario of testScenarios) {
            const custom: StyleCustomization = {
              mode: 'points',
              styleId,
              pointsStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 1042,
              minimalShape: 'arch',
              pixelDensity: 1,
              pointsMarkerType: supportedMarkers[0],
              pointsHighlightCurrent: true,
              pointsTitle: scenario.title,
              pointsItems: scenario.items,
              pointsTiming: {
                revealInterval: styleId === 'pts_ranking' ? 2.5 : 1.2,
                autoInterval: false,
                endHold: 2.0,
              },
            };

            const timelineCfg = {
              enterDuration: 0.6,
              holdDuration: 4.0,
              exitDuration: 0.6,
              autoHold: false,
            };

            const contentObj = {
              quoteText: '',
              authorName: '',
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              pointsTitle: scenario.title,
              pointsItems: scenario.items,
              pointsTiming: custom.pointsTiming,
            };

            const eff = getEffectiveTimeline(
              timelineCfg,
              '',
              'points',
              0.35,
              getTypingConfigForCustomization(custom)
            );
            assert.ok(eff.total > 2.5, `Total duration should be > 2.5s for ${scenario.name}`);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: timelineCfg,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.equal(events.enterStart, 0.6);
            assert.ok(Array.isArray(events.itemTimes) && events.itemTimes.length >= 2);
            assert.ok(Array.isArray(events.keywordTimes));

            // Render frames at intro, mid-reveal, endHold (all visible), and exit without throwing
            const sampleTimes = [0.2, eff.total * 0.45, eff.exitStart - 0.3, eff.total - 0.15];
            for (const t of sampleTimes) {
              renderQuoteFrame(ctx, t, contentObj, timelineCfg, custom, {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              });
            }
          }
        }
      }
    }
  }
});

test('Image Insert ("صورة") mode: regions, backgrounds, export filename, green pixel detector, and event times', () => {
  // 1) Region dimensions:
  // center ~64% w x 76% h; left/right ~44% w x 80% h; corners ~34% w x 40% h (in 9:16: ~60% w x 26% h); fullscreen = safe area (6% margin)
  const center169 = getImagePositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((center169.boxWidth / 1920) * 100), 64);
  assert.equal(Math.round((center169.boxHeight / 1080) * 100), 76);

  const right169 = getImagePositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((right169.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((right169.boxHeight / 1080) * 100), 80);

  const left169 = getImagePositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((left169.boxWidth / 1920) * 100), 44);
  assert.ok(left169.boxX < right169.boxX);

  const topRight169 = getImagePositionBox('top-right', '16:9', 1920, 1080);
  assert.equal(Math.round((topRight169.boxWidth / 1920) * 100), 34);
  assert.equal(Math.round((topRight169.boxHeight / 1080) * 100), 40);

  const bottomLeft916 = getImagePositionBox('bottom-left', '9:16', 1080, 1920);
  assert.equal(Math.round((bottomLeft916.boxWidth / 1080) * 100), 60);
  assert.equal(Math.round((bottomLeft916.boxHeight / 1920) * 100), 26);

  const full169 = getImagePositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((full169.boxX / 1920) * 100), 6);
  assert.equal(Math.round((full169.boxWidth / 1920) * 100), 88);

  // In 9:16, left/right fallback safely to center
  const vertRight = getImagePositionBox('right', '9:16', 1080, 1920);
  const vertCenter = getImagePositionBox('center', '9:16', 1080, 1920);
  assert.equal(vertRight.boxX, vertCenter.boxX);
  assert.equal(vertRight.boxWidth, vertCenter.boxWidth);

  // 2) Verify all 6 Image styles exist
  assert.equal(IMAGE_STYLES_LIST.length, 6);
  assert.deepEqual(
    IMAGE_STYLES_LIST.map((s) => s.id),
    [
      'img_polaroid',
      'img_browser',
      'img_newspaper',
      'img_cinematic',
      'img_floating',
      'img_spotlight',
    ]
  );
  for (const st of IMAGE_STYLES_LIST) {
    assert.ok(st.supportedBackgrounds?.includes('black'), `${st.id} must support black`);
    assert.ok(st.supportedBackgrounds?.includes('style'));
    assert.ok(st.supportedBackgrounds?.includes('green'));
  }

  // All positions in image mode respect 'style', 'green', and 'black'
  const baseImgCustom: StyleCustomization = {
    mode: 'image',
    styleId: 'midnight-blue',
    imageStyleId: 'img_polaroid',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#D64045',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    seed: 42,
    minimalShape: 'arch',
  };
  assert.equal(resolveBackgroundMode(baseImgCustom), 'style');
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'fullscreen',
      backgroundMode: 'style',
    }),
    'style'
  );
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'center',
      backgroundMode: 'black',
    }),
    'black'
  );
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'top-right',
      backgroundMode: 'green',
    }),
    'green'
  );

  // 3) Export filename contract: image-{style}-{bg}-{position}-{res}.mp4
  const fnImg = buildExportFileName(
    {
      ...baseImgCustom,
      imageStyleId: 'img_spotlight',
      position: 'top-right',
      backgroundMode: 'green',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fnImg, 'image-img_spotlight-green-top-right-1080p.mp4');

  // 4) Green-hue pixel detection
  assert.equal(isRgbPixelGreenHue(0, 255, 0, 255), true);
  assert.equal(isRgbPixelGreenHue(40, 210, 60, 255), true);
  assert.equal(isRgbPixelGreenHue(220, 40, 50, 255), false);
  assert.equal(isRgbPixelGreenHue(0, 255, 0, 0), false); // transparent ignored
});

test('Image Insert ("صورة") mode: all 6 styles, both formats, every position and supported background across all 7 required scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  // Helper to create mock image sources of different aspect ratios / green pixel ratios
  function createMockImageCanvas(
    w: number,
    h: number,
    options?: { greenRatio?: number; transparentCorners?: boolean }
  ): HTMLCanvasElement {
    const greenRatio = options?.greenRatio ?? 0;
    const transparentCorners = options?.transparentCorners ?? false;
    const mockCanvas = {
      width: w,
      height: h,
      getContext: () => {
        const innerCtx = createMockCanvasContextForChat() as unknown as Record<string, unknown>;
        innerCtx.getImageData = (_x: number, _y: number, gw: number, gh: number) => {
          const total = gw * gh;
          const data = new Uint8ClampedArray(total * 4);
          const greenCount = Math.floor(total * greenRatio);
          for (let i = 0; i < total; i++) {
            const idx = i * 4;
            if (transparentCorners && i < Math.floor(total * 0.15)) {
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = 0;
            } else if (i < greenCount) {
              data[idx] = 20;
              data[idx + 1] = 230;
              data[idx + 2] = 45;
              data[idx + 3] = 255;
            } else {
              data[idx] = 40;
              data[idx + 1] = 90;
              data[idx + 2] = 180;
              data[idx + 3] = 255;
            }
          }
          return { data, width: gw, height: gh };
        };
        return innerCtx;
      },
    };
    return mockCanvas as unknown as HTMLCanvasElement;
  }

  // Also ensure globalThis.document.createElement supports getImageData for getImageGreenPixelRatio
  const origDoc = (globalThis as unknown as Record<string, unknown>).document as {
    createElement: (tag: string) => unknown;
  };
  let activeGreenSimRatio = 0;
  (globalThis as unknown as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      const el = origDoc.createElement(tag) as {
        width: number;
        height: number;
        getContext: () => Record<string, unknown>;
      };
      const origGetContext = el.getContext;
      el.getContext = () => {
        const c = origGetContext();
        c.getImageData = (_x: number, _y: number, gw: number, gh: number) => {
          const total = gw * gh;
          const data = new Uint8ClampedArray(total * 4);
          const greenCount = Math.floor(total * activeGreenSimRatio);
          for (let i = 0; i < total; i++) {
            const idx = i * 4;
            if (i < greenCount) {
              data[idx] = 15;
              data[idx + 1] = 240;
              data[idx + 2] = 35;
              data[idx + 3] = 255;
            } else {
              data[idx] = 35;
              data[idx + 1] = 75;
              data[idx + 2] = 165;
              data[idx + 3] = 255;
            }
          }
          return { data, width: gw, height: gh };
        };
        return c;
      };
      return el;
    },
  };

  // All 7 required test scenarios:
  // 1) wide screenshot
  // 2) tall portrait photo
  // 3) square logo PNG with transparency
  // 4) long caption with diacritics
  // 5) keyword breaking across two lines
  // 6) no caption
  // 7) image with >8% green pixels
  const scenarios = [
    {
      name: '1) Wide screenshot (16:9)',
      photoId: 'test-wide-screenshot',
      photoSource: createMockImageCanvas(1920, 1080),
      caption: 'لقطة شاشة عريضة تبيّن *نمو الأداء* خلال الربع الأخير',
      sourceLine: 'المصدر: لوحة التحليلات ٢٠٢٥',
      greenSimRatio: 0.01,
    },
    {
      name: '2) Tall portrait photo (9:16)',
      photoId: 'test-tall-portrait',
      photoSource: createMockImageCanvas(1080, 1920),
      caption: 'صورة طولية عالية الدقة مع *تأطير متوازن*',
      sourceLine: 'المصدر: الأرشيف الفوتوغرافي',
      greenSimRatio: 0.0,
    },
    {
      name: '3) Square logo PNG with transparency',
      photoId: 'test-square-transparent-png',
      photoSource: createMockImageCanvas(800, 800, { transparentCorners: true }),
      caption: 'شعار مربّع بخلفية شفافة *PNG* محفوظة بالكامل',
      sourceLine: 'المصدر: الهوية البصرية',
      greenSimRatio: 0.0,
    },
    {
      name: '4) Long caption with Arabic diacritics (tashkeel)',
      photoId: 'test-long-diacritics',
      photoSource: createMockImageCanvas(1600, 1000),
      caption:
        'إِنَّ *التَّخْطِيطَ الاسْتِرَاتِيجِيَّ المُتْقَنَ* وَالمُتَابَعَةَ الدَّقِيقَةَ لِمُؤَشِّرَاتِ النُّمُوِّ يَصْنَعَانِ فَارِقاً جَوْهَرِيّاً فِي نَجَاحِ المَشَارِيعِ الحَدِيثَةِ',
      sourceLine: 'المصدر: مَجَلَّةُ الإِدَارَةِ وَالأَعْمَالِ',
      greenSimRatio: 0.0,
    },
    {
      name: '5) Keyword breaking across two lines',
      photoId: 'test-keyword-two-lines',
      photoSource: createMockImageCanvas(1400, 900),
      caption:
        'تُظهر هذه الوثيقة التاريخية أهمّية *التحول الرقمي المتكامل والابتكار المستمر في البنية التحتية التقنية* على المدى الطويل',
      sourceLine: 'المصدر: التقرير التقني الشامل',
      greenSimRatio: 0.0,
    },
    {
      name: '6) No caption and no source line',
      photoId: 'test-no-caption',
      photoSource: createMockImageCanvas(1280, 720),
      caption: '',
      sourceLine: '',
      greenSimRatio: 0.0,
    },
    {
      name: '7) Image with >8% green pixels',
      photoId: 'test-green-pixels-image',
      photoSource: createMockImageCanvas(1200, 800, { greenRatio: 0.22 }),
      caption: 'صورة تحتوي على *مساحات خضراء* تتجاوز الحد المسموح للكروما',
      sourceLine: 'المصدر: اختبار الكروما الخضراء',
      greenSimRatio: 0.22,
    },
  ];

  // Verify scenario 7 triggers >8% green pixel detection
  activeGreenSimRatio = 0.22;
  const detectedGreenRatio = getImageGreenPixelRatio(
    scenarios[6].photoSource,
    scenarios[6].photoId
  );
  assert.ok(
    detectedGreenRatio > 0.08,
    `Expected >8% green pixels for scenario 7, got ${detectedGreenRatio}`
  );

  activeGreenSimRatio = 0.01;
  const detectedLowGreenRatio = getImageGreenPixelRatio(
    scenarios[0].photoSource,
    scenarios[0].photoId
  );
  assert.ok(
    detectedLowGreenRatio <= 0.08,
    `Expected <=8% green pixels for scenario 1, got ${detectedLowGreenRatio}`
  );

  const styles: ImageStyleId[] = [
    'img_polaroid',
    'img_browser',
    'img_newspaper',
    'img_cinematic',
    'img_floating',
    'img_spotlight',
  ];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = [
    'center',
    'right',
    'left',
    'top-right',
    'top-left',
    'bottom-right',
    'bottom-left',
    'fullscreen',
  ];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs: BackgroundMode[] = ['style', 'green', 'black'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {

          for (const sc of scenarios) {
            const custom: StyleCustomization = {
              mode: 'image',
              styleId: 'midnight-blue',
              imageStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 2025,
              minimalShape: 'arch',
              imageCaption: sc.caption,
              imageSourceLine: sc.sourceLine,
              imageFit: meta.defaultImageFit || 'cover',
              imageScale: 1.0,
              imagePushIn: true,
              newspaperKeepColor: false,
              cinematicGrade: true,
              spotlightRegion: DEFAULT_SPOTLIGHT_REGION,
              spotlightShape: 'circle',
            };

            const contentObj = {
              quoteText: sc.caption,
              authorName: sc.sourceLine,
              subtitle: '',
              photoSource: sc.photoSource,
              photoId: sc.photoId,
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              imageCaption: sc.caption,
              imageSourceLine: sc.sourceLine,
            };

            const eff = getEffectiveTimeline(
              DEFAULT_IMAGE_TIMELINE,
              sc.caption,
              'image'
            );
            assert.equal(eff.enter, 0.8);
            assert.equal(eff.hold, 3.0);
            assert.equal(eff.exit, 0.6);
            assert.equal(eff.total, 4.4);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: DEFAULT_IMAGE_TIMELINE,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.ok(events.enterStart >= 0 && events.enterStart <= 0.1);
            assert.ok(Array.isArray(events.keywordTimes));
            assert.ok(Array.isArray(events.annotationTimes));
            if (styleId === 'img_spotlight') {
              assert.ok(events.annotationTimes.length >= 1);
            }

            // Render frames at enter (0.3s), hold (2.0s), and exit (4.1s) without throwing
            for (const t of [0.3, 2.0, 4.1]) {
              renderQuoteFrame(ctx, t, contentObj, DEFAULT_IMAGE_TIMELINE, custom, {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              });
            }
          }
        }
      }
    }
  }
});

test('Almarai Regular, Bold, and ExtraBold 800 are available in all 25 styles primary font list, excluded from Quote author list, and resolved cleanly for Canvas', () => {
  const almaraiVariants: ArabicFontFamily[] = [
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ];

  // 1) Primary Arabic fonts list contains all three weights
  for (const variant of almaraiVariants) {
    assert.ok(
      ARABIC_FONTS_LIST.some((f) => f.family === variant),
      `ARABIC_FONTS_LIST must include ${variant}`
    );
  }

  // 2) Author Arabic fonts list omits Almarai Bold & ExtraBold
  assert.ok(AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai'));
  assert.ok(!AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai Bold'));
  assert.ok(!AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai ExtraBold'));

  // 3) Every single style in ALL_STYLES_LIST (all 40 styles across modes + 6 gallery styles) allows all 3 Almarai variants
  assert.equal(ALL_STYLES_LIST.length, 40);
  for (const st of ALL_STYLES_LIST) {
    if (st.allowedFonts && st.allowedFonts.length > 0) {
      for (const variant of almaraiVariants) {
        assert.ok(
          st.allowedFonts.includes(variant),
          `Style ${st.id} must include ${variant} in allowedFonts`
        );
      }
    }
  }

  // 4) Virtual weight spec resolution & ctx.font application
  assert.deepEqual(resolveStudioFontSpec('Almarai', 700), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 400,
  });
  assert.deepEqual(resolveStudioFontSpec('Almarai Bold', 400), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 700,
  });
  assert.deepEqual(resolveStudioFontSpec('Almarai ExtraBold', 600), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 800,
  });
  assert.deepEqual(resolveStudioFontSpec('Cairo', 700), {
    cssFontFamily: 'Cairo',
    cssFontWeight: 700,
  });

  const ctx = createMockCanvasContextForChat();
  applyStudioCanvasTextProps(ctx, 'Almarai Bold', 400, 48, 'rtl');
  assert.ok(ctx.font.startsWith('700 48px "Almarai"'));

  applyStudioCanvasTextProps(ctx, 'Almarai ExtraBold', 700, 52, 'rtl');
  assert.ok(ctx.font.startsWith('800 52px "Almarai"'));

  applyStudioCanvasTextProps(ctx, 'Almarai', 700, 44, 'rtl');
  assert.ok(ctx.font.startsWith('400 44px "Almarai"'));

  // 5) Render a style from each of the 5 modes with Almarai Bold & ExtraBold without throwing
  const sampleModeStyles = [
    { mode: 'quote' as const, styleId: 'midnight-blue' as const },
    { mode: 'phrase' as const, styleId: 'calligraphy-ink' as const },
    { mode: 'chat' as const, styleId: 'chat_terminal' as const },
    { mode: 'points' as const, styleId: 'pts_ranking' as const },
    { mode: 'image' as const, styleId: 'img_polaroid' as const },
  ];
  for (const { mode, styleId } of sampleModeStyles) {
    for (const fontVariant of almaraiVariants) {
      const custom: StyleCustomization = {
        mode,
        styleId,
        phraseStyleId: mode === 'phrase' ? styleId : undefined,
        chatStyleId: mode === 'chat' ? styleId : undefined,
        pointsStyleId: mode === 'points' ? styleId : undefined,
        imageStyleId: mode === 'image' ? styleId : undefined,
        format: '16:9',
        position: 'center',
        backgroundMode: mode === 'chat' || mode === 'phrase' ? 'style' : 'green',
        greenScreen: mode !== 'chat' && mode !== 'phrase',
        accentColor: '#38BDF8',
        keywordColor: '#FFD400',
        quoteFontOverride: fontVariant,
        authorFontOverride: '',
        fontSizeMultiplier: 1.0,
        seed: 77,
        minimalShape: 'arch',
        chatMessages: DEFAULT_CHAT_MESSAGES,
        pointsTitle: DEFAULT_POINTS_TITLE,
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
        imageCaption: DEFAULT_IMAGE_CAPTION,
        imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
      };
      renderQuoteFrame(
        ctx,
        1.5,
        {
          quoteText: 'اختبار خط *المراعي* بجميع الأوزان',
          authorName: 'كاتب',
          subtitle: '',
          photoSource: null,
          photoId: 'default',
          crop: { zoom: 1, offsetX: 0, offsetY: 0 },
          quotationMarks: 'guillemets',
          chatMessages: DEFAULT_CHAT_MESSAGES,
          pointsTitle: DEFAULT_POINTS_TITLE,
          pointsItems: DEFAULT_POINTS_ITEMS,
          pointsTiming: DEFAULT_POINTS_TIMING,
          imageCaption: DEFAULT_IMAGE_CAPTION,
          imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
        },
        { enterDuration: 0.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false },
        custom,
        { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
      );
    }
  }
});

test('KOMission Black, Zain Rounded instance mob, and 29LT Azahar Display AL TN Trial Bold are registered, included in all non-terminal/non-typewriter styles, excluded from terminal/typewriter styles, calibrated, and render cleanly', () => {
  const newFonts: ArabicFontFamily[] = [
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ];

  // 1) Registered in both primary and author Arabic font lists
  for (const fontName of newFonts) {
    assert.ok(
      ARABIC_FONTS_LIST.some((f) => f.family === fontName),
      `ARABIC_FONTS_LIST must include ${fontName}`
    );
    assert.ok(
      AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === fontName),
      `AUTHOR_ARABIC_FONTS_LIST must include ${fontName}`
    );
  }

  // 2) Included in all 36 eligible styles, excluded from the 3 terminal/typewriter styles
  const excludedTerminalAndTypewriter = new Set<string>([
    'pixel_terminal',
    'old_typewriter',
    'chat_terminal',
  ]);
  assert.equal(ALL_STYLES_LIST.length, 40);

  let includedCount = 0;
  let excludedCount = 0;
  for (const st of ALL_STYLES_LIST) {
    if (excludedTerminalAndTypewriter.has(st.id)) {
      excludedCount++;
      assert.ok(
        st.allowedFonts && st.allowedFonts.length > 0,
        `Terminal/typewriter style ${st.id} must explicitly restrict allowedFonts`
      );
      for (const fontName of newFonts) {
        assert.ok(
          !st.allowedFonts!.includes(fontName),
          `Terminal/typewriter style ${st.id} must NOT include ${fontName}`
        );
      }
    } else {
      includedCount++;
      if (st.allowedFonts && st.allowedFonts.length > 0) {
        for (const fontName of newFonts) {
          assert.ok(
            st.allowedFonts.includes(fontName),
            `Eligible style ${st.id} must include ${fontName} in allowedFonts`
          );
        }
      }
    }
  }
  assert.equal(includedCount, 37);
  assert.equal(excludedCount, 3);

  // 3) Calibration profiles & preferred weights prevent faux-bolding and match fallbacks
  const koCal = getFontCalibration('KOMission Black');
  const zainCal = getFontCalibration('Zain Rounded instance mob');
  const azaharCal = getFontCalibration('29LT Azahar Display AL TN Trial Bold');

  assert.equal(koCal.preferredWeight, 900);
  assert.ok(koCal.sizeScale < 1);
  assert.ok(koCal.minLineHeightRatio >= 1.72);
  assert.ok(koCal.fallbackChain?.includes('"Cairo"'));

  assert.equal(zainCal.preferredWeight, 400);
  assert.ok(zainCal.sizeScale > 1);
  assert.ok(zainCal.fallbackChain?.includes('"Zain"'));

  assert.equal(azaharCal.preferredWeight, 700);
  assert.ok(azaharCal.sizeScale < 1);
  assert.ok(azaharCal.minLineHeightRatio >= 1.74);
  assert.ok(azaharCal.spaceRatio >= 0.35);
  assert.ok(azaharCal.fallbackChain?.includes('"Amiri"'));

  assert.deepEqual(resolveStudioFontSpec('KOMission Black', 400), {
    cssFontFamily: 'KOMission Black',
    cssFontWeight: 900,
  });
  assert.deepEqual(resolveStudioFontSpec('Zain Rounded instance mob', 700), {
    cssFontFamily: 'Zain Rounded instance mob',
    cssFontWeight: 400,
  });
  assert.deepEqual(resolveStudioFontSpec('29LT Azahar Display AL TN Trial Bold', 400), {
    cssFontFamily: '29LT Azahar Display AL TN Trial Bold',
    cssFontWeight: 700,
  });
  // Legacy preset compatibility: Light identifier maps seamlessly to Bold 700
  assert.deepEqual(resolveStudioFontSpec('29LT Azahar AL VF TN Trial Display Light', 300), {
    cssFontFamily: '29LT Azahar Display AL TN Trial Bold',
    cssFontWeight: 700,
  });

  const ctx = createMockCanvasContextForChat();
  applyStudioCanvasTextProps(ctx, 'KOMission Black', 400, 46, 'rtl');
  assert.ok(ctx.font.startsWith('900 46px "KOMission Black"'));
  assert.ok(ctx.font.includes('"Cairo"'));

  applyStudioCanvasTextProps(ctx, 'Zain Rounded instance mob', 800, 46, 'rtl');
  assert.ok(ctx.font.startsWith('400 46px "Zain Rounded instance mob"'));
  assert.ok(ctx.font.includes('"Zain"'));

  applyStudioCanvasTextProps(ctx, '29LT Azahar Display AL TN Trial Bold', 400, 46, 'rtl');
  assert.ok(ctx.font.startsWith('700 46px "29LT Azahar Display AL TN Trial Bold"'));
  assert.ok(ctx.font.includes('"Amiri"'));

  // 4) Calibrated layout maintains safe bounds and adapts optical size & line height
  const baseLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: 'Cairo',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });
  const koLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: 'KOMission Black',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });
  const azaharLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: '29LT Azahar Display AL TN Trial Bold',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });

  assert.ok(koLayout.fontSize <= baseLayout.fontSize);
  assert.ok(koLayout.lineHeightRatio >= 1.76);
  assert.ok(azaharLayout.fontSize <= baseLayout.fontSize);
  assert.ok(azaharLayout.lineHeightRatio >= 1.74);
  assert.ok(koLayout.maxLineWidth <= 720 * 1.03);
  assert.ok(azaharLayout.maxLineWidth <= 720 * 1.03);
  assert.ok(azaharLayout.totalHeight <= 420 * 1.05);

  // 5) Render representative eligible styles across all 5 modes in both 16:9 and 9:16
  const sampleModeStyles = [
    { mode: 'quote' as const, styleId: 'midnight-blue' as const },
    { mode: 'phrase' as const, styleId: 'torn-paper' as const },
    { mode: 'chat' as const, styleId: 'chat_modern' as const },
    { mode: 'points' as const, styleId: 'pts_clean' as const },
    { mode: 'points' as const, styleId: 'pts_ranking' as const },
    { mode: 'image' as const, styleId: 'img_polaroid' as const },
  ];

  for (const format of ['16:9', '9:16'] as const) {
    const baseW = format === '16:9' ? 1920 : 1080;
    const baseH = format === '16:9' ? 1080 : 1920;
    for (const { mode, styleId } of sampleModeStyles) {
      for (const fontName of newFonts) {
        const custom: StyleCustomization = {
          mode,
          styleId,
          phraseStyleId: mode === 'phrase' ? styleId : undefined,
          chatStyleId: mode === 'chat' ? styleId : undefined,
          pointsStyleId: mode === 'points' ? styleId : undefined,
          imageStyleId: mode === 'image' ? styleId : undefined,
          format,
          position: 'center',
          backgroundMode: mode === 'chat' || mode === 'phrase' ? 'style' : 'green',
          greenScreen: mode !== 'chat' && mode !== 'phrase',
          accentColor: '#38BDF8',
          keywordColor: '#FFD400',
          quoteFontOverride: fontName,
          authorFontOverride: fontName,
          fontSizeMultiplier: 1.0,
          seed: 99,
          minimalShape: 'arch',
          chatMessages: DEFAULT_CHAT_MESSAGES,
          pointsTitle: DEFAULT_POINTS_TITLE,
          pointsItems: DEFAULT_POINTS_ITEMS,
          pointsTiming: DEFAULT_POINTS_TIMING,
          imageCaption: DEFAULT_IMAGE_CAPTION,
          imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
        };
        renderQuoteFrame(
          ctx,
          1.4,
          {
            quoteText: 'تجربة *إبداعية* بخطوط عربية جديدة 2025',
            authorName: 'الاستوديو',
            subtitle: 'نموذج تجريبي',
            photoSource: null,
            photoId: 'default',
            crop: { zoom: 1, offsetX: 0, offsetY: 0 },
            quotationMarks: 'guillemets',
            chatMessages: DEFAULT_CHAT_MESSAGES,
            pointsTitle: DEFAULT_POINTS_TITLE,
            pointsItems: DEFAULT_POINTS_ITEMS,
            pointsTiming: DEFAULT_POINTS_TIMING,
            imageCaption: DEFAULT_IMAGE_CAPTION,
            imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
          },
          { enterDuration: 0.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false },
          custom,
          { width: baseW, height: baseH, baseWidth: baseW, baseHeight: baseH, scale: 1 }
        );
      }
    }
  }
});

test('pts_timeline supports all 5 path shapes (straight, wave, zigzag, circle, stepped), orientations (auto, horizontal, vertical), and vertical sides (auto, alternating, left, right) with pure #00FF00 green screen isolation', () => {
  const shapes = ['straight', 'wave', 'zigzag', 'circle', 'stepped'] as const;
  const orientations = ['auto', 'horizontal', 'vertical'] as const;
  const verticalSides = ['auto', 'alternating', 'left', 'right'] as const;
  const formats = ['16:9', '9:16'] as const;
  const positions = ['center', 'right', 'left', 'fullscreen'] as const;
  const backgrounds = ['style', 'green', 'black'] as const;

  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'guillemets' as const,
    pointsTitle: 'مراحل *الابتكار* الرقمي 2026',
    pointsItems: [
      { id: '1', text: 'تحديد *المشكلة* الأساسية بدقة' },
      { id: '2', text: 'بناء النموذج الأولي MVP بسرعة' },
      { id: '3', text: 'اختبار التجربة مع *المستخدمين*' },
      { id: '4', text: 'التحسين المستمر والتوسع التدريجي' },
    ],
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const timeline = { enterDuration: 0.6, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };

  for (const shape of shapes) {
    for (const orientation of orientations) {
      for (const format of formats) {
        const baseW = format === '16:9' ? 1920 : 1080;
        const baseH = format === '16:9' ? 1080 : 1920;
        const size = { width: baseW, height: baseH, baseWidth: baseW, baseHeight: baseH, scale: 1 };

        for (const pos of positions) {
          for (const bg of backgrounds) {
            const sidesToTest =
              orientation === 'vertical' && shape !== 'circle'
                ? verticalSides
                : (['auto'] as const);

            for (const vSide of sidesToTest) {
              let roundRectCount = 0;
              let maxShadowBlur = 0;
              const ctx = createMockCanvasContextForChat();
              const origRoundRect = ctx.roundRect.bind(ctx);
              ctx.roundRect = (...args: Parameters<typeof origRoundRect>) => {
                roundRectCount++;
                return origRoundRect(...args);
              };

              let currentBlur = 0;
              Object.defineProperty(ctx, 'shadowBlur', {
                get: () => currentBlur,
                set: (val: number) => {
                  currentBlur = val;
                  if (val > maxShadowBlur) maxShadowBlur = val;
                },
                configurable: true,
              });

              const custom: StyleCustomization = {
                mode: 'points',
                styleId: 'pts_timeline',
                pointsStyleId: 'pts_timeline',
                format,
                position: pos,
                backgroundMode: bg,
                greenScreen: bg === 'green',
                timelineShape: shape,
                timelineOrientation: orientation,
                timelineVerticalSide: vSide,
                accentColor: '#4DD8FF',
                keywordColor: '#FFD166',
                quoteFontOverride: 'Cairo',
                authorFontOverride: 'Cairo',
                fontSizeMultiplier: 1.0,
                minimalShape: 'arch',
                seed: 1042,
                pointsTitle: content.pointsTitle,
                pointsItems: content.pointsItems,
                pointsTiming: content.pointsTiming,
              };

              const ev = getSceneEventTimes(ctx, content, timeline, custom, size);
              assert.equal(ev.itemTimes?.length, 4);
              assert.ok(ev.keywordTimes.length >= 3);

              renderQuoteFrame(ctx, 3.2, content, timeline, custom, size);

              if (bg === 'green') {
                // In green screen mode, the large container panel is skipped, while each revealed item gets a comfortable semi-transparent text backplate
                assert.ok(
                  roundRectCount >= 1 && roundRectCount <= content.pointsItems.length,
                  `Expected comfortable per-text roundRect backplates (1..${content.pointsItems.length}) in green mode, got ${roundRectCount} for shape=${shape}, orientation=${orientation}, vSide=${vSide}`
                );
                assert.equal(
                  maxShadowBlur,
                  0,
                  `Expected 0 shadowBlur in green mode for shape=${shape}, orientation=${orientation}, vSide=${vSide}`
                );
              }
            }
          }
        }
      }
    }
  }

  // Verify global & per-point size and position adjustments update interactive targets accurately
  const testCtx = createMockCanvasContextForChat();
  const baseSize = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_timeline',
    pointsStyleId: 'pts_timeline',
    format: '16:9',
    position: 'center',
    backgroundMode: 'green',
    greenScreen: true,
    timelineShape: 'straight',
    timelineOrientation: 'horizontal',
    accentColor: '#4DD8FF',
    keywordColor: '#FFD166',
    quoteFontOverride: 'Cairo',
    authorFontOverride: 'Cairo',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
    pointsTitle: content.pointsTitle,
    pointsItems: content.pointsItems,
    pointsTiming: content.pointsTiming,
  };

  const defaultTargets = getPtsTimelineInteractiveTargets(testCtx, content, baseCustom, baseSize);
  assert.equal(defaultTargets.length, 4);

  const adjustedItems = content.pointsItems.map((it, idx) =>
    idx === 0
      ? {
          ...it,
          nodeOffsetX: 60,
          nodeOffsetY: -45,
          textOffsetX: 35,
          textOffsetY: -25,
          itemScale: 1.25,
        }
      : it
  );
  const adjustedCustom: StyleCustomization = {
    ...baseCustom,
    timelineNodeScale: 1.3,
    timelineStemScale: 1.4,
    timelineSpread: 1.2,
    timelineOffsetX: 0.1,
    timelineOffsetY: -0.08,
    pointsItems: adjustedItems,
  };
  const adjustedContent = { ...content, pointsItems: adjustedItems };
  const adjustedTargets = getPtsTimelineInteractiveTargets(
    testCtx,
    adjustedContent,
    adjustedCustom,
    baseSize
  );
  assert.equal(adjustedTargets.length, 4);
  assert.ok(adjustedTargets[0].nodeRadius > defaultTargets[0].nodeRadius);
  assert.notEqual(adjustedTargets[0].nodeX, defaultTargets[0].nodeX);
  assert.notEqual(adjustedTargets[0].nodeY, defaultTargets[0].nodeY);
  assert.notEqual(adjustedTargets[0].textBoxX, defaultTargets[0].textBoxX);
  assert.notEqual(adjustedTargets[0].textBoxY, defaultTargets[0].textBoxY);

  // Render adjusted frame in green mode without errors
  renderQuoteFrame(testCtx, 3.2, adjustedContent, timeline, adjustedCustom, baseSize);
});

test('Removed float_glass and points styles are absent from registries and resolve safely to mode defaults', () => {
  const removedIds = new Set([
    'quote_float_glass',
    'phrase_float_glass',
    'chat_float_glass',
    'pts_float_glass',
    'img_float_glass',
    'pts_cards',
    'pts_checklist',
    'pts_terminal',
  ]);
  for (const st of ALL_STYLES_LIST) {
    assert.ok(!removedIds.has(st.id), `Removed style ${st.id} must not exist in ALL_STYLES_LIST`);
  }
  assert.equal(QUOTE_STYLES_LIST.length, 6);
  assert.equal(CHAT_STYLES_LIST.length, 2);
  assert.equal(POINTS_STYLES_LIST.length, 4);
  assert.equal(IMAGE_STYLES_LIST.length, 6);

  // Legacy saved presets referencing removed IDs resolve safely to mode defaults
  const baseLegacy = {
    format: '16:9' as const,
    position: 'center' as const,
    backgroundMode: 'style' as const,
    greenScreen: false,
    accentColor: '#38BDF8',
    keywordColor: '#FDE047',
    quoteFontOverride: '' as const,
    authorFontOverride: '' as const,
    fontSizeMultiplier: 1,
    minimalShape: 'arch' as const,
    seed: 1,
  };
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'quote', styleId: 'quote_float_glass' as StyleCustomization['styleId'] }), 'midnight-blue');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'phrase', styleId: 'phrase_float_glass' as StyleCustomization['styleId'] }), 'calligraphy-ink');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'chat', styleId: 'chat_float_glass' as StyleCustomization['styleId'] }), 'chat_modern');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'points', styleId: 'pts_float_glass' as StyleCustomization['styleId'] }), 'pts_clean');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'points', styleId: 'pts_cards' as StyleCustomization['styleId'] }), 'pts_clean');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'points', styleId: 'pts_checklist' as StyleCustomization['styleId'] }), 'pts_clean');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'points', styleId: 'pts_terminal' as StyleCustomization['styleId'] }), 'pts_clean');
  assert.equal(resolveActiveStyleId({ ...baseLegacy, mode: 'image', styleId: 'img_float_glass' as StyleCustomization['styleId'] }), 'img_polaroid');
});

test('Flyer styles (phrase_flyer & pts_flyer): 4 creatures including firefly ("يراعة"), default tints, preset fallback, export filenames, identical schedule across creatures, and all 7 scenarios across formats/positions/backgrounds', () => {
  // 1) Verify all 4 creatures in FLYER_CREATURES and their default tints
  assert.equal(FLYER_CREATURES.length, 4);
  assert.deepEqual(
    FLYER_CREATURES.map((c) => ({ id: c.id, labelAr: c.labelAr, defaultAccent: c.defaultAccent })),
    [
      { id: 'orb', labelAr: 'فراشة البرقوق (ليلي)', defaultAccent: '#F472B6' },
      { id: 'butterfly', labelAr: 'فراشة', defaultAccent: '#FF8FB8' },
      { id: 'bat', labelAr: 'خفاش', defaultAccent: '#B79CFF' },
      { id: 'firefly', labelAr: 'يراعة', defaultAccent: '#FFC857' },
    ]
  );
  assert.equal(FLYER_DEFAULT_TINTS.orb, '#F472B6');
  assert.equal(FLYER_DEFAULT_TINTS.butterfly, '#FF8FB8');
  assert.equal(FLYER_DEFAULT_TINTS.bat, '#B79CFF');
  assert.equal(FLYER_DEFAULT_TINTS.firefly, '#FFC857');
  assert.equal(isGreenishColor(FLYER_DEFAULT_TINTS.firefly), false);

  // 2) Old presets without flyerCreature fall back to 'orb'
  assert.equal(resolveFlyerCreature(undefined), 'orb');
  assert.equal(resolveFlyerCreature(null), 'orb');
  assert.equal(resolveFlyerCreature('unknown_old_value'), 'orb');
  assert.equal(resolveFlyerCreature('firefly'), 'firefly');

  // 3) Export filenames include creature id (e.g., "firefly")
  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'firefly',
    format: '16:9',
    position: 'center',
    backgroundMode: 'black',
    greenScreen: false,
    accentColor: '#FFC857',
    keywordColor: '#FFF3B0',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
  };
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'phrase-phrase_flyer-firefly-black-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: 'firefly',
        backgroundMode: 'green',
      },
      '1080p',
      'mp4'
    ),
    'points-pts_flyer-firefly-green-center-1080p.mp4'
  );

  // 4) Firefly deterministic glow rhythm pulses and boosts on keyword hover
  const gBase = computeFireflyGlowIntensity(1.0, 2026, 0);
  const gHover = computeFireflyGlowIntensity(1.0, 2026, 1.0);
  assert.ok(gHover > gBase, 'Hovering on a keyword must boost firefly lantern glow');
  assert.equal(
    computeFireflyGlowIntensity(2.35, 2026, 0.5),
    computeFireflyGlowIntensity(2.35, 2026, 0.5),
    'Firefly glow must be a pure deterministic function of (t, seed, hoverBoost)'
  );

  // 5) Switching creatures never changes flight schedule or event times
  const ctx = createMockCanvasContextForChat();
  const size16x9 = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const sampleContent = {
    quoteText: 'إِنَّ *الإِصْرَارَ* يَصْنَعُ الفَارِقَ فِي كُلِّ *مَسَارٍ* حَقِيقِيٍّ',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'ركائز *النجاح* المستدام',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  const creatures: FlyerCreatureId[] = ['orb', 'butterfly', 'bat', 'firefly'];
  let refPhraseEvents: ReturnType<typeof getSceneEventTimes> | null = null;
  let refPtsEvents: ReturnType<typeof getSceneEventTimes> | null = null;

  for (const cr of creatures) {
    drawCreaturePreviewThumbnail(ctx, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 1.2);
    const pEv = getSceneEventTimes(
      ctx,
      sampleContent,
      timeline,
      { ...baseCustom, flyerCreature: cr },
      size16x9
    );
    const ptEv = getSceneEventTimes(
      ctx,
      sampleContent,
      timeline,
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: cr,
      },
      size16x9
    );
    if (!refPhraseEvents) refPhraseEvents = pEv;
    if (!refPtsEvents) refPtsEvents = ptEv;
    assert.deepEqual(pEv, refPhraseEvents, `phrase_flyer event times must be identical for ${cr}`);
    assert.deepEqual(ptEv, refPtsEvents, `pts_flyer event times must be identical for ${cr}`);
  }

  // 6) Test all 4 creatures, both formats, every position and background across all 7 required scenarios
  const phraseScenarios = [
    // 1. 3-word phrase with 1 keyword
    'القوة في *التركيز*',
    // 2. 8 words with 2 keywords and diacritics
    'إِنَّ *العِلْمَ* نُورٌ يُضِيءُ طَرِيقَ *المُسْتَقْبَلِ* لِكُلِّ مُجْتَهِدٍ',
    // 3. 18 words
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه *الإصرار* اليومي والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة في الحياة',
    // 4. Keyword breaking across two lines + mixed Arabic + English/numbers
    'تطوير أنظمة *الذكاء الاصطناعي المتقدمة AI 2026* يفتح آفاقاً واسعة لـ 100 مشروع رقمي حديث',
  ];

  const pointsScenarios: { title: string; items: PointsItem[] }[] = [
    // 5. 3 points
    {
      title: 'خطوات *الإنجاز*',
      items: [
        { id: '1', text: 'تحديد *الهدف* بدقة' },
        { id: '2', text: 'التنفيذ اليومي المنظم' },
        { id: '3', text: 'المراجعة والتحسين المستمر' },
      ],
    },
    // 6. 8 long points
    {
      title: 'خطة *التطوير* الشاملة',
      items: Array.from({ length: 8 }, (_, idx) => ({
        id: `long-${idx + 1}`,
        text: `النقطة الاستراتيجية رقم ${idx + 1} لبناء منظومة *إنتاجية متكاملة* تحقق نتائج ملموسة ومستدامة على المدى الطويل`,
      })),
    },
    // 7. Mixed Arabic + English/numbers
    {
      title: 'تحديثات WebCodecs 2026',
      items: [
        { id: 'm1', text: 'تصدير MP4 بدقة *4K 60fps* بسرعة عالية' },
        { id: 'm2', text: 'دعم Chroma Key #00FF00 ووضع Screen #000000' },
        { id: 'm3', text: 'معاينة فورية بسرعة 60 إطاراً في الثانية' },
      ],
    },
  ];

  const formats = ['16:9', '9:16'] as const;
  const backgrounds: BackgroundMode[] = ['style', 'green', 'black'];
  const phrasePositions: PhrasePosition[] = [
    'center',
    'top',
    'bottom',
    'right',
    'left',
    'fullscreen',
  ];
  const pointsPositions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const cr of creatures) {
    for (const fmt of formats) {
      const sz =
        fmt === '16:9'
          ? { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
          : { width: 1080, height: 1920, baseWidth: 1080, baseHeight: 1920, scale: 1 };

      for (const bg of backgrounds) {
        // Test phrase_flyer across positions & scenarios
        for (const pos of phrasePositions) {
          for (const text of phraseScenarios) {
            let maxBlur = 0;
            let curBlur = 0;
            const testCtx = createMockCanvasContextForChat();
            Object.defineProperty(testCtx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const custom: StyleCustomization = {
              ...baseCustom,
              flyerCreature: cr,
              format: fmt,
              position: pos,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: FLYER_DEFAULT_TINTS[cr],
            };
            renderQuoteFrame(
              testCtx,
              1.6,
              { ...sampleContent, quoteText: text },
              timeline,
              custom,
              sz
            );
            if (bg === 'green') {
              assert.equal(maxBlur, 0, `phrase_flyer green mode must have 0 shadowBlur (${cr})`);
            }
          }
        }

        // Test pts_flyer across positions & scenarios
        for (const pos of pointsPositions) {
          for (const sc of pointsScenarios) {
            let maxBlur = 0;
            let curBlur = 0;
            const testCtx = createMockCanvasContextForChat();
            Object.defineProperty(testCtx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const custom: StyleCustomization = {
              ...baseCustom,
              mode: 'points',
              styleId: 'pts_flyer',
              pointsStyleId: 'pts_flyer',
              flyerCreature: cr,
              format: fmt,
              position: pos,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: FLYER_DEFAULT_TINTS[cr],
              pointsTitle: sc.title,
              pointsItems: sc.items,
            };
            renderQuoteFrame(
              testCtx,
              2.4,
              { ...sampleContent, pointsTitle: sc.title, pointsItems: sc.items },
              timeline,
              custom,
              sz
            );
            if (bg === 'green') {
              assert.equal(maxBlur, 0, `pts_flyer green mode must have 0 shadowBlur (${cr})`);
            }
          }
        }
      }
    }
  }
});

test('Round white feathery nectar orb, smooth curved spline trajectory, and pts_flyer calm reveal speed pacing', () => {
  // 1) Verify sampleFlightWaypoints C1-continuous Catmull-Rom curved arc & calm hover behavior
  const wps = [
    { t: 0, x: 100, y: 200 },
    { t: 0.4, x: 260, y: 170 },
    { t: 1.0, x: 460, y: 210, isHover: true },
    { t: 1.4, x: 460, y: 210, isHover: true },
    { t: 2.0, x: 640, y: 260 },
  ];
  const sPre = sampleFlightWaypoints(wps, 0.39, 2.2, 2.6);
  const sPost = sampleFlightWaypoints(wps, 0.41, 2.2, 2.6);
  assert.ok(Math.hypot(sPost.x - sPre.x, sPost.y - sPre.y) < 16, 'Spline position must remain continuous across waypoints');
  assert.ok(Number.isFinite(sPost.vx) && Number.isFinite(sPost.vy), 'Spline velocity must remain finite');
  const sHover = sampleFlightWaypoints(wps, 1.2, 2.2, 2.6);
  assert.ok(Math.abs(sHover.x - 460) < 1e-6 && Math.abs(sHover.y - 210) < 1e-6, 'Hover anchor must stay calm with zero spline overshoot');

  // 2) Verify pts_flyer calm default (0.65s) + custom slow (1.8s) & fast (0.2s) pacing
  const defaultSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8 },
    'pts_flyer'
  );
  assert.ok(
    Math.abs(defaultSched.items[0].revealEnd - defaultSched.items[0].startTime - 0.65) < 1e-6,
    'Default pts_flyer reveal span must be 0.65s'
  );

  const slowSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8, flyerRevealDuration: 1.8 },
    'pts_flyer'
  );
  const fastSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8, flyerRevealDuration: 0.2 },
    'pts_flyer'
  );
  assert.ok(
    slowSched.items[1].startTime >= slowSched.items[0].startTime + 1.9,
    'Slow pts_flyer reveal must extend spacing so creature finishes sweep before next point'
  );
  assert.ok(
    Math.abs(fastSched.items[0].revealEnd - fastSched.items[0].startTime - 0.2) < 1e-6
  );
  assert.ok(slowSched.totalDuration > fastSched.totalDuration);

  // 3) Render both phrase_flyer and pts_flyer with Night Plum Blossom Petals 'orb' (#F472B6 default) across style, green, black
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 2.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const bgs: BackgroundMode[] = ['style', 'green', 'black'];
  for (const bg of bgs) {
    let maxBlur = 0;
    let curBlur = 0;
    const ctx = createMockCanvasContextForChat();
    Object.defineProperty(ctx, 'shadowBlur', {
      get: () => curBlur,
      set: (v: number) => {
        curBlur = v;
        if (v > maxBlur) maxBlur = v;
      },
      configurable: true,
    });
    const baseOrbCustom: StyleCustomization = {
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCreature: 'orb',
      format: '16:9',
      position: 'center',
      backgroundMode: bg,
      greenScreen: bg === 'green',
      accentColor: FLYER_DEFAULT_TINTS.orb,
      keywordColor: '#FDE047',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1.0,
      minimalShape: 'arch',
      seed: 99,
      pointsTitle: DEFAULT_POINTS_TITLE,
      pointsItems: DEFAULT_POINTS_ITEMS,
      pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.0, flyerRevealDuration: 1.6 },
    };
    renderQuoteFrame(
      ctx,
      1.5,
      {
        quoteText: 'النور يبدأ من *الداخل* حين تهدأ الروح',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: DEFAULT_POINTS_TITLE,
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: baseOrbCustom.pointsTiming,
      },
      timeline,
      baseOrbCustom,
      sz
    );
    renderQuoteFrame(
      ctx,
      1.2,
      {
        quoteText: 'النور يبدأ من *الداخل* حين تهدأ الروح',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
      },
      timeline,
      { ...baseOrbCustom, mode: 'phrase', styleId: 'phrase_flyer' },
      sz
    );
    if (bg === 'green') {
      assert.equal(maxBlur, 0, 'Orb green mode must maintain zero shadowBlur');
    }
  }
});

test('Image mode full-fit framing: fitImageSlotInBox exact aspect matching & all 7 image styles green/style/black renders', () => {
  const mkMockImage = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
      getContext: () => createMockCanvasContextForChat(),
    }) as unknown as HTMLCanvasElement;

  const sampleAspects = [
    { name: '16:9 wide', w: 1920, h: 1080 },
    { name: '9:16 tall', w: 1080, h: 1920 },
    { name: '1:1 square', w: 800, h: 800 },
    { name: '21:9 ultrawide', w: 2520, h: 1080 },
  ];

  // Verify fitImageSlotInBox matches natural aspect ratio within <= 1.5% across formats & positions
  for (const format of ['16:9', '9:16'] as const) {
    const baseW = format === '16:9' ? 1920 : 1080;
    const baseH = format === '16:9' ? 1080 : 1920;
    for (const pos of ['center', 'right', 'top-right'] as const) {
      const posBox = getImagePositionBox(pos, format, baseW, baseH, 1.0);
      for (const sa of sampleAspects) {
        const img = mkMockImage(sa.w, sa.h);
        const fitted = fitImageSlotInBox(img, posBox.boxWidth, posBox.boxHeight);
        assert.ok(fitted.photoW <= posBox.boxWidth + 1);
        assert.ok(fitted.photoH <= posBox.boxHeight + 1);
        const targetAspect = sa.w / sa.h;
        const fittedAspect = fitted.photoW / fitted.photoH;
        const relDiff = Math.abs(fittedAspect - targetAspect) / targetAspect;
        assert.ok(
          relDiff < 0.02,
          `${sa.name} in ${format}/${pos}: fitted aspect ${fittedAspect.toFixed(3)} should match ${targetAspect.toFixed(3)}`
        );
      }
    }
  }

  // Render all 6 image templates across wide/tall/square images, with & without caption, and check green mode shadowBlur === 0
  const all7Styles: ImageStyleId[] = [
    'img_polaroid',
    'img_browser',
    'img_newspaper',
    'img_cinematic',
    'img_floating',
    'img_spotlight',
  ];

  const bgs: BackgroundMode[] = ['style', 'green', 'black'];
  const captions = [
    { cap: 'النمو *الذكي* في التصميم المرئي الحديث', src: 'المصدر: مختبر الرؤية' },
    { cap: '', src: '' },
  ];

  for (const styleId of all7Styles) {
    const meta = getStyleMetadata(styleId);
    for (const bg of bgs) {
      for (const sa of sampleAspects.slice(0, 3)) {
        for (const c of captions) {
          let maxBlur = 0;
          let curBlur = 0;
          const ctx = createMockCanvasContextForChat();
          Object.defineProperty(ctx, 'shadowBlur', {
            get: () => curBlur,
            set: (v: number) => {
              curBlur = v;
              if (v > maxBlur) maxBlur = v;
            },
            configurable: true,
          });

          const custom: StyleCustomization = {
            mode: 'image',
            styleId: 'midnight-blue',
            imageStyleId: styleId,
            format: '16:9',
            position: 'center',
            backgroundMode: bg,
            greenScreen: bg === 'green',
            accentColor: meta.defaultAccent,
            keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
            quoteFontOverride: '',
            authorFontOverride: '',
            fontSizeMultiplier: 1.0,
            seed: 314,
            minimalShape: 'arch',
            pixelDensity: 1,
            imageCaption: c.cap,
            imageSourceLine: c.src,
            imageFit: 'cover',
            imageScale: 1.0,
            imagePushIn: true,
            spotlightRegion: DEFAULT_SPOTLIGHT_REGION,
            spotlightShape: 'circle',
          };

          const contentObj = {
            quoteText: c.cap,
            authorName: c.src,
            subtitle: '',
            photoSource: mkMockImage(sa.w, sa.h),
            photoId: `fit-${sa.name}`,
            crop: { zoom: 1, offsetX: 0, offsetY: 0 },
            quotationMarks: 'none' as const,
            imageCaption: c.cap,
            imageSourceLine: c.src,
          };

          const size = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
          const events = getEventTimes({ ctx, content: contentObj, timeline: DEFAULT_IMAGE_TIMELINE, custom, viewport: size });
          assert.ok(Array.isArray(events.keywordTimes));

          renderQuoteFrame(ctx, 2.0, contentObj, DEFAULT_IMAGE_TIMELINE, custom, size);

          if (bg === 'green') {
            assert.equal(
              maxBlur,
              0,
              `${styleId} (${sa.name}, caption=${Boolean(c.cap)}) green mode must keep shadowBlur === 0`
            );
          }
        }
      }
    }
  }
});

test('Video Insert ("فيديو") mode: 6 style configs, filenames, timeline/speed/trim/loop/freeze, free layout box, and rendering across all formats & boxes', () => {
  // 1) Verify all 6 style metadata configs (supportedBackgrounds: ['style', 'green'], recommended: 'green', excludes 'black')
  assert.equal(VIDEO_STYLES_LIST.length, 6);
  const expectedIds: VideoStyleId[] = [
    'vid_crt',
    'vid_phone',
    'vid_cinematic',
    'vid_floating',
    'vid_pip',
    'vid_camcorder',
  ];
  assert.deepEqual(
    VIDEO_STYLES_LIST.map((s) => s.id),
    expectedIds
  );
  for (const st of VIDEO_STYLES_LIST) {
    assert.deepEqual(st.supportedBackgrounds, ['style', 'green']);
    assert.equal(st.recommendedBackground, 'green');
    assert.equal(st.mode, 'video');
  }

  // 2) Export filenames: video-{style}-{bg}-{pos}-{res}.{ext}
  const baseVidCustom: StyleCustomization = {
    mode: 'video',
    styleId: 'vid_crt',
    videoStyleId: 'vid_crt',
    format: '16:9',
    position: 'center',
    backgroundMode: 'green',
    greenScreen: true,
    accentColor: '#38BDF8',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
    videoBox: DEFAULT_VIDEO_BOX,
    videoAllowOutOfMargin: false,
    videoAspectLock: true,
    videoAdaptFrameToClip: true,
    videoFit: 'contain',
    videoScale: 1.0,
    videoTrimIn: 1.0,
    videoTrimOut: 5.0,
    videoSpeed: 1.0,
    videoEndBehavior: 'freeze',
    videoAudioEnabled: true,
    videoAudioVolume: 0.85,
    videoCustomDurationEnabled: false,
    videoDurationSec: 8.0,
  };
  assert.equal(
    buildExportFileName(baseVidCustom, '1080p', 'mp4'),
    'video-vid_crt-green-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseVidCustom,
        styleId: 'vid_cinematic',
        videoStyleId: 'vid_cinematic',
        backgroundMode: 'style',
        greenScreen: false,
        position: 'fullscreen',
      },
      '4K',
      'mp4'
    ),
    'video-vid_cinematic-style-fullscreen-4K.mp4'
  );

  // 3) Timing & sourceTime: Enter 0.6s, Exit 0.5s, speed 0.5x..2x, loop vs freeze, custom duration
  const vtSlow = computeVideoTimeline({
    videoDuration: 10,
    trimIn: 2,
    trimOut: 6,
    speed: 0.5,
  });
  assert.equal(vtSlow.enter, 0.6);
  assert.equal(vtSlow.exit, 0.5);
  assert.equal(vtSlow.trimmedDuration, 4);
  assert.equal(vtSlow.naturalSpan, 8);
  assert.equal(vtSlow.clipStart, 0.6);
  assert.equal(vtSlow.clipEnd, 8.6);
  assert.equal(vtSlow.total, 9.1);

  const vtFastCustom = computeVideoTimeline({
    videoDuration: 10,
    trimIn: 0,
    trimOut: 4,
    speed: 2.0,
    customDurationEnabled: true,
    customDuration: 6.0,
  });
  assert.equal(vtFastCustom.naturalSpan, 2.0);
  assert.equal(vtFastCustom.hold, 6.0);
  assert.equal(vtFastCustom.clipEnd, 6.6);
  assert.equal(vtFastCustom.total, 7.1);

  // sourceTime before clipStart, freeze past end, and loop wrap past end
  assert.equal(
    computeVideoSourceTime(0.2, {
      clipStart: 0.6,
      clipEnd: 6.6,
      trimIn: 1.0,
      trimOut: 4.0,
      speed: 1.0,
      endBehavior: 'freeze',
    }),
    1.0
  );
  assert.equal(
    computeVideoSourceTime(5.1, {
      clipStart: 0.6,
      clipEnd: 6.6,
      trimIn: 1.0,
      trimOut: 4.0,
      speed: 1.0,
      endBehavior: 'freeze',
    }),
    4.0
  );
  const loopedT = computeVideoSourceTime(5.1, {
    clipStart: 0.6,
    clipEnd: 6.6,
    trimIn: 1.0,
    trimOut: 4.0,
    speed: 1.0,
    endBehavior: 'loop',
  });
  // elapsed = 4.5s over a 3.0s clip -> 1.0 + (4.5 % 3.0) = 2.5s
  assert.ok(Math.abs(loopedT - 2.5) < 1e-6);

  const effVid = getEffectiveTimeline(
    DEFAULT_VIDEO_TIMELINE,
    '',
    'video',
    0,
    getTypingConfigForCustomization(baseVidCustom)
  );
  assert.equal(effVid.enter, 0.6);
  assert.equal(effVid.exit, 0.5);
  assert.equal(effVid.hold, 4.0);
  assert.equal(effVid.total, 5.1);

  // 4) Layout box defaults, clamping (6% safe margin + override), corner resize aspect lock, snap guides, scale 30%-120%
  assert.deepEqual(getDefaultVideoBoxForPosition('center', '16:9'), { x: 18, y: 12, w: 64, h: 76 });
  assert.deepEqual(getDefaultVideoBoxForPosition('right', '16:9'), { x: 50, y: 10, w: 44, h: 80 });
  assert.deepEqual(getDefaultVideoBoxForPosition('left', '16:9'), { x: 6, y: 10, w: 44, h: 80 });
  assert.deepEqual(getDefaultVideoBoxForPosition('fullscreen', '16:9'), { x: 6, y: 6, w: 88, h: 88 });
  // In 9:16 left/right disabled -> falls back to center; corners use 60x26%
  assert.deepEqual(getDefaultVideoBoxForPosition('right', '9:16'), { x: 18, y: 12, w: 64, h: 76 });
  const tr916 = getDefaultVideoBoxForPosition('top-right', '9:16');
  assert.equal(tr916.w, 60);
  assert.equal(tr916.h, 26);

  const clampedSafe = clampVideoBoxToSafeMargin({ x: 0, y: 0, w: 50, h: 50 }, false);
  assert.equal(clampedSafe.x, 6);
  assert.equal(clampedSafe.y, 6);
  const clampedOut = clampVideoBoxToSafeMargin({ x: 0, y: 0, w: 50, h: 50 }, true);
  assert.equal(clampedOut.x, 0);
  assert.equal(clampedOut.y, 0);

  const snapped = snapVideoBoxToGuides({ x: 17.5, y: 11.5, w: 64, h: 76 }, false, 1.5);
  assert.equal(snapped.snappedCenterX, true);
  assert.equal(snapped.snappedCenterY, true);
  assert.equal(snapped.box.x, 18);
  assert.equal(snapped.box.y, 12);

  const startAspect = 50 / 40;
  const resized = resizeVideoBoxFromCorner({ x: 20, y: 20, w: 50, h: 40 }, 'se', -10, -2, true, false);
  const nextAspect = resized.w / resized.h;
  assert.ok(Math.abs(nextAspect - startAspect) < 0.02, 'Corner resize with aspectLock must preserve box aspect ratio');

  const scaled30 = scaleVideoBoxFromBase({ x: 18, y: 12, w: 64, h: 76 }, 0.3, false);
  assert.ok(scaled30.w < 20 && scaled30.h < 24);
  const px169 = videoBoxToPixels(DEFAULT_VIDEO_BOX, 1920, 1080, false);
  const px916 = videoBoxToPixels(DEFAULT_VIDEO_BOX, 1080, 1920, false);
  assert.equal(px169.boxWidth, Math.round(1920 * 0.64));
  assert.equal(px916.boxWidth, Math.round(1080 * 0.64));

  // 5) Shell fitting preserves clip aspect across vertical, square, and widescreen clips
  for (const clipAspect of [16 / 9, 9 / 16, 1.0]) {
    const fitted = fitVideoShellInBox({
      boxX: 100,
      boxY: 80,
      boxWidth: 640,
      boxHeight: 480,
      screenAspect: clipAspect,
      hasCaptionText: true,
      preferCaptionBelow: true,
    });
    assert.ok(fitted.frameW <= 640 + 1);
    assert.ok(fitted.frameH <= 480 + 1);
    const screenAsp = fitted.screenW / fitted.screenH;
    assert.ok(Math.abs(screenAsp - clipAspect) / clipAspect < 0.03);
  }

  // 6) Render all 6 video styles across formats (16:9, 9:16, 4K scale=2), bg ('style', 'green'), clip orientations, captions, and crop/fit modes
  const mkMockVideoCanvas = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      getContext: () => createMockCanvasContextForChat(),
    }) as unknown as HTMLCanvasElement;

  const clipShapes = [
    { label: 'landscape 16:9', w: 1920, h: 1080 },
    { label: 'portrait 9:16', w: 1080, h: 1920 },
    { label: 'square 1:1', w: 1080, h: 1080 },
  ];

  const captionVariants = [
    {
      cap: 'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ* فِي حَيَاةِ الإِنْسَانِ وَيَبْنِي المُسْتَقْبَلَ',
      src: 'المصدر: مختبر الرؤية',
    },
    { cap: '', src: '' },
  ];

  for (const styleId of expectedIds) {
    const meta = getStyleMetadata(styleId);
    for (const fmt of ['16:9', '9:16'] as const) {
      const sz = getRenderSize(fmt, '1080p');
      for (const bg of ['style', 'green'] as BackgroundMode[]) {
        for (const clipShape of clipShapes) {
          for (const capVar of captionVariants) {
            let maxBlur = 0;
            let curBlur = 0;
            const ctx = createMockCanvasContextForChat();
            Object.defineProperty(ctx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const box = capVar.cap
              ? getDefaultVideoBoxForPosition('center', fmt)
              : getDefaultVideoBoxForPosition('top-right', fmt);

            const custom: StyleCustomization = {
              ...baseVidCustom,
              styleId,
              videoStyleId: styleId,
              format: fmt,
              position: capVar.cap ? 'center' : 'top-right',
              videoBox: box,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              videoCaption: capVar.cap,
              videoSourceLine: capVar.src,
              videoFit: styleId === 'vid_cinematic' ? 'cover' : 'contain',
              videoPipShape: styleId === 'vid_pip' && bg === 'style' ? 'rounded-rect' : 'circle',
              videoPipNameTag: styleId === 'vid_pip' ? 'المعلق' : '',
              cinematicGrade: styleId === 'vid_cinematic' && bg === 'style',
              pixelDensity: 1,
            };

            const mockFrame = mkMockVideoCanvas(clipShape.w, clipShape.h);
            const contentObj = {
              quoteText: capVar.cap,
              authorName: capVar.src,
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              videoPosterSource: mockFrame,
              videoGetFrame: () => mockFrame,
              videoMeta: {
                duration: 8,
                codedWidth: clipShape.w,
                codedHeight: clipShape.h,
                displayWidth: clipShape.w,
                displayHeight: clipShape.h,
                rotation: 0 as const,
                hasAudio: true,
                fileSizeBytes: 1024 * 1024,
                fileName: 'sample.mp4',
              },
              videoCrop: { zoom: 1.35, offsetX: 0.2, offsetY: -0.15 },
              videoCaption: capVar.cap,
              videoSourceLine: capVar.src,
            };

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: DEFAULT_VIDEO_TIMELINE,
              custom,
              viewport: sz,
            });
            assert.equal(events.enterStart, 0.04);
            assert.equal(events.clipStart, 0.6);
            assert.ok(events.clipEnd && events.clipEnd >= 4.5);
            assert.ok(Array.isArray(events.keywordTimes));

            // Render Enter, Active, and Exit frames cleanly
            renderQuoteFrame(ctx, 0.25, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);
            renderQuoteFrame(ctx, 2.0, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);
            renderQuoteFrame(ctx, effVid.total - 0.15, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);

            if (bg === 'green') {
              assert.equal(
                maxBlur,
                0,
                `${styleId} (${fmt}, ${clipShape.label}) in green Chroma Key mode must keep shadowBlur === 0`
              );
            }
          }
        }
      }
    }
  }

  // 7) Verify 4K Scale rendering for Video Insert without throwing
  const sz4k = getRenderSize('16:9', '4K');
  const ctx4k = createMockCanvasContextForChat();
  const mock4k = mkMockVideoCanvas(1920, 1080);
  renderQuoteFrame(
    ctx4k,
    1.8,
    {
      quoteText: 'مقطع بدقة *4K* فائقة',
      authorName: '',
      subtitle: '',
      photoSource: null,
      photoId: '4k',
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      quotationMarks: 'none',
      videoPosterSource: mock4k,
      videoGetFrame: () => mock4k,
      videoCaption: 'مقطع بدقة *4K* فائقة',
      videoSourceLine: '',
    },
    DEFAULT_VIDEO_TIMELINE,
    { ...baseVidCustom, pixelDensity: 1 },
    sz4k
  );

  // 8) Verify SFX types 'play-click' and 'glitch' execute safely on mock AudioContext
  const mkMockParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
  });
  const mkMockAudioCtx = () =>
    ({
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createGain: () => ({ gain: mkMockParam(), connect: () => {}, disconnect: () => {} }),
      createOscillator: () => ({
        type: 'sine',
        frequency: mkMockParam(),
        connect: () => {},
        start: () => {},
        stop: () => {},
      }),
      createBiquadFilter: () => ({
        type: 'lowpass',
        frequency: mkMockParam(),
        Q: mkMockParam(),
        connect: () => {},
      }),
      createBuffer: (ch: number, len: number, sr: number) => ({
        numberOfChannels: ch,
        length: len,
        sampleRate: sr,
        getChannelData: () => new Float32Array(len),
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {},
      }),
      createConvolver: () => ({
        buffer: null,
        normalize: true,
        connect: () => {},
      }),
    }) as unknown as AudioContext;

  for (const sfxType of ['play-click', 'glitch'] as const) {
    const graph = buildSfxGraph(
      mkMockAudioCtx(),
      { enabled: true, type: sfxType, volume: 0.7, offset: 0, keywordHit: true, itemHit: false },
      { enterStart: 0.6, clipStart: 0.6, clipEnd: 4.6, keywordTimes: [1.5, 2.8] },
      42,
      0
    );
    assert.equal(typeof graph.stop, 'function');
    graph.stop();
  }
});

test('Calm White Gradient ("أبيض هادئ متدرج") theme in pts_timeline, phrase_flyer, and pts_flyer', () => {
  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_timeline',
    pointsStyleId: 'pts_timeline',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#4DD8FF',
    keywordColor: '#FFD166',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
  };

  // 1) Theme resolvers default to 'dark' and resolve 'light' from timelineTheme, flyerTheme, or styleTheme
  assert.equal(resolveTimelineTheme(baseCustom), 'dark');
  assert.equal(resolveFlyerTheme(baseCustom), 'dark');
  assert.equal(resolveTimelineTheme({ ...baseCustom, timelineTheme: 'light' }), 'light');
  assert.equal(resolveFlyerTheme({ ...baseCustom, flyerTheme: 'light' }), 'light');
  assert.equal(resolveTimelineTheme({ ...baseCustom, styleTheme: 'light' }), 'light');
  assert.equal(resolveFlyerTheme({ ...baseCustom, styleTheme: 'light' }), 'light');

  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 2.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };

  // 2) Verify pts_timeline in 'light' theme across all 5 path shapes renders dark slate text (#0F172A) and frosted white cards
  const shapes = ['straight', 'wave', 'zigzag', 'circle', 'stepped'] as const;
  for (const sh of shapes) {
    const fillStylesSeen = new Set<string>();
    const ctx = createMockCanvasContextForChat();
    let curFill: unknown = '#000000';
    Object.defineProperty(ctx, 'fillStyle', {
      get: () => curFill,
      set: (v: unknown) => {
        curFill = v;
        if (typeof v === 'string') fillStylesSeen.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctx,
      3.2,
      {
        quoteText: '',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: 'مراحل *التطوير* الأساسية',
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
      },
      timeline,
      {
        ...baseCustom,
        timelineShape: sh,
        timelineTheme: 'light',
      },
      sz
    );

    assert.ok(
      fillStylesSeen.has('#0F172A'),
      `pts_timeline (${sh}) in 'light' theme must use dark slate text #0F172A`
    );
    assert.ok(
      fillStylesSeen.has('#D97706'),
      `pts_timeline (${sh}) in 'light' theme must calibrate default pale keyword #FFD166 to high-contrast #D97706`
    );
    assert.ok(
      fillStylesSeen.has('RGBA(255, 255, 255, 0.88)'),
      `pts_timeline (${sh}) in 'light' theme must render frosted white callout card backplate`
    );
  }

  // 3) Verify phrase_flyer and pts_flyer in 'light' theme across all 4 creatures ('orb', 'butterfly', 'bat', 'firefly')
  const creatures: FlyerCreatureId[] = ['orb', 'butterfly', 'bat', 'firefly'];
  for (const cr of creatures) {
    const phraseFills = new Set<string>();
    const ctxPhrase = createMockCanvasContextForChat();
    let curPhraseFill: unknown = '#000000';
    Object.defineProperty(ctxPhrase, 'fillStyle', {
      get: () => curPhraseFill,
      set: (v: unknown) => {
        curPhraseFill = v;
        if (typeof v === 'string') phraseFills.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctxPhrase,
      1.6,
      {
        quoteText: 'الهدوء يصنع *التركيز* العميق في العمل',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
      },
      timeline,
      {
        ...baseCustom,
        mode: 'phrase',
        styleId: 'phrase_flyer',
        phraseStyleId: 'phrase_flyer',
        flyerCreature: cr,
        flyerTheme: 'light',
        accentColor: FLYER_DEFAULT_TINTS[cr],
        keywordColor: '#FDE047',
      },
      sz
    );

    assert.ok(
      phraseFills.has('#0F172A'),
      `phrase_flyer (${cr}) in 'light' theme must render dark slate text #0F172A`
    );
    assert.ok(
      phraseFills.has('#D97706'),
      `phrase_flyer (${cr}) in 'light' theme must calibrate pale keyword #FDE047 to #D97706`
    );

    const ptsFills = new Set<string>();
    const ctxPts = createMockCanvasContextForChat();
    let curPtsFill: unknown = '#000000';
    Object.defineProperty(ctxPts, 'fillStyle', {
      get: () => curPtsFill,
      set: (v: unknown) => {
        curPtsFill = v;
        if (typeof v === 'string') ptsFills.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctxPts,
      2.4,
      {
        quoteText: '',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: 'خطوات *النجاح* المستدام',
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
      },
      timeline,
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: cr,
        flyerTheme: 'light',
        accentColor: FLYER_DEFAULT_TINTS[cr],
        keywordColor: '#FDE047',
      },
      sz
    );

    assert.ok(
      ptsFills.has('#0F172A'),
      `pts_flyer (${cr}) in 'light' theme must render dark slate text & numerals #0F172A`
    );
    assert.ok(
      ptsFills.has('RGBA(255, 255, 255, 0.82)'),
      `pts_flyer (${cr}) in 'light' theme must render frosted white row cards`
    );

    // Live thumbnail preview in both 'dark' and 'light' themes
    drawCreaturePreviewThumbnail(ctxPts, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 0.8, 'dark');
    drawCreaturePreviewThumbnail(ctxPts, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 0.8, 'light');
  }
});

test('Smooth slow continuous creature flight around text and flyerFlightSpeed control', () => {
  // 1) Verify resolveFlyerFlightSpeed defaults to 0.42 and clamps [0.25, 1.25]
  assert.equal(resolveFlyerFlightSpeed(), DEFAULT_FLYER_FLIGHT_SPEED);
  assert.equal(resolveFlyerFlightSpeed({}), 0.42);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 0.1 }), 0.25);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 2.0 }), 1.25);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 0.35 }), 0.35);

  // 2) Verify flowing waypoints with keywordGlow maintain non-zero velocity (no sudden stops) and smooth hoverBoost
  const flowingWps = [
    { t: 0, x: 1200, y: 420, isHover: false, keywordGlow: 0.15 },
    { t: 0.9, x: 960, y: 400, isHover: false, keywordGlow: 1.0 },
    { t: 1.8, x: 700, y: 415, isHover: false, keywordGlow: 0.2 },
    { t: 2.8, x: 860, y: 560, isHover: false, keywordGlow: 0.25 },
  ];
  for (const sampleT of [0.45, 0.9, 1.35, 2.2]) {
    const st = sampleFlightWaypoints(flowingWps, sampleT, 3.2, 3.8);
    const speed = Math.hypot(st.vx, st.vy);
    assert.ok(speed > 25, `Flowing trajectory at t=${sampleT} must maintain continuous non-zero velocity (got ${speed})`);
  }
  const kwState = sampleFlightWaypoints(flowingWps, 0.88, 3.2, 3.8);
  assert.ok(kwState.hoverBoost > 0.8, 'Passing over a keyword waypoint must boost glow smoothly without stopping');

  // 3) Verify slower flyerFlightSpeed (0.35x) spreads keyword reveal times slower than faster (0.95x) in phrase_flyer
  const ctx = createMockCanvasContextForChat();
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.2, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  const content = {
    quoteText: 'الهدوء والسكينة يصنعان *التركيز* العميق في كل *خطوة* يومية',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'خطوات *الهدوء* والتركيز',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'orb',
    flyerFlightSpeed: 0.55,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#6FA8FF',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
  };

  const evSlow = getSceneEventTimes(ctx, content, timeline, { ...baseCustom, flyerFlightSpeed: 0.35 }, sz);
  const evFast = getSceneEventTimes(ctx, content, timeline, { ...baseCustom, flyerFlightSpeed: 0.95 }, sz);
  assert.ok(
    evSlow.keywordTimes.length >= 2 && evFast.keywordTimes.length >= 2,
    'Both slow and fast flyer schedules must emit keyword times'
  );
  assert.ok(
    evSlow.keywordTimes[1] > evFast.keywordTimes[1],
    `Ultra-slow flight (0.35x) must reach second keyword later (${evSlow.keywordTimes[1]}s) than faster flight (${evFast.keywordTimes[1]}s)`
  );

  // 4) Render phrase_flyer & pts_flyer across multiple timestamps (including late hold t=3.8s) and speeds without error
  for (const spd of [0.35, 0.55, 0.95]) {
    for (const t of [0.5, 1.8, 3.8]) {
      renderQuoteFrame(ctx, t, content, timeline, { ...baseCustom, flyerFlightSpeed: spd }, sz);
      renderQuoteFrame(
        ctx,
        t,
        content,
        timeline,
        {
          ...baseCustom,
          mode: 'points',
          styleId: 'pts_flyer',
          pointsStyleId: 'pts_flyer',
          flyerFlightSpeed: spd,
        },
        sz
      );
    }
  }
});

test('Gradual-wave flyer trajectories remain C1-smooth without sharp turns, and Bat/Butterfly/Orb render calm living ambient backdrops', () => {
  const ctx = createMockCanvasContextForChat();
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.4, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  const multiLineQuote =
    'الهدوء والسكينة يصنعان *التركيز* العميق في كل *خطوة* يومية متواصلة نحو الإنجاز الحقيقي';

  const content = {
    quoteText: multiLineQuote,
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'خطوات *الهدوء* المستمر',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'bat',
    flyerFlightSpeed: 0.55,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#B79CFF',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
  };

  // 1) Verify phrase_flyer C1 velocity continuity and zero sharp hairpin turns across 30ms samples
  const phrasePlan = buildPhraseFlyerPlan(ctx, content, timeline, baseCustom, sz);
  assert.ok(phrasePlan.waypoints.length >= 4);
  for (let i = 1; i < phrasePlan.waypoints.length - 1; i++) {
    const tKnot = phrasePlan.waypoints[i].t;
    const pre = sampleFlightWaypoints(phrasePlan.waypoints, tKnot - 0.0001, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const post = sampleFlightWaypoints(phrasePlan.waypoints, tKnot + 0.0001, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const dv = Math.hypot(post.vx - pre.vx, post.vy - pre.vy);
    assert.ok(dv < 5, `phrase_flyer velocity must be C1 continuous across knot ${i} at t=${tKnot} (dv=${dv})`);
  }

  let prevDirX = 0;
  let prevDirY = 0;
  let hasPrevDir = false;
  for (let t = 0.06; t <= phrasePlan.effective.total - 0.25; t += 0.03) {
    const st = sampleFlightWaypoints(phrasePlan.waypoints, t, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const sp = Math.hypot(st.vx, st.vy);
    if (sp > 20) {
      const dx = st.vx / sp;
      const dy = st.vy / sp;
      if (hasPrevDir) {
        const dot = prevDirX * dx + prevDirY * dy;
        assert.ok(dot > 0.72, `phrase_flyer must avoid sharp turns at t=${t.toFixed(2)} (dot=${dot.toFixed(3)})`);
      }
      prevDirX = dx;
      prevDirY = dy;
      hasPrevDir = true;
    }
  }

  // 2) Verify pts_flyer C1 velocity continuity and zero sharp turns across 30ms samples
  const ptsCustom: StyleCustomization = {
    ...baseCustom,
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
  };
  const ptsPlan = buildPointsFlyerPlan(ctx, content, ptsCustom, sz);
  assert.ok(ptsPlan.waypoints.length >= 4);
  for (let i = 1; i < ptsPlan.waypoints.length - 1; i++) {
    const tKnot = ptsPlan.waypoints[i].t;
    const pre = sampleFlightWaypoints(ptsPlan.waypoints, tKnot - 0.0001, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const post = sampleFlightWaypoints(ptsPlan.waypoints, tKnot + 0.0001, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const dv = Math.hypot(post.vx - pre.vx, post.vy - pre.vy);
    assert.ok(dv < 5, `pts_flyer velocity must be C1 continuous across knot ${i} at t=${tKnot} (dv=${dv})`);
  }

  hasPrevDir = false;
  for (let t = 0.06; t <= ptsPlan.schedule.totalDuration - 0.25; t += 0.03) {
    const st = sampleFlightWaypoints(ptsPlan.waypoints, t, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const sp = Math.hypot(st.vx, st.vy);
    if (sp > 20) {
      const dx = st.vx / sp;
      const dy = st.vy / sp;
      if (hasPrevDir) {
        const dot = prevDirX * dx + prevDirY * dy;
        assert.ok(dot > 0.72, `pts_flyer must avoid sharp turns at t=${t.toFixed(2)} (dot=${dot.toFixed(3)})`);
      }
      prevDirX = dx;
      prevDirY = dy;
      hasPrevDir = true;
    }
  }

  // 3) Verify bespoke calm animated bokeh gradients execute for Bat, Butterfly, and Orb in both dark and light themes, while Green stays pure
  const creatures: FlyerCreatureId[] = ['bat', 'butterfly', 'orb', 'firefly'];
  for (const cr of creatures) {
    for (const theme of ['dark', 'light'] as const) {
      let radialGradCalls = 0;
      const testCtx = createMockCanvasContextForChat();
      const origRadial = testCtx.createRadialGradient.bind(testCtx);
      testCtx.createRadialGradient = ((...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
        radialGradCalls++;
        return origRadial(...args);
      }) as CanvasRenderingContext2D['createRadialGradient'];

      renderQuoteFrame(
        testCtx,
        1.5,
        content,
        timeline,
        {
          ...baseCustom,
          flyerCreature: cr,
          flyerTheme: theme,
          accentColor: FLYER_DEFAULT_TINTS[cr],
          backgroundMode: 'style',
        },
        sz
      );

      assert.ok(
        radialGradCalls >= 10,
        `${cr} (${theme}) must render calm layered ambient glow & bokeh gradients (got ${radialGradCalls})`
      );
    }

    // Green Chroma Key purity check
    let maxBlur = 0;
    let curBlur = 0;
    const greenCtx = createMockCanvasContextForChat();
    Object.defineProperty(greenCtx, 'shadowBlur', {
      get: () => curBlur,
      set: (v: number) => {
        curBlur = v;
        if (v > maxBlur) maxBlur = v;
      },
      configurable: true,
    });
    renderQuoteFrame(
      greenCtx,
      1.5,
      content,
      timeline,
      {
        ...baseCustom,
        flyerCreature: cr,
        accentColor: FLYER_DEFAULT_TINTS[cr],
        backgroundMode: 'green',
        greenScreen: true,
      },
      sz
    );
    assert.equal(maxBlur, 0, `${cr} green mode must preserve shadowBlur === 0`);
  }
});

test('Bat theme renders a polished tapered crescent moon with clipped lunar shading and zero opaque dark cutout', () => {
  const thumbSize = 96;
  for (const theme of ['dark', 'light'] as const) {
    let clipCalls = 0;
    let bezierCalls = 0;
    let usedOpaqueDarkCutout = false;
    const rawCtx = createMockCanvasContextForChat();
    const origClip = rawCtx.clip.bind(rawCtx);
    const origBezier = rawCtx.bezierCurveTo.bind(rawCtx);
    let currentFill: unknown = rawCtx.fillStyle;
    Object.defineProperty(rawCtx, 'fillStyle', {
      get: () => currentFill,
      set: (v: unknown) => {
        if (typeof v === 'string' && v.toUpperCase() === '#0A081B') {
          usedOpaqueDarkCutout = true;
        }
        currentFill = v;
      },
      configurable: true,
    });
    rawCtx.clip = ((...args: Parameters<CanvasRenderingContext2D['clip']>) => {
      clipCalls++;
      return origClip(...args);
    }) as CanvasRenderingContext2D['clip'];
    rawCtx.bezierCurveTo = ((...args: Parameters<CanvasRenderingContext2D['bezierCurveTo']>) => {
      bezierCalls++;
      return origBezier(...args);
    }) as CanvasRenderingContext2D['bezierCurveTo'];

    drawCreaturePreviewThumbnail(rawCtx, thumbSize, thumbSize, 'bat', FLYER_DEFAULT_TINTS.bat, 1.2, theme);
    assert.ok(clipCalls >= 1, `Bat thumbnail (${theme}) must clip inside crescent moon for lunar texture`);
    assert.ok(bezierCalls >= 10, `Bat thumbnail (${theme}) must trace multi-shell feathered crescent edges`);
    assert.equal(usedOpaqueDarkCutout, false, `Bat (${theme}) must never stamp an opaque #0A081B circle cutout`);
  }

  // Verify soft glow radius evolves gradually across time for both dark and light Bat scenes
  const captureMaxGlowRadius = (t: number, theme: 'dark' | 'light'): number => {
    let maxR = 0;
    const rawCtx = createMockCanvasContextForChat();
    const origRadial = rawCtx.createRadialGradient.bind(rawCtx);
    rawCtx.createRadialGradient = ((x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      if (r1 > maxR) maxR = r1;
      return origRadial(x0, y0, r0, x1, y1, r1);
    }) as CanvasRenderingContext2D['createRadialGradient'];
    drawCreaturePreviewThumbnail(rawCtx, 120, 120, 'bat', FLYER_DEFAULT_TINTS.bat, t, theme);
    return maxR;
  };
  assert.notEqual(
    captureMaxGlowRadius(0.1, 'dark'),
    captureMaxGlowRadius(2.4, 'dark'),
    'Dark Bat moon soft glow radius must evolve gradually over time'
  );
  assert.notEqual(
    captureMaxGlowRadius(0.1, 'light'),
    captureMaxGlowRadius(2.4, 'light'),
    'Light Bat moon soft glow radius must evolve gradually over time'
  );

  // Also ensure full-scene 16:9 and 9:16 Bat backdrops render cleanly in dark and light themes
  const content = {
    quoteText: 'سكون الليل يمنحك *وضوح* الرؤية',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'تأمل',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const timeline = { enterDuration: 1.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  for (const format of ['16:9', '9:16'] as const) {
    const sz = format === '16:9'
      ? { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
      : { width: 1080, height: 1920, baseWidth: 1080, baseHeight: 1920, scale: 1 };
    for (const theme of ['dark', 'light'] as const) {
      const ctx = createMockCanvasContextForChat();
      renderQuoteFrame(
        ctx,
        1.4,
        content,
        timeline,
        {
          mode: 'phrase',
          styleId: 'phrase_flyer',
          phraseStyleId: 'phrase_flyer',
          flyerCreature: 'bat',
          flyerTheme: theme,
          flyerFlightSpeed: 0.55,
          format,
          position: 'center',
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: FLYER_DEFAULT_TINTS.bat,
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1.0,
          minimalShape: 'arch',
          seed: 303,
        },
        sz
      );
    }
  }
});

test('Living Creature cricket audio: 3 quiet night presets, strict Flyer scope guard, live audition, and volume control', () => {
  assert.equal(FLYER_CRICKET_PRESETS.length, 3);
  assert.deepEqual(
    FLYER_CRICKET_PRESETS.map((p) => p.id),
    ['distant_soft', 'damp_forest', 'midnight_calm']
  );
  assert.equal(DEFAULT_FLYER_CRICKET_PRESET, 'distant_soft');
  assert.equal(DEFAULT_FLYER_CRICKET_VOLUME, 0.35);

  assert.equal(resolveFlyerCricketPreset(undefined), 'distant_soft');
  assert.equal(resolveFlyerCricketPreset('damp_forest'), 'damp_forest');
  assert.equal(resolveFlyerCricketPreset('unknown' as unknown as FlyerCricketPresetId), 'distant_soft');
  assert.equal(resolveFlyerCricketVolume(undefined), 0.35);
  assert.equal(resolveFlyerCricketVolume(0), 0.05);
  assert.equal(resolveFlyerCricketVolume(2), 1.0);

  // Strict Flyer scope guard: active only on phrase_flyer or pts_flyer
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'phrase',
      styleId: 'phrase_flyer',
      phraseStyleId: 'phrase_flyer',
      flyerCricketEnabled: true,
      flyerCricketVolume: 0.35,
    }),
    true
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCricketEnabled: true,
      flyerCricketVolume: 0.4,
    }),
    true
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'points',
      styleId: 'pts_timeline',
      pointsStyleId: 'pts_timeline',
      flyerCricketEnabled: true,
    }),
    false
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'phrase',
      styleId: 'calligraphy-ink',
      phraseStyleId: 'calligraphy-ink',
      flyerCricketEnabled: true,
    }),
    false
  );

  // Build mock Web Audio context to verify deterministic synthesis across all 3 presets
  const createAudioParam = (init = 0) => ({
    value: init,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });

  const makeMockAudioCtx = () => {
    let createdOsc = 0;
    let createdBufferSources = 0;
    let startedNodes = 0;
    let stoppedNodes = 0;
    const createdBuffers: { channels: Float32Array[]; length: number }[] = [];
    const mockCtx = {
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createBuffer: (ch: number, len: number) => {
        const channels = Array.from({ length: ch }, () => new Float32Array(len));
        createdBuffers.push({ channels, length: len });
        return {
          numberOfChannels: ch,
          length: len,
          getChannelData: (idx: number) => channels[idx] || channels[0],
        };
      },
      createGain: () => ({
        gain: createAudioParam(1),
        connect: () => {},
        disconnect: () => {},
      }),
      createBiquadFilter: () => ({
        type: 'lowpass',
        frequency: createAudioParam(1000),
        Q: createAudioParam(1),
        connect: () => {},
        disconnect: () => {},
      }),
      createConvolver: () => ({
        buffer: null,
        connect: () => {},
        disconnect: () => {},
      }),
      createStereoPanner: () => ({
        pan: createAudioParam(0),
        connect: () => {},
        disconnect: () => {},
      }),
      createBufferSource: () => {
        createdBufferSources++;
        return {
          buffer: null,
          loop: false,
          connect: () => {},
          disconnect: () => {},
          start: () => {
            startedNodes++;
          },
          stop: () => {
            stoppedNodes++;
          },
        };
      },
      createOscillator: () => {
        createdOsc++;
        return {
          type: 'sine',
          frequency: createAudioParam(440),
          connect: () => {},
          disconnect: () => {},
          start: () => {
            startedNodes++;
          },
          stop: () => {
            stoppedNodes++;
          },
        };
      },
      getStats: () => ({ createdOsc, createdBufferSources, startedNodes, stoppedNodes, createdBuffers }),
    };
    return mockCtx;
  };

  // Disabled returns 0 scheduled chirps
  const disCtx = makeMockAudioCtx();
  const disabledHandle = buildFlyerCricketGraph(
    disCtx as unknown as BaseAudioContext,
    { enabled: false, preset: 'distant_soft', volume: 0.35 },
    6.0,
    1042,
    0
  );
  assert.equal(disabledHandle.scheduledChirpCount, 0);

  // Each of the 3 presets schedules continuous calm trills + uninterrupted bed, supports live volume updates, and cleans up on stop()
  for (const preset of FLYER_CRICKET_PRESETS) {
    const mockCtx = makeMockAudioCtx();
    const handle = buildFlyerCricketGraph(
      mockCtx as unknown as BaseAudioContext,
      { enabled: true, preset: preset.id, volume: 0.35 },
      6.5,
      1042,
      0
    );
    assert.ok(
      handle.scheduledChirpCount >= 6,
      `Preset ${preset.id} must schedule continuous calm trills (>= 6) over 6.5s, got ${handle.scheduledChirpCount}`
    );
    const stats = mockCtx.getStats();
    assert.ok(stats.createdOsc >= 12);
    assert.ok(
      stats.createdBufferSources >= 2,
      `Preset ${preset.id} must start both breeze bed and continuous cricket trill bed`
    );
    // Continuous 3.0s cricket trill bed buffer must maintain non-zero calm energy across all quarters (no dead silence)
    const bedBuf = stats.createdBuffers.find((b) => b.length === 48000 * 3);
    assert.ok(bedBuf, `Preset ${preset.id} must synthesize a 3.0s seamless looping cricket bed buffer`);
    for (let q = 0; q < 4; q++) {
      const start = Math.floor((q * bedBuf.length) / 4);
      const end = Math.floor(((q + 1) * bedBuf.length) / 4);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(bedBuf.channels[0][i]);
        if (v > peak) peak = v;
      }
      assert.ok(peak > 0.15 && peak < 1.2, `Preset ${preset.id} continuous bed quarter ${q} must stay calm & active (peak=${peak})`);
    }
    handle.setVolume(0.5);
    handle.stop();
    assert.ok(mockCtx.getStats().stoppedNodes >= 3);

    // Audition sample mode triggers continuous calm trills cleanly
    const audCtx = makeMockAudioCtx();
    const audHandle = buildFlyerCricketGraph(
      audCtx as unknown as BaseAudioContext,
      { enabled: true, preset: preset.id, volume: 0.4 },
      3.0,
      1042,
      0,
      { auditionOnly: true }
    );
    assert.ok(
      audHandle.scheduledChirpCount >= 3,
      `Preset ${preset.id} audition must play continuous calm trills (>= 3), got ${audHandle.scheduledChirpCount}`
    );
    audHandle.stop();
  }
});

test('Points mode supports up to 12 items: quick paste, schedule hold extension, single-column auto-fit, and all 8 styles in 16:9 and 9:16', () => {
  assert.equal(MAX_POINTS_ITEMS, 12);

  // 1) Quick-paste parses 14 lines and caps cleanly at 12 while preserving *keywords* and stripping bullets
  const fourteenLines = Array.from({ length: 14 }, (_, i) => `${i + 1}. خطوة رقم ${i + 1} نحو *النجاح*`).join('\n');
  const parsed12 = parseQuickPastePointsItems(fourteenLines);
  assert.equal(parsed12.length, 12);
  assert.equal(parsed12[0].text, 'خطوة رقم 1 نحو *النجاح*');
  assert.equal(parsed12[11].text, 'خطوة رقم 12 نحو *النجاح*');

  // 2) Stats threshold scales comfortably above 80 words for 9..12 items while staying at 80 for <=8
  const short12: PointsItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p12-${i + 1}`,
    text: `نقطة عملية واضحة رقم ${i + 1} لتطوير *المهارة*`,
  }));
  const stats12 = countPointsStats('١٢ خطوة للنجاح', short12);
  assert.equal(stats12.totalWordLimit, 128);
  assert.equal(stats12.exceedsTotalLimit, false);
  const stats8 = countPointsStats('٨ خطوات', short12.slice(0, 8));
  assert.equal(stats8.totalWordLimit, 80);

  // 3) Schedule computes all 12 items, Arabic-Indic 10..12, countdown 12..1, and extends short endHold for reading comfort
  const sched12Clean = computePointsSchedule(
    '١٢ خطوة أساسية',
    short12,
    { revealInterval: 1.0, autoInterval: false, endHold: 1.0 },
    'pts_clean'
  );
  assert.equal(sched12Clean.items.length, 12);
  assert.equal(sched12Clean.itemTimes.length, 12);
  assert.equal(formatPointMarker(9, 'arabic-indic', 12, false), '١٠');
  assert.equal(formatPointMarker(10, 'arabic-indic', 12, false), '١١');
  assert.equal(formatPointMarker(11, 'arabic-indic', 12, false), '١٢');
  assert.equal(sched12Clean.holdExtended, true);
  assert.ok(sched12Clean.effectiveEndHold >= 1.9, '12-point clean list with 1.0s requested hold must comfortably extend visibility');

  const sched12Ranking = computePointsSchedule('أقوى ١٢ مهارة', short12, DEFAULT_POINTS_TIMING, 'pts_ranking');
  assert.equal(sched12Ranking.items[0].displayNumber, 12);
  assert.equal(sched12Ranking.items[11].displayNumber, 1);

  // 4) Auto-fit enforces single column (gridCols === 1) for 12 items even in 16:9 fullscreen and prevents bottom overflow
  const ctx = createMockCanvasContextForChat();
  const baseContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: '١٢ مبدأ عملي للتركيز *المستمر*',
    pointsItems: short12,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  for (const format of ['16:9', '9:16'] as const) {
    const sz = getRenderSize(format, '1080p');
    for (const pos of ['center', 'fullscreen', 'left', 'right'] as const) {
      const { layout } = buildAutoFitPointsLayout({
        ctx,
        content: baseContent,
        custom: {
          mode: 'points',
          styleId: 'pts_clean',
          pointsStyleId: 'pts_clean',
          format,
          position: pos,
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#4C8DFF',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          seed: 99,
          minimalShape: 'arch',
        },
        size: sz,
        styleId: 'pts_clean',
        allowedArabicFonts: PTS_CLEAN_CONFIG.allowedFonts,
        defaultArabicFont: PTS_CLEAN_CONFIG.defaultQuoteFont,
        defaultEnglishFont: PTS_CLEAN_CONFIG.defaultEnglishQuoteFont,
        fontWeight: 700,
        minFontSize: 20,
        maxFontSize: 40,
        lineHeightRatio: 1.56,
        supportedMarkerTypes: PTS_CLEAN_CONFIG.supportedMarkerTypes,
        defaultMarkerType: PTS_CLEAN_CONFIG.defaultMarkerType,
        allowTwoByTwoGrid: true,
      });

      assert.equal(layout.gridCols, 1, `12 items must stay single-column for ${format} ${pos}`);
      assert.equal(layout.items.length, 12);
      assert.ok(layout.fontSize >= 12);
      assert.ok(
        layout.contentBottomY <= layout.boxY + layout.boxH + 4,
        `12 items must fit inside container bounds for ${format} ${pos} (bottom=${layout.contentBottomY}, boxBottom=${layout.boxY + layout.boxH})`
      );
    }
  }

  // 5) Render all 8 Points styles cleanly with 12 points across 16:9 and 9:16 (and verify timeline shapes + flyer smoothness)
  const timeline = { enterDuration: 1.2, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  for (const styleMeta of POINTS_STYLES_LIST) {
    for (const format of ['16:9', '9:16'] as const) {
      const sz = getRenderSize(format, '1080p');
      const ptsId = styleMeta.id as PointsStyleId;
      const custom: StyleCustomization = {
        mode: 'points',
        styleId: ptsId,
        pointsStyleId: ptsId,
        format,
        position: 'center',
        backgroundMode: 'style',
        greenScreen: false,
        accentColor: styleMeta.defaultAccent,
        keywordColor: styleMeta.defaultKeywordColor,
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1.0,
        minimalShape: 'arch',
        seed: 2026,
        flyerCreature: 'firefly',
        flyerFlightSpeed: 0.55,
        timelineShape: ptsId === 'pts_timeline' ? 'circle' : undefined,
      };
      const ev = getSceneEventTimes(ctx, baseContent, timeline, custom, sz);
      const itemTimes = ev.itemTimes || [];
      assert.equal(itemTimes.length, 12, `${ptsId} (${format}) must emit 12 item timestamps`);
      renderQuoteFrame(ctx, itemTimes[11] + 0.5, baseContent, timeline, custom, sz);
    }
  }

  // Extra check: pts_timeline horizontal & vertical with 12 points + pts_flyer C1 trajectory continuity with 12 points
  const szWide = getRenderSize('16:9', '1080p');
  for (const shape of ['straight', 'wave', 'circle'] as const) {
    for (const orient of ['horizontal', 'vertical'] as const) {
      renderQuoteFrame(
        ctx,
        14.5,
        baseContent,
        timeline,
        {
          mode: 'points',
          styleId: 'pts_timeline',
          pointsStyleId: 'pts_timeline',
          timelineShape: shape,
          timelineOrientation: orient,
          format: '16:9',
          position: 'center',
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#38BDF8',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          seed: 77,
          minimalShape: 'arch',
        },
        szWide
      );
    }
  }

  const flyer12Plan = buildPointsFlyerPlan(
    ctx,
    baseContent,
    {
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCreature: 'bat',
      flyerFlightSpeed: 0.55,
      format: '16:9',
      position: 'center',
      backgroundMode: 'style',
      greenScreen: false,
      accentColor: '#B79CFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 1200,
      minimalShape: 'arch',
    },
    szWide
  );
  assert.equal(flyer12Plan.layout.items.length, 12);
  for (let i = 1; i < flyer12Plan.waypoints.length - 1; i++) {
    const tk = flyer12Plan.waypoints[i].t;
    const pre = sampleFlightWaypoints(flyer12Plan.waypoints, tk - 0.0001, flyer12Plan.schedule.exitStart, flyer12Plan.schedule.totalDuration);
    const post = sampleFlightWaypoints(flyer12Plan.waypoints, tk + 0.0001, flyer12Plan.schedule.exitStart, flyer12Plan.schedule.totalDuration);
    assert.ok(Math.hypot(post.vx - pre.vx, post.vy - pre.vy) < 5);
  }
});

test('pts_timeline supports 3rd "purple" Cinematic Dark Purple theme with harmonized path, nodes, backdrop vignette, and clean green isolation', () => {
  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_timeline',
    pointsStyleId: 'pts_timeline',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#6FA8FF',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
  };

  // 1) Theme resolver resolves 'purple' cleanly without changing flyer theme behavior
  assert.equal(resolveTimelineTheme({ ...baseCustom, timelineTheme: 'purple' }), 'purple');
  assert.equal(resolveFlyerTheme({ ...baseCustom, timelineTheme: 'purple' }), 'dark');

  // 2) Backdrop generator handles 'purple' cleanly for 16:9 and 9:16
  for (const [bw, bh] of [
    [1920, 1080],
    [1080, 1920],
  ]) {
    const canvas = getCachedPtsTimelineBackdrop(bw, bh, '#B77CFF', 'purple');
    assert.ok(canvas, `Must return cached canvas for purple backdrop ${bw}x${bh}`);
  }

  // 3) All 5 timeline shapes render harmonized purple disc (#120822), soft lavender text (#F5F2FF), and plum glass callouts
  const timeline = { enterDuration: 2.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const shapes = ['straight', 'wave', 'zigzag', 'circle', 'stepped'] as const;
  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'ثيم *بنفسجي* سينمائي',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  for (const sh of shapes) {
    const fillsSeen = new Set<string>();
    const strokesSeen = new Set<string>();
    const ctx = createMockCanvasContextForChat();
    let curFill: unknown = '#000000';
    let curStroke: unknown = '#000000';
    Object.defineProperty(ctx, 'fillStyle', {
      get: () => curFill,
      set: (v: unknown) => {
        curFill = v;
        if (typeof v === 'string') fillsSeen.add(v.toUpperCase());
      },
      configurable: true,
    });
    Object.defineProperty(ctx, 'strokeStyle', {
      get: () => curStroke,
      set: (v: unknown) => {
        curStroke = v;
        if (typeof v === 'string') strokesSeen.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctx,
      3.2,
      content,
      timeline,
      {
        ...baseCustom,
        timelineShape: sh,
        timelineTheme: 'purple',
      },
      sz
    );

    assert.ok(fillsSeen.has('#F5F2FF'), `Purple theme (${sh}) must use crisp soft lavender-white text #F5F2FF`);
    assert.ok(fillsSeen.has('#120822'), `Purple theme (${sh}) must fill luxury timeline node discs with deep plum #120822`);
    assert.ok(fillsSeen.has('RGBA(22, 11, 42, 0.66)'), `Purple theme (${sh}) must use translucent plum callout backplate`);
    assert.ok(strokesSeen.has('#B77CFF'), `Purple theme (${sh}) must harmonize default ring/stem strokes to orchid #B77CFF`);
  }

  // 4) Green screen mode remains pure #00FF00 even when timelineTheme is 'purple'
  const greenFills = new Set<string>();
  const greenCtx = createMockCanvasContextForChat();
  let curG: unknown = '#000000';
  Object.defineProperty(greenCtx, 'fillStyle', {
    get: () => curG,
    set: (v: unknown) => {
      curG = v;
      if (typeof v === 'string') greenFills.add(v.toUpperCase());
    },
    configurable: true,
  });
  renderQuoteFrame(
    greenCtx,
    2.5,
    content,
    timeline,
    {
      ...baseCustom,
      timelineTheme: 'purple',
      backgroundMode: 'green',
      greenScreen: true,
    },
    sz
  );
  assert.ok(greenFills.has('#00FF00'), 'Green mode must stay pure #00FF00 even when timelineTheme=purple');
  assert.equal(greenFills.has('#F5F2FF'), false, 'Green mode must use crisp white primary text rather than purple-tinted text');
});

test('pts_flyer horizontal cards layout ("بطاقات أفقية"): RTL order, row fit, uniform auto-fit without overflow across 2/3/5/8 items with long diacritics, both formats, every position, and every background', () => {
  const ctx = createMockCanvasContextForChat();
  const timeline = { enterDuration: 1.5, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };

  const longDiacritizedPool: PointsItem[] = [
    {
      id: 'hc-1',
      text: 'إِنَّ *التَّخْطِيطَ* الدَّقِيقَ يَصْنَعُ الفَارِقَ فِي المَشَارِيعِ الحَدِيثَةِ',
    },
    {
      id: 'hc-2',
      text: 'المُثَابَرَةُ اليَوْمِيَّةُ تَبْنِي *النَّتَائِجَ* الكُبْرَى بِثَبَاتٍ وَهُدُوءٍ',
    },
    {
      id: 'hc-3',
      text: 'وُضُوحُ الرُّؤْيَةِ يُوَجِّهُ *الفَرِيقَ* نَحْوَ أَهْدَافٍ مُحَدَّدَةٍ وَمُتَّزِنَةٍ',
    },
    {
      id: 'hc-4',
      text: 'قِيَاسُ الأَدَاءِ يُسَاعِدُ عَلَى *التَّحْسِينِ* المُسْتَمِرِّ بِدُونِ تَوَقُّفٍ',
    },
    {
      id: 'hc-5',
      text: 'البَسَاطَةُ فِي التَّصْمِيمِ تَمْنَحُ *المُشَاهِدَ* تَجْرِبَةً بَصَرِيَّةً سَلِسَةً',
    },
    {
      id: 'hc-6',
      text: 'الاهْتِمَامُ بِالتَّفَاصِيلِ الدَّقِيقَةِ يُمَيِّزُ *العَمَلَ* المُتْقَنَ دَائِماً',
    },
    {
      id: 'hc-7',
      text: 'اخْتِيَارُ الأَلْوَانِ المُتَنَاغِمَةِ يَزِيدُ مِنْ *جَاذِبِيَّةِ* العَرْضِ المَرْئِيِّ',
    },
    {
      id: 'hc-8',
      text: 'التَّوْقِيتُ الهَادِئُ يُبْرِزُ *المَعْنَى* وَيُعَزِّزُ تَرْكِيزَ القَارِئِ',
    },
  ];

  // Layout resolver defaults safely to 'vertical' and accepts 'horizontal-cards'
  assert.equal(resolvePointsFlyerLayout(undefined), 'vertical');
  assert.equal(resolvePointsFlyerLayout({ ptsFlyerLayout: 'vertical' }), 'vertical');
  assert.equal(resolvePointsFlyerLayout({ ptsFlyerLayout: 'horizontal-cards' }), 'horizontal-cards');

  const counts = [2, 3, 5, 8];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'fullscreen', 'left', 'right'];
  const backgrounds: BackgroundMode[] = ['style', 'green', 'black'];

  for (const count of counts) {
    const items = longDiacritizedPool.slice(0, count);
    const content = {
      quoteText: '',
      authorName: '',
      subtitle: '',
      photoSource: null,
      photoId: 'default',
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      quotationMarks: 'none' as const,
      pointsTitle: 'خُطُوَاتُ *النَّجَاحِ* المُتَكَامِلَةِ',
      pointsItems: items,
      pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.2, autoInterval: false, endHold: 2.0 },
    };

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;
      const sz = { width: baseW, height: baseH, baseWidth: baseW, baseHeight: baseH, scale: 1 };

      for (const position of positions) {
        const custom: StyleCustomization = {
          mode: 'points',
          styleId: 'pts_flyer',
          pointsStyleId: 'pts_flyer',
          ptsFlyerLayout: 'horizontal-cards',
          flyerCreature: 'orb',
          flyerFlightSpeed: 0.55,
          flyerTheme: 'dark',
          pointsMarkerType: 'arabic-indic',
          pointsHighlightCurrent: true,
          format,
          position,
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#6FA8FF',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1.0,
          seed: 777,
          minimalShape: 'arch',
        };

        const plan = buildHorizontalCardsFlyerPlan(ctx, content, custom, sz);
        const posBox = getPointsPositionBox(position, format, baseW, baseH);

        // Exact item count preserved
        assert.equal(plan.cards.length, count);

        // Row fit constraints: <= 4 in 16:9, <= 2 in 9:16, narrow left/right <= 2
        if (format === '16:9') {
          assert.ok(plan.cols <= 4, `16:9 cols must be <= 4, got ${plan.cols}`);
          if (posBox.effectivePosition === 'left' || posBox.effectivePosition === 'right') {
            assert.ok(plan.cols <= 2, `Narrow ${position} region must use <= 2 cols, got ${plan.cols}`);
          }
        } else {
          assert.ok(plan.cols <= 2, `9:16 cols must be <= 2, got ${plan.cols}`);
        }

        // Uniform final card size across all cards
        for (const card of plan.cards) {
          assert.equal(card.cardW, plan.cardW, 'All cards must share uniform cardW');
          assert.equal(card.cardH, plan.cardH, 'All cards must share uniform cardH');

          // Zero overflow outside position box (including -6px active lift headroom)
          assert.ok(
            card.cardX >= posBox.boxX - 1,
            `Card ${card.index} left overflow (${card.cardX} < ${posBox.boxX}) in ${count} items ${format} ${position}`
          );
          assert.ok(
            card.cardX + card.cardW <= posBox.boxX + posBox.boxWidth + 1,
            `Card ${card.index} right overflow (${card.cardX + card.cardW} > ${posBox.boxX + posBox.boxWidth}) in ${count} items ${format} ${position}`
          );
          assert.ok(
            card.cardY - 6 >= posBox.boxY - 1,
            `Card ${card.index} top lift overflow (${card.cardY - 6} < ${posBox.boxY}) in ${count} items ${format} ${position}`
          );
          assert.ok(
            card.cardY + card.cardH <= posBox.boxY + posBox.boxHeight + 1,
            `Card ${card.index} bottom overflow (${card.cardY + card.cardH} > ${posBox.boxY + posBox.boxHeight}) in ${count} items ${format} ${position}`
          );

          // Every wrapped text line stays strictly inside card inner bounds
          assert.ok(
            card.layout.maxLineWidth <= card.textW + 2,
            `Card ${card.index} text line width (${card.layout.maxLineWidth}) exceeds card textW (${card.textW})`
          );
          assert.ok(
            card.textY + card.layout.totalHeight <= card.cardY + card.cardH - card.cardPadBottom + 2,
            `Card ${card.index} text height overflows card bottom in ${count} items ${format} ${position}`
          );

          // Marker badge sits on top above the text
          assert.ok(
            card.markerCenterY + card.badgeR <= card.textY + 2,
            `Card ${card.index} badge must sit above card text`
          );
        }

        // RTL reading order: first card in every row is on the RIGHT (cardX strictly decreases across columns)
        for (let r = 0; r < plan.rows; r++) {
          const rowCards = plan.cards.filter((c) => c.row === r);
          for (let ci = 1; ci < rowCards.length; ci++) {
            assert.ok(
              rowCards[ci - 1].cardX > rowCards[ci].cardX,
              `RTL order violated on row ${r}: card ${rowCards[ci - 1].index} (${rowCards[ci - 1].cardX}) must be right of card ${rowCards[ci].index} (${rowCards[ci].cardX})`
            );
          }
        }

        // Schedule & getEventTimes parity with vertical pts_flyer
        const verticalEv = getSceneEventTimes(
          ctx,
          content,
          timeline,
          { ...custom, ptsFlyerLayout: 'vertical' },
          sz
        );
        const horizEv = getSceneEventTimes(ctx, content, timeline, custom, sz);
        assert.equal(horizEv.enterStart, verticalEv.enterStart);
        assert.deepEqual(horizEv.itemTimes, verticalEv.itemTimes);
        assert.ok(horizEv.keywordTimes.length >= count, 'Must report keyword times for cards with keywords');

        // Render cleanly across all 3 background modes (style, green, black) without throwing
        for (const bgMode of backgrounds) {
          renderQuoteFrame(
            ctx,
            plan.cards[Math.min(1, count - 1)].sched.startTime + 0.35,
            content,
            timeline,
            {
              ...custom,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
            },
            sz
          );
        }
      }
    }
  }
});

test('pts_flyer horizontal cards: unrevealed text hidden, connected Arabic words, keyword circling without glyph width change, green/black surface rules, all 4 creatures, and preset/JSON persistence', () => {
  const timeline = { enterDuration: 1.5, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'عُنْوَانٌ *مُمَيَّزٌ*',
    pointsItems: [
      { id: 'k1', text: 'التَّخْطِيطُ السَّلِيمُ يَبْنِي *التَّصْمِيمَ* الحَدِيثَ' },
      { id: 'k2', text: 'المُثَابَرَةُ اليَوْمِيَّةُ تُطْلِقُ *الإِبْدَاعَ* البَصَرِيَّ' },
      { id: 'k3', text: 'الاهْتِمَامُ بِالتَّفَاصِيلِ يُبْرِزُ *الجَوْدَةَ* العَالِيَةَ' },
    ],
    pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.4, autoInterval: false, endHold: 2.0 },
  };

  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
    ptsFlyerLayout: 'horizontal-cards',
    flyerCreature: 'butterfly',
    flyerFlightSpeed: 0.55,
    flyerTheme: 'dark',
    pointsMarkerType: 'arabic-indic',
    pointsHighlightCurrent: true,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#FF8FB8',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    seed: 909,
    minimalShape: 'arch',
  };

  const probeCtx = createMockCanvasContextForChat();
  const plan = buildHorizontalCardsFlyerPlan(probeCtx, content, baseCustom, sz);

  // 1) Unrevealed text is NEVER drawn before its line sweep starts, and Arabic words stay intact (never per-character)
  const card0 = plan.cards[0];
  const card2 = plan.cards[2];
  assert.ok(card0.lineReveals.length >= 1);
  const badgeHoverT = card0.badgeHoverStart + 0.02;
  assert.equal(getHorizontalLineRevealEdgeX(card0.lineReveals[0], badgeHoverT).revealed, false);

  const drawnDuringBadgeHover: string[] = [];
  const hoverCtx = createMockCanvasContextForChat();
  const origHoverFill = hoverCtx.fillText.bind(hoverCtx);
  hoverCtx.fillText = (text: string, x: number, y: number, maxW?: number) => {
    drawnDuringBadgeHover.push(text);
    return origHoverFill(text, x, y, maxW);
  };
  renderQuoteFrame(hoverCtx, badgeHoverT, content, timeline, baseCustom, sz);
  for (const w of card0.layout.words) {
    assert.equal(
      drawnDuringBadgeHover.includes(w.text),
      false,
      `Card 0 word "${w.text}" must remain hidden while creature hovers over badge`
    );
  }

  const drawnTextsEarly: string[] = [];
  const earlyCtx = createMockCanvasContextForChat();
  const origFillText = earlyCtx.fillText.bind(earlyCtx);
  earlyCtx.fillText = (text: string, x: number, y: number, maxW?: number) => {
    drawnTextsEarly.push(text);
    return origFillText(text, x, y, maxW);
  };
  renderQuoteFrame(earlyCtx, card0.sched.startTime + 0.35, content, timeline, baseCustom, sz);

  // Card 2 has not started yet -> none of card 2's words may be drawn
  for (const w of card2.layout.words) {
    assert.equal(
      drawnTextsEarly.includes(w.text),
      false,
      `Unrevealed card 2 word "${w.text}" must not be drawn while creature is on card 0`
    );
  }
  // Drawn Arabic letter words are multi-character intact words (never split per-character)
  const arabicWordsDrawn = drawnTextsEarly.filter((txt) => /[\u0621-\u064A]/.test(txt));
  assert.ok(arabicWordsDrawn.length > 0, 'Must draw Arabic words on revealed card');
  for (const aw of arabicWordsDrawn) {
    assert.ok(aw.length >= 2, `Arabic word "${aw}" must stay connected, never 1-character split`);
  }

  // 2) Keyword circling & no glyph width change: word.scaleMultiplier === 1 and fontSize === plan.fontSize
  assert.ok(plan.calmFlight.trailDotCount <= 24, 'Calm trail must have N <= 24 dots');
  for (const card of plan.cards) {
    for (const w of card.layout.words) {
      assert.equal(w.scaleMultiplier, 1, 'Keywords must not change glyph width/scale');
      assert.equal(w.fontSize, plan.fontSize, 'Keyword fontSize must match body fontSize');
    }
    assert.ok(card.keywordTimes.length >= 1, `Card ${card.index} must schedule keyword switch time`);
    const stop = plan.calmFlight.stops[card.index];
    assert.ok(stop && stop.keywords && stop.keywords.length >= 1, `Card ${card.index} must schedule a gentle ~0.8 s keyword circle`);
    const kwTarget = stop.keywords![0];
    assert.ok(kwTarget.duration >= 0.75 && kwTarget.duration <= 0.95, 'Keyword circle duration must be ~0.8 s');
    const boostedSamples = plan.calmFlight.samples.filter(
      (s) => s.t >= kwTarget.startTime && s.t <= kwTarget.startTime + kwTarget.duration && s.hoverBoost >= 0.55
    );
    assert.ok(boostedSamples.length >= 4, `Card ${card.index} must smoothly boost/circle around keyword`);
  }

  // 3) GREEN background: zero shadowBlur anywhere, hard 2px border, no glow
  let maxGreenShadowBlur = 0;
  const greenLineWidths = new Set<number>();
  const greenCtx = createMockCanvasContextForChat();
  let gShadow = 0;
  let gLineW = 1;
  Object.defineProperty(greenCtx, 'shadowBlur', {
    get: () => gShadow,
    set: (v: number) => {
      gShadow = v;
      if (v > maxGreenShadowBlur) maxGreenShadowBlur = v;
    },
    configurable: true,
  });
  Object.defineProperty(greenCtx, 'lineWidth', {
    get: () => gLineW,
    set: (v: number) => {
      gLineW = v;
      greenLineWidths.add(v);
    },
    configurable: true,
  });
  renderQuoteFrame(
    greenCtx,
    card0.sched.startTime + 0.65,
    content,
    timeline,
    { ...baseCustom, backgroundMode: 'green', greenScreen: true },
    sz
  );
  assert.equal(maxGreenShadowBlur, 0, 'GREEN mode must have zero shadowBlur (no glow)');
  assert.ok(greenLineWidths.has(2), 'GREEN mode must draw hard 2px card border');

  // 4) BLACK background: outlined bright cards, NO dark card fills
  const blackFills = new Set<string>();
  const blackCtx = createMockCanvasContextForChat();
  let bFill: unknown = '#000000';
  Object.defineProperty(blackCtx, 'fillStyle', {
    get: () => bFill,
    set: (v: unknown) => {
      bFill = v;
      if (typeof v === 'string') blackFills.add(v.toUpperCase());
    },
    configurable: true,
  });
  renderQuoteFrame(
    blackCtx,
    card0.sched.startTime + 0.65,
    content,
    timeline,
    { ...baseCustom, backgroundMode: 'black', greenScreen: false },
    sz
  );
  assert.equal(blackFills.has('#0F172A'), false, 'BLACK mode must not draw dark card fills');
  assert.equal(blackFills.has('#162033'), false, 'BLACK mode must not draw dark card fills');
  assert.ok(blackFills.has('#FFFFFF'), 'BLACK mode must draw bright white text');

  // 5) All 4 creatures + dark & light themes + all marker types render cleanly
  const creatures: FlyerCreatureId[] = ['orb', 'butterfly', 'bat', 'firefly'];
  const markerTypes = ['arabic-indic', 'western', 'bullets', 'checks', 'none'] as const;
  for (const creature of creatures) {
    for (const theme of ['dark', 'light'] as const) {
      for (const marker of markerTypes) {
        renderQuoteFrame(
          probeCtx,
          card0.sched.startTime + 0.55,
          content,
          timeline,
          {
            ...baseCustom,
            flyerCreature: creature,
            flyerTheme: theme,
            pointsMarkerType: marker,
            flyerFlightSpeed: creature === 'bat' ? 0.35 : 0.85,
          },
          sz
        );
      }
    }
  }

  // 6) Preset & JSON serialization round-trip preserves ptsFlyerLayout
  const serialized = JSON.stringify({
    ptsFlyerLayout: baseCustom.ptsFlyerLayout,
    customization: baseCustom,
  });
  const parsed = JSON.parse(serialized) as {
    ptsFlyerLayout?: string;
    customization: StyleCustomization;
  };
  assert.equal(resolvePointsFlyerLayout(parsed.customization), 'horizontal-cards');
  assert.equal(parsed.ptsFlyerLayout, 'horizontal-cards');
});

test('Branching Points: quick-paste parser, sanitization, limits, position boxes, schedule, and export filenames', () => {
  // 1) Quick-paste parsing: first line = root, unindented = branches, '-' or indented = subs, empty lines ignored
  const pasted = [
    '',
    'النجاح الحقيقي',
    '',
    'التخطيط *الذكي*',
    '- تحديد الأهداف بوضوح',
    '  متابعة التقدم يومياً',
    '',
    'التنفيذ المستمر',
    '- خطوات صغيرة ثابتة',
    '',
    'التعلم الدائم',
    '',
  ].join('\n');
  const parsed = parseQuickPasteBranchTree(pasted);
  assert.equal(parsed.root, 'النجاح الحقيقي');
  assert.equal(parsed.branches.length, 3);
  assert.equal(parsed.branches[0].text, 'التخطيط *الذكي*');
  assert.equal(parsed.branches[0].subs.length, 2);
  assert.equal(parsed.branches[0].subs[0].text, 'تحديد الأهداف بوضوح');
  assert.equal(parsed.branches[0].subs[1].text, 'متابعة التقدم يومياً');
  assert.equal(parsed.branches[1].subs.length, 1);
  assert.equal(parsed.branches[2].subs.length, 0);

  // 2) Caps at max 6 branches, max 4 subs per branch, max 24 total nodes (1 root + branches + subs)
  const overfilled: BranchTreeData = {
    root: 'جذر رئيسي',
    branches: Array.from({ length: 8 }, (_, bIdx) => ({
      id: `b-${bIdx}`,
      text: `فرع ${bIdx + 1}`,
      subs: Array.from({ length: 6 }, (_, sIdx) => ({
        id: `s-${bIdx}-${sIdx}`,
        text: `نقطة فرعية ${bIdx + 1}-${sIdx + 1}`,
      })),
    })),
  };
  const sanitized = sanitizeBranchTree(overfilled);
  assert.ok(sanitized.branches.length <= MAX_BRANCH_BRANCHES);
  const stats = countBranchStats(sanitized);
  assert.ok(
    stats.totalNodes <= MAX_BRANCH_TOTAL_NODES,
    `Total nodes ${stats.totalNodes} must be <= ${MAX_BRANCH_TOTAL_NODES}`
  );
  for (const br of sanitized.branches) {
    assert.ok(br.subs.length <= MAX_BRANCH_SUBS);
  }

  // 3) Soft Arabic warnings trigger on long root/branch/sub texts
  const warningStats = countBranchStats({
    root: 'هذا نص جذر طويل جداً يتجاوز ست كلمات بكثير',
    branches: [
      {
        id: 'b1',
        text: 'فرع أول طويل يتجاوز ثماني كلمات بشكل واضح جداً هنا',
        subs: [
          {
            id: 's1',
            text: 'نقطة فرعية طويلة جداً تتجاوز عشر كلمات متواصلة لاختبار التحذير العربي المرن',
          },
        ],
      },
      { id: 'b2', text: 'فرع ثاني', subs: [] },
    ],
  });
  assert.ok(
    warningStats.warnings.length >= 3,
    'Should emit Arabic soft warnings for long root, branch, and sub'
  );

  // 4) Position boxes: center ~80%x84%, left/right ~44%x84%, fullscreen = 6% safe margin; 9:16 disables left/right
  const sz16 = getRenderSize('16:9', '1080p');
  const center16 = getBranchPositionBox('center', '16:9', sz16.width, sz16.height);
  assert.ok(Math.abs(center16.boxWidth / sz16.width - 0.8) < 0.02);
  assert.ok(Math.abs(center16.boxHeight / sz16.height - 0.84) < 0.02);

  const right16 = getBranchPositionBox('right', '16:9', sz16.width, sz16.height);
  assert.equal(right16.effectivePosition, 'right');
  assert.ok(Math.abs(right16.boxWidth / sz16.width - 0.44) < 0.02);

  const full16 = getBranchPositionBox('fullscreen', '16:9', sz16.width, sz16.height);
  assert.ok(Math.abs(full16.boxWidth / sz16.width - 0.88) < 0.02);

  const sz9 = getRenderSize('9:16', '1080p');
  const left9 = getBranchPositionBox('left', '9:16', sz9.width, sz9.height);
  assert.equal(left9.effectivePosition, 'center', '9:16 must fall back left/right to center');

  // 5) Schedule: intro 0.6s, exit 0.6s, at least 0.8s full-tree visibility (auto-extends hold with Arabic note)
  const shortHoldSched = computeBranchSchedule(DEFAULT_BRANCH_DATA, {
    ...DEFAULT_BRANCH_TIMING,
    endHold: 0.3,
  });
  assert.equal(shortHoldSched.introDuration, 0.6);
  assert.equal(shortHoldSched.exitDuration, 0.6);
  assert.ok(shortHoldSched.exitStart - shortHoldSched.fullTreeVisibleStart >= 0.8);
  assert.equal(shortHoldSched.holdExtended, true);
  assert.ok(shortHoldSched.extendedReasonAr && shortHoldSched.extendedReasonAr.length > 0);

  // 6) Green-screen color sanitization replaces green hues with safe non-green hues
  const replacedGreen = sanitizeBranchColorForGreen('#22C55E', 0, true);
  assert.equal(
    isGreenishColor(replacedGreen),
    false,
    `Sanitized color ${replacedGreen} must not be green`
  );
  assert.equal(sanitizeBranchColorForGreen('#22C55E', 0, false), '#22C55E');

  // 7) Export filename pattern: branch-{style}-{bg}-{position}-{res}.mp4 (+ -{creature} for br_flyer)
  const baseCustom: StyleCustomization = {
    mode: 'branch',
    styleId: 'br_metro',
    branchStyleId: 'br_metro',
    accentColor: '#38BDF8',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    format: '16:9',
    position: 'center',
    greenScreen: false,
    backgroundMode: 'black',
    seed: 1,
    minimalShape: 'arch',
    branchData: DEFAULT_BRANCH_DATA,
    branchTiming: DEFAULT_BRANCH_TIMING,
    branchLayout: 'auto',
    branchHighlightCurrent: true,
    branchCamera: 'auto',
  };
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'branch-br_metro-black-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseCustom,
        styleId: 'br_flyer',
        branchStyleId: 'br_flyer',
        flyerCreature: 'firefly',
        backgroundMode: 'style',
      },
      '1080p',
      'mp4'
    ),
    'branch-br_flyer-firefly-style-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      { ...baseCustom, styleId: 'br_tree', branchStyleId: 'br_tree', backgroundMode: 'green' },
      '1440p',
      'png'
    ),
    'branch-br_tree-green-center-1440p.png'
  );

  // 8) Style registry metadata, 4-style grid & removed-style fallback to br_flyer
  assert.equal(BRANCH_STYLES_LIST.length, 4);
  assert.deepEqual(
    BRANCH_STYLES_LIST.map((s) => s.id),
    ['br_flyer', 'br_metro', 'br_neural', 'br_tree']
  );
  assert.equal(resolveBranchStyleId('br_mindmap'), 'br_flyer');
  assert.equal(resolveBranchStyleId('br_terminal'), 'br_flyer');
  assert.equal(resolveBranchStyleId('unknown_style'), 'br_flyer');
  assert.equal(
    resolveActiveStyleId({
      ...baseCustom,
      styleId: 'br_mindmap' as unknown as StyleCustomization['styleId'],
      branchStyleId: 'br_mindmap' as unknown as BranchStyleId,
    }),
    'br_flyer'
  );
  assert.equal(
    resolveActiveStyleId({
      ...baseCustom,
      styleId: 'br_terminal' as unknown as StyleCustomization['styleId'],
      branchStyleId: 'br_terminal' as unknown as BranchStyleId,
    }),
    'br_flyer'
  );
  assert.equal(Boolean(getStyleMetadata('br_tree').hideBranchLayoutSelector), false);
  assert.deepEqual(getStyleMetadata('br_tree').supportedBranchLayouts, [
    'auto',
    'radial',
    'horizontal',
    'vertical',
  ]);
  assert.equal(getStyleMetadata('br_tree').recommendedBackground, 'green');
});

test('Branching Points: SFX graph schedules nodeHit sounds cleanly without throwing (no key-clicks in branching mode)', () => {
  const ctx = createMockCanvasContextForChat();
  const sz16 = getRenderSize('16:9', '1080p');
  const custom: StyleCustomization = {
    mode: 'branch',
    styleId: 'br_metro',
    branchStyleId: 'br_metro',
    accentColor: '#38BDF8',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    format: '16:9',
    position: 'center',
    greenScreen: false,
    backgroundMode: 'style',
    seed: 1,
    minimalShape: 'arch',
    branchData: DEFAULT_BRANCH_DATA,
    branchTiming: DEFAULT_BRANCH_TIMING,
    branchLayout: 'auto',
    branchHighlightCurrent: true,
    branchCamera: 'auto',
  };
  const sfxSettings = {
    enabled: true,
    type: 'whoosh' as const,
    offset: 0,
    keywordHit: true,
    nodeHit: true,
    volume: 0.7,
  };
  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
  };
  const baseTimeline = { enterDuration: 0.6, holdDuration: 2, exitDuration: 0.6, autoHold: false };
  const eff = getEffectiveTimeline(
    baseTimeline,
    content.quoteText,
    'branch',
    0,
    getTypingConfigForCustomization(custom)
  );
  assert.ok(eff.total > 3.0);
  const events = getSceneEventTimes(ctx, content, baseTimeline, custom, sz16);
  assert.equal(typeof events.rootTime, 'number');
  assert.ok(Array.isArray(events.branchTimes) && events.branchTimes.length === 3);
  assert.ok(Array.isArray(events.subTimes) && events.subTimes.length === 3);
  assert.equal(events.nodeSfxStyle, 'pop');

  // Verify br_flyer has chime, and all 4 branching styles only emit 'pop' or 'chime' (never 'key-clicks')
  assert.equal(
    getSceneEventTimes(
      ctx,
      content,
      baseTimeline,
      { ...custom, styleId: 'br_flyer', branchStyleId: 'br_flyer' },
      sz16
    ).nodeSfxStyle,
    'chime'
  );
  for (const st of BRANCH_STYLES_LIST) {
    const ev = getSceneEventTimes(
      ctx,
      content,
      baseTimeline,
      { ...custom, styleId: st.id, branchStyleId: st.id as BranchStyleId },
      sz16
    );
    assert.ok(ev.nodeSfxStyle === 'pop' || ev.nodeSfxStyle === 'chime');
  }

  // Verify switching creature OR calm speed in br_flyer NEVER changes schedule timing
  const orbEvents = getSceneEventTimes(
    ctx,
    content,
    baseTimeline,
    { ...custom, styleId: 'br_flyer', branchStyleId: 'br_flyer', flyerCreature: 'orb', flyerFlightSpeed: 0.4 },
    sz16
  );
  const batEvents = getSceneEventTimes(
    ctx,
    content,
    baseTimeline,
    { ...custom, styleId: 'br_flyer', branchStyleId: 'br_flyer', flyerCreature: 'bat', flyerFlightSpeed: 1.4 },
    sz16
  );
  assert.deepEqual(orbEvents.branchTimes, batEvents.branchTimes);
  assert.deepEqual(orbEvents.subTimes, batEvents.subTimes);
  assert.equal(orbEvents.rootTime, batEvents.rootTime);

  // OfflineAudioContext mock for buildSfxGraph
  const createdOscillators: number[] = [];
  const makeNode = () => ({
    connect: () => undefined,
    gain: {
      value: 1,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
    frequency: {
      value: 440,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
    Q: { value: 1, setValueAtTime: () => undefined },
    type: 'sine',
    start: () => undefined,
    stop: () => undefined,
  });
  const fakeAudioCtx = {
    sampleRate: 44100,
    currentTime: 0,
    destination: makeNode(),
    createGain: () => makeNode(),
    createOscillator: () => {
      createdOscillators.push(1);
      return makeNode();
    },
    createBiquadFilter: () => makeNode(),
    createBuffer: (_c: number, len: number) => ({
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      ...makeNode(),
      buffer: null,
    }),
    createConvolver: () => ({
      ...makeNode(),
      buffer: null,
    }),
    createWaveShaper: () => ({
      ...makeNode(),
      curve: null,
    }),
  } as unknown as BaseAudioContext;

  buildSfxGraph(fakeAudioCtx, sfxSettings, events, 1042, 0);
  assert.ok(
    createdOscillators.length > 0,
    'SFX graph should synthesize node hit sounds when nodeHit is enabled'
  );
});

test('Calm Creature Flight (br_flyer & pts_flyer horizontal-cards): speed/accel bounds, decoupled text reveal, unrevealed clearance, no return-to-root hops, and defaults', () => {
  // 1) Calm speed resolver & style gating (default 0.60, range 0.4-1.4)
  assert.equal(DEFAULT_CALM_FLYER_SPEED, 0.6);
  assert.equal(resolveCalmFlyerSpeed({} as StyleCustomization), 0.6);
  assert.equal(resolveCalmFlyerSpeed({ flyerFlightSpeed: 0.1 } as StyleCustomization), 0.4);
  assert.equal(resolveCalmFlyerSpeed({ flyerFlightSpeed: 2.5 } as StyleCustomization), 1.4);
  assert.equal(resolveCalmFlyerSpeed({ flyerFlightSpeed: 0.7 } as StyleCustomization), 0.7);

  assert.equal(
    isCalmFlyerStyle({ mode: 'branch', styleId: 'br_flyer', branchStyleId: 'br_flyer' } as StyleCustomization),
    true
  );
  assert.equal(
    isCalmFlyerStyle({
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      ptsFlyerLayout: 'horizontal-cards',
    } as StyleCustomization),
    true
  );
  assert.equal(
    isCalmFlyerStyle({
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      ptsFlyerLayout: 'vertical',
    } as StyleCustomization),
    false
  );
  assert.equal(
    isCalmFlyerStyle({ mode: 'phrase', styleId: 'phrase_flyer', phraseStyleId: 'phrase_flyer' } as StyleCustomization),
    false
  );

  const ctx = createMockCanvasContextForChat();
  const sz16 = getRenderSize('16:9', '1080p');

  // 2) br_flyer CalmFlightPlan verification across calm speed range
  for (const calmSpeed of [0.4, 0.7, 1.4]) {
    const brCustom: StyleCustomization = {
      mode: 'branch',
      styleId: 'br_flyer',
      branchStyleId: 'br_flyer',
      accentColor: '#6FA8FF',
      keywordColor: '#FDE047',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      format: '16:9',
      position: 'center',
      greenScreen: false,
      backgroundMode: 'style',
      seed: 42,
      minimalShape: 'arch',
      branchData: DEFAULT_BRANCH_DATA,
      branchTiming: DEFAULT_BRANCH_TIMING,
      branchLayout: 'auto',
      branchHighlightCurrent: true,
      branchCamera: 'auto',
      flyerCreature: 'butterfly',
      flyerFlightSpeed: calmSpeed,
    };
    const treePlan = buildBranchTreeLayout({
      ctx,
      custom: brCustom,
      size: sz16,
      styleId: 'br_flyer',
      allowedArabicFonts: ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic'],
      defaultArabicFont: 'Cairo',
      defaultEnglishFont: 'Plus Jakarta Sans',
    });
    const calmPlan = buildBrFlyerCalmFlightPlan(treePlan, brCustom, sz16.baseWidth, sz16.baseHeight);

    // Return-to-root hops skipped: 'root' appears strictly once at index 0
    const rootStops = calmPlan.stops.filter((s) => s.id === 'root');
    assert.equal(rootStops.length, 1, 'br_flyer must skip return-to-root hops');
    assert.equal(calmPlan.stops[0].id, 'root');
    assert.ok(calmPlan.trailDotCount <= 24, 'br_flyer trail must stay N <= 24');

    // Keep >= 0.8 s of full visibility before exitStart
    const lastStop = calmPlan.stops[calmPlan.stops.length - 1];
    assert.ok(
      treePlan.schedule.exitStart - lastStop.textRevealEnd >= 0.79,
      `br_flyer must keep >= 0.8s full visibility at end (got ${treePlan.schedule.exitStart - lastStop.textRevealEnd})`
    );

    // Speed, acceleration, bounds, determinism, and unrevealed-text clearance
    const maxExpectedSpeed = calmPlan.maxSpeedPxPerSec + 5;
    for (let i = 0; i < calmPlan.samples.length; i++) {
      const s = calmPlan.samples[i];
      const spd = Math.hypot(s.vx, s.vy);
      assert.ok(
        spd <= maxExpectedSpeed,
        `br_flyer speed ${spd.toFixed(1)} exceeded calm limit ${maxExpectedSpeed.toFixed(1)} at t=${s.t.toFixed(2)}`
      );
      assert.ok(
        s.x >= 30 && s.x <= sz16.baseWidth - 30 && s.y >= 26 && s.y <= sz16.baseHeight - 26,
        `br_flyer creature out of safe bounds at t=${s.t.toFixed(2)}`
      );

      // Must not cover any currently unrevealed text box
      for (const stop of calmPlan.stops) {
        if (s.t < stop.textRevealEnd) {
          const insideText =
            s.x > stop.textBox.x + 1 &&
            s.x < stop.textBox.x + stop.textBox.w - 1 &&
            s.y > stop.textBox.y + 1 &&
            s.y < stop.textBox.y + stop.textBox.h - 1;
          assert.equal(
            insideText,
            false,
            `br_flyer creature covered unrevealed text of ${stop.id} at t=${s.t.toFixed(2)}`
          );
        }
      }
    }

    // Pure deterministic evaluation of sampleCalmFlight(plan, t)
    const stA = sampleCalmFlight(calmPlan, 1.75);
    const stB = sampleCalmFlight(calmPlan, 1.75);
    assert.deepEqual(stA, stB);
  }

  // 3) pts_flyer horizontal-cards: schedule decoupled from calm speed, speed bounded, >= 0.8 s end hold
  const ptsContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'خطة *هادئة*',
    pointsItems: [
      { id: 'c1', text: 'تحديد *الأولويات* اليومية بوضوح' },
      { id: 'c2', text: 'تنفيذ الخطوات *الأساسية* بهدوء' },
      { id: 'c3', text: 'مراجعة النتائج وتطوير *الأداء*' },
      { id: 'c4', text: 'الاستمرارية تصنع *الفارق* الكبير' },
    ],
    pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.4, autoInterval: false, endHold: 2.0 },
  };
  const makePtsCustom = (speed: number): StyleCustomization => ({
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
    ptsFlyerLayout: 'horizontal-cards',
    flyerCreature: 'firefly',
    flyerFlightSpeed: speed,
    flyerTheme: 'dark',
    pointsMarkerType: 'arabic-indic',
    pointsHighlightCurrent: true,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#FFE066',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    seed: 55,
    minimalShape: 'arch',
  });

  const planSlow = buildHorizontalCardsFlyerPlan(ctx, ptsContent, makePtsCustom(0.4), sz16);
  const planFast = buildHorizontalCardsFlyerPlan(ctx, ptsContent, makePtsCustom(1.4), sz16);

  // Schedule & line reveal windows are decoupled from calm creature speed
  assert.equal(planSlow.schedule.totalDuration, planFast.schedule.totalDuration);
  assert.deepEqual(
    planSlow.cards.map((c) => c.lineReveals.map((l) => [l.startT, l.endT])),
    planFast.cards.map((c) => c.lineReveals.map((l) => [l.startT, l.endT]))
  );

  // At least 0.8 s of full visibility before exitStart
  const lastCardStop = planSlow.calmFlight.stops[planSlow.calmFlight.stops.length - 1];
  assert.ok(
    planSlow.schedule.exitStart - lastCardStop.textRevealEnd >= 0.79,
    'pts_flyer horizontal cards must keep >= 0.8s full visibility before exit'
  );

  // Speed limit & unrevealed text clearance on horizontal cards
  for (const s of planSlow.calmFlight.samples) {
    assert.ok(Math.hypot(s.vx, s.vy) <= planSlow.calmFlight.maxSpeedPxPerSec + 5);
    for (const stop of planSlow.calmFlight.stops) {
      if (s.t < stop.textRevealEnd) {
        const inside =
          s.x > stop.textBox.x + 1 &&
          s.x < stop.textBox.x + stop.textBox.w - 1 &&
          s.y > stop.textBox.y + 1 &&
          s.y < stop.textBox.y + stop.textBox.h - 1;
        assert.equal(inside, false, `Horizontal-cards creature covered unrevealed text at t=${s.t.toFixed(2)}`);
      }
    }
  }
});

test('Branching Points: all 4 styles, br_metro palettes, br_tree 3 full non-green themes, br_neural constellation, formats, positions, backgrounds & stress scenarios', () => {
  const scenarios: { name: string; tree: BranchTreeData }[] = [
    {
      name: '1-root-2-short-branches',
      tree: {
        root: 'التركيز',
        branches: [
          { id: 'b1', text: 'الهدوء', subs: [] },
          { id: 'b2', text: 'الإنجاز', subs: [] },
        ],
      },
    },
    {
      name: '2-4-branches-x-2-subs',
      tree: {
        root: 'خطة *النمو*',
        branches: [
          {
            id: 'b1',
            text: 'التعلم',
            subs: [
              { id: 's1', text: 'قراءة يومية' },
              { id: 's2', text: 'تطبيق عملي' },
            ],
          },
          {
            id: 'b2',
            text: 'التنظيم',
            subs: [
              { id: 's3', text: 'جدول أسبوعي' },
              { id: 's4', text: 'مراجعة مسائية' },
            ],
          },
          {
            id: 'b3',
            text: 'الصحة',
            subs: [
              { id: 's5', text: 'نوم كافٍ' },
              { id: 's6', text: 'مشي يومي' },
            ],
          },
          {
            id: 'b4',
            text: 'العلاقات',
            subs: [
              { id: 's7', text: 'تواصل صادق' },
              { id: 's8', text: 'استماع فعّال' },
            ],
          },
        ],
      },
    },
    {
      name: '3-6-branches-x-4-subs-capped-24',
      tree: {
        root: 'منظومة *العمل*',
        branches: Array.from({ length: 6 }, (_, b) => ({
          id: `b-${b}`,
          text: `الركيزة ${b + 1}`,
          subs: Array.from({ length: 4 }, (_, s) => ({
            id: `s-${b}-${s}`,
            text: `تفصيل ${b + 1}.${s + 1}`,
          })),
        })),
      },
    },
    {
      name: '4-long-texts-with-diacritics',
      tree: {
        root: 'إِتْقَانُ الْعَمَلِ الْمُسْتَمِرِّ',
        branches: [
          {
            id: 'b1',
            text: 'تَحْدِيدُ الْأَوْلَوِيَّاتِ بِدِقَّةٍ وَوُضُوحٍ *تَامٍّ*',
            subs: [
              { id: 's1', text: 'تَقْسِيمُ الْمَهَامِّ الْكَبِيرَةِ إِلَى خُطُوَاتٍ صَغِيرَةٍ' },
              { id: 's2', text: 'مُرَاجَعَةُ النَّتَائِجِ فِي نِهَايَةِ كُلِّ أُسْبُوعٍ' },
            ],
          },
          {
            id: 'b2',
            text: 'الِالْتِزَامُ الْيَوْمِيُّ بِالْجَوْدَةِ الْعَالِيَةِ',
            subs: [
              { id: 's3', text: 'تَجَنُّبُ التَّشَتُّتِ وَتَرْكِيزُ الطَّاقَةِ الذِّهْنِيَّةِ' },
            ],
          },
        ],
      },
    },
    {
      name: '5-keyword-breaking-across-two-lines',
      tree: {
        root: 'قوة *العادات اليومية الصغيرة*',
        branches: [
          {
            id: 'b1',
            text: 'بناء *نظام عمل مستدام طويل الأمد* بثبات',
            subs: [{ id: 's1', text: 'تكرار *الخطوات البسيطة كل صباح* بلا انقطاع' }],
          },
          {
            id: 'b2',
            text: 'قياس *التحسن التراكمي الأسبوعي*',
            subs: [],
          },
        ],
      },
    },
    {
      name: '6-mixed-arabic-english-numbers',
      tree: {
        root: 'أداء *AI 2026*',
        branches: [
          {
            id: 'b1',
            text: 'دعم React 19 و TypeScript 5',
            subs: [
              { id: 's1', text: 'تصدير MP4 بدقة 1080p و 30fps' },
              { id: 's2', text: 'سرعة استجابة أقل من 16ms' },
            ],
          },
          {
            id: 'b2',
            text: 'تصميم UI/UX عربي متكامل',
            subs: [{ id: 's3', text: 'نسبة 16:9 و 9:16 بدقة 100%' }],
          },
        ],
      },
    },
    {
      name: '7-branch-with-no-subs',
      tree: {
        root: 'الإبداع',
        branches: [
          { id: 'b1', text: 'فكرة أولى', subs: [{ id: 's1', text: 'تجربة سريعة' }] },
          { id: 'b2', text: 'فرع بلا نقاط فرعية', subs: [] },
          { id: 'b3', text: 'فرع ثالث بلا نقاط', subs: [] },
        ],
      },
    },
    {
      name: '8-empty-items-ignored',
      tree: {
        root: '  الوضوح  ',
        branches: [
          { id: 'b0', text: '   ', subs: [{ id: 's0', text: 'تجاهل' }] },
          {
            id: 'b1',
            text: 'الهدف *الأول*',
            subs: [
              { id: 's1', text: '' },
              { id: 's2', text: 'خطوة حقيقية' },
            ],
          },
          { id: 'b2', text: 'الهدف الثاني', subs: [{ id: 's3', text: '   ' }] },
        ],
      },
    },
  ];

  const ctx = createMockCanvasContextForChat();
  const styles: BranchStyleId[] = ['br_flyer', 'br_metro', 'br_neural', 'br_tree'];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
  };
  const baseTimeline = { enterDuration: 0.6, holdDuration: 2, exitDuration: 0.6, autoHold: false };

  // A) Verify layout engine produces zero overlap & zero overflow on standard & dense scenarios
  for (const format of formats) {
    const sz = getRenderSize(format, '1080p');
    const positions: PhrasePosition[] =
      format === '16:9' ? ['center', 'right', 'left', 'fullscreen'] : ['center', 'fullscreen'];
    for (const position of positions) {
      for (const scenario of scenarios) {
        const custom: StyleCustomization = {
          mode: 'branch',
          styleId: 'br_neural',
          branchStyleId: 'br_neural',
          accentColor: '#38BDF8',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format,
          position,
          greenScreen: false,
          backgroundMode: 'style',
          seed: 7,
          minimalShape: 'arch',
          branchData: scenario.tree,
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: 'auto',
          branchHighlightCurrent: true,
          branchCamera: 'auto',
        };
        const plan = buildBranchTreeLayout({
          ctx,
          custom,
          size: sz,
          styleId: 'br_neural',
          allowedArabicFonts: ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic'],
          defaultArabicFont: 'Cairo',
          defaultEnglishFont: 'Inter',
        });
        assert.equal(
          plan.hasOverlap,
          false,
          `Overlap detected in ${scenario.name} (${format}, ${position})`
        );
        assert.equal(
          plan.hasOverflow,
          false,
          `Overflow detected in ${scenario.name} (${format}, ${position})`
        );
        assert.ok(plan.root.w > 0 && plan.root.h > 0);
        assert.ok(plan.branches.length >= 1);
      }
    }
  }

  // Verify auto layout resolver choices
  const sz16 = getRenderSize('16:9', '1080p');
  const sz9 = getRenderSize('9:16', '1080p');
  assert.equal(
    resolveEffectiveBranchLayout(
      'auto',
      '16:9',
      getBranchPositionBox('center', '16:9', sz16.width, sz16.height)
    ),
    'radial'
  );
  assert.equal(
    resolveEffectiveBranchLayout(
      'auto',
      '16:9',
      getBranchPositionBox('right', '16:9', sz16.width, sz16.height)
    ),
    'horizontal'
  );
  assert.equal(
    resolveEffectiveBranchLayout(
      'auto',
      '9:16',
      getBranchPositionBox('center', '9:16', sz9.width, sz9.height)
    ),
    'vertical'
  );

  // B) Verify br_metro palettes, br_tree non-green themes, and br_neural hues
  assert.deepEqual(METRO_NEON_PALETTE, ['#22D3EE', '#A78BFA', '#F472B6', '#FBBF24', '#FB923C', '#5EEAD4']);
  assert.equal(METRO_PASTEL_PALETTE.length, 6);
  assert.equal(resolveBranchMetroPalette({} as StyleCustomization), 'neon');
  assert.equal(resolveBranchMetroPalette({ branchMetroPalette: 'pastel' } as StyleCustomization), 'pastel');
  assert.equal(resolveBranchMetroPalette({ branchMetroPalette: 'duotone' } as StyleCustomization), 'duotone');
  for (const palette of ['neon', 'pastel', 'duotone'] as const) {
    const greenSafeColors = getMetroLineColors(palette, '#22C55E', true, false);
    assert.equal(greenSafeColors.length, 6);
    for (let bi = 0; bi < greenSafeColors.length; bi++) {
      assert.equal(
        isGreenishColor(greenSafeColors[bi]),
        false,
        `br_metro ${palette} line ${bi} in GREEN mode must never be greenish (${greenSafeColors[bi]})`
      );
    }
  }

  // br_tree: zero green foliage in any of the 3 themes + backwards-compatible theme resolution
  assert.equal(resolveBranchTreeTheme({} as StyleCustomization), 'spring');
  assert.equal(resolveBranchTreeTheme({ branchLeafPalette: 'autumn' } as StyleCustomization), 'autumn');
  assert.equal(resolveBranchTreeTheme({ branchLeafPalette: 'night' } as StyleCustomization), 'night');
  assert.equal(
    resolveBranchTreeTheme({ branchTreeTheme: 'night', branchLeafPalette: 'spring' } as StyleCustomization),
    'night'
  );
  for (const themeKey of ['spring', 'autumn', 'night'] as const) {
    const spec = TREE_THEMES[themeKey];
    for (const c of [...spec.blossomColors, ...spec.blackBlossomColors]) {
      assert.equal(
        isGreenishColor(c),
        false,
        `br_tree theme "${themeKey}" foliage color ${c} must NEVER be green`
      );
    }
  }
  assert.deepEqual(NEURAL_BRANCH_HUES, ['#6FD3FF', '#B79CFF', '#FF8FB8', '#FFC857', '#FF8A6B', '#BFE3FF']);

  // C) Render every style x format x supported position x supported background across scenarios
  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs: BackgroundMode[] = meta.supportedBackgrounds || ['style', 'green', 'black'];

    for (const format of formats) {
      const sz = getRenderSize(format, '1080p');
      const positions: PhrasePosition[] =
        format === '16:9' ? ['center', 'right', 'left', 'fullscreen'] : ['center', 'fullscreen'];

      for (const bg of supportedBgs) {
        for (const position of positions) {
          const scenario =
            scenarios[(styles.indexOf(styleId) + positions.indexOf(position)) % scenarios.length];
          const custom: StyleCustomization = {
            mode: 'branch',
            styleId,
            branchStyleId: styleId,
            accentColor: '#38BDF8',
            keywordColor: '#FDE047',
            quoteFontOverride: '',
            authorFontOverride: '',
            fontSizeMultiplier: 1,
            format,
            position,
            greenScreen: bg === 'green',
            backgroundMode: bg,
            seed: 13,
            minimalShape: 'arch',
            branchData: scenario.tree,
            branchTiming: DEFAULT_BRANCH_TIMING,
            branchLayout: 'auto',
            branchHighlightCurrent: true,
            branchCamera: 'auto',
            branchTreeTheme: 'spring',
            branchMetroPalette: 'neon',
            flyerCreature: 'butterfly',
            flyerFlightSpeed: 0.7,
            flyerTheme: 'dark',
          };
          const eff = getEffectiveTimeline(
            baseTimeline,
            content.quoteText,
            'branch',
            0,
            getTypingConfigForCustomization(custom)
          );
          const total = eff.total;
          const events = getSceneEventTimes(ctx, content, baseTimeline, custom, sz);
          assert.ok(events.branchTimes && events.branchTimes.length > 0);

          const sampleTimes = [0.25, total * 0.45, total - 0.9, total - 0.2];
          for (const t of sampleTimes) {
            renderQuoteFrame(ctx, t, content, baseTimeline, custom, sz);
          }
        }
      }
    }

    // D) Verify GREEN mode zero shadowBlur & flat #00FF00 background for every style
    if (supportedBgs.includes('green')) {
      let maxGreenShadowBlur = 0;
      const greenFills = new Set<string>();
      const greenCtx = createMockCanvasContextForChat();
      let gShadow = 0;
      let gFill: unknown = '';
      Object.defineProperty(greenCtx, 'shadowBlur', {
        get: () => gShadow,
        set: (v: number) => {
          gShadow = v;
          if (v > maxGreenShadowBlur) maxGreenShadowBlur = v;
        },
        configurable: true,
      });
      Object.defineProperty(greenCtx, 'fillStyle', {
        get: () => gFill,
        set: (v: unknown) => {
          gFill = v;
          if (typeof v === 'string') greenFills.add(v.toUpperCase());
        },
        configurable: true,
      });

      const greenCustom: StyleCustomization = {
        mode: 'branch',
        styleId,
        branchStyleId: styleId,
        accentColor: '#22C55E', // Intentionally green to ensure styles sanitize/avoid green clash
        keywordColor: '#FDE047',
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1,
        format: '16:9',
        position: 'center',
        greenScreen: true,
        backgroundMode: 'green',
        seed: 21,
        minimalShape: 'arch',
        branchData: scenarios[1].tree,
        branchTiming: DEFAULT_BRANCH_TIMING,
        branchLayout: 'auto',
        branchHighlightCurrent: true,
        branchCamera: 'auto',
        branchTreeTheme: 'autumn',
        branchMetroPalette: 'duotone',
        flyerCreature: 'orb',
        flyerFlightSpeed: 0.7,
      };
      const eff = getEffectiveTimeline(
        baseTimeline,
        content.quoteText,
        'branch',
        0,
        getTypingConfigForCustomization(greenCustom)
      );
      const total = eff.total;
      renderQuoteFrame(greenCtx, total * 0.55, content, baseTimeline, greenCustom, sz16);
      assert.equal(
        maxGreenShadowBlur,
        0,
        `Style ${styleId} in GREEN mode must have zero shadowBlur (got ${maxGreenShadowBlur})`
      );
      assert.ok(
        greenFills.has('#00FF00'),
        `Style ${styleId} in GREEN mode must fill flat #00FF00 chroma background`
      );
    }
  }

  // E) Exercise all creatures on br_flyer, all 3 palettes on br_metro, all 3 themes on br_tree, and all 3 layouts on br_neural
  for (const creature of ['orb', 'butterfly', 'bat', 'firefly'] as FlyerCreatureId[]) {
    for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
      renderQuoteFrame(
        ctx,
        3.2,
        content,
        baseTimeline,
        {
          mode: 'branch',
          styleId: 'br_flyer',
          branchStyleId: 'br_flyer',
          accentColor: '#A855F7',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: '16:9',
          position: 'center',
          greenScreen: bg === 'green',
          backgroundMode: bg,
          seed: 33,
          minimalShape: 'arch',
          branchData: scenarios[4].tree, // 2-line keywords
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: 'auto',
          branchHighlightCurrent: true,
          branchCamera: 'auto',
          flyerCreature: creature,
          flyerFlightSpeed: 0.7,
        },
        sz16
      );
    }
  }

  for (const metroPalette of ['neon', 'pastel', 'duotone'] as const) {
    for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
      renderQuoteFrame(
        ctx,
        3.5,
        content,
        baseTimeline,
        {
          mode: 'branch',
          styleId: 'br_metro',
          branchStyleId: 'br_metro',
          accentColor: '#22D3EE',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: '16:9',
          position: 'center',
          greenScreen: bg === 'green',
          backgroundMode: bg,
          seed: 34,
          minimalShape: 'arch',
          branchData: scenarios[2].tree, // 6 branches x 4 subs capped at 24
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: 'auto',
          branchHighlightCurrent: true,
          branchCamera: 'auto',
          branchMetroPalette: metroPalette,
        },
        sz16
      );
    }
  }

  for (const treeTheme of ['spring', 'autumn', 'night'] as const) {
    for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
      renderQuoteFrame(
        ctx,
        3.5,
        content,
        baseTimeline,
        {
          mode: 'branch',
          styleId: 'br_tree',
          branchStyleId: 'br_tree',
          accentColor: '#FB923C',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: '16:9',
          position: 'fullscreen',
          greenScreen: bg === 'green',
          backgroundMode: bg,
          seed: 35,
          minimalShape: 'arch',
          branchData: scenarios[3].tree, // long Arabic text with diacritics
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: 'auto',
          branchHighlightCurrent: true,
          branchCamera: 'auto',
          branchTreeTheme: treeTheme,
        },
        sz16
      );
    }
  }

  for (const brLayout of ['auto', 'radial', 'horizontal', 'vertical'] as const) {
    renderQuoteFrame(
      ctx,
      3.5,
      content,
      baseTimeline,
      {
        mode: 'branch',
        styleId: 'br_tree',
        branchStyleId: 'br_tree',
        accentColor: '#FF9EC4',
        keywordColor: '#EC4899',
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1,
        format: '16:9',
        position: 'center',
        greenScreen: false,
        backgroundMode: 'style',
        seed: 35,
        minimalShape: 'arch',
        branchData: scenarios[0].tree,
        branchTiming: DEFAULT_BRANCH_TIMING,
        branchLayout: brLayout,
        branchHighlightCurrent: true,
        branchCamera: 'follow',
        branchTreeTheme: 'night-spring',
      },
      sz16
    );
  }

  for (const brLayout of ['radial', 'horizontal', 'vertical'] as const) {
    for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
      renderQuoteFrame(
        ctx,
        3.5,
        content,
        baseTimeline,
        {
          mode: 'branch',
          styleId: 'br_neural',
          branchStyleId: 'br_neural',
          accentColor: '#6FD3FF',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: brLayout === 'vertical' ? '9:16' : '16:9',
          position: 'center',
          greenScreen: bg === 'green',
          backgroundMode: bg,
          seed: 36,
          minimalShape: 'arch',
          branchData: scenarios[2].tree,
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: brLayout,
          branchHighlightCurrent: true,
          branchCamera: 'auto',
        },
        brLayout === 'vertical' ? sz9 : sz16
      );
    }
  }

  // F) Preset & JSON serialization round-trip preserves new fields + backwards-compatible fallbacks
  const presetPayload = {
    mode: 'branch' as const,
    branchStyleId: 'br_metro' as const,
    branchData: scenarios[1].tree,
    branchTiming: { branchInterval: 1.8, subInterval: 0.5, endHold: 2.5 },
    branchLayout: 'horizontal' as const,
    branchHighlightCurrent: false,
    branchCamera: 'follow' as const,
    branchTreeTheme: 'night' as const,
    branchMetroPalette: 'pastel' as const,
    flyerFlightSpeed: 0.7,
  };
  const roundTrip = JSON.parse(JSON.stringify(presetPayload)) as typeof presetPayload;
  assert.deepEqual(roundTrip, presetPayload);

  // Legacy preset referencing removed style & branchLeafPalette migrates cleanly
  const legacyPreset = JSON.parse(
    JSON.stringify({
      mode: 'branch',
      styleId: 'br_mindmap',
      branchStyleId: 'br_terminal',
      branchLeafPalette: 'autumn',
    })
  ) as { styleId: string; branchStyleId: string; branchLeafPalette: 'autumn' };
  assert.equal(resolveBranchStyleId(legacyPreset.styleId), 'br_flyer');
  assert.equal(resolveBranchStyleId(legacyPreset.branchStyleId), 'br_flyer');
  assert.equal(
    resolveBranchTreeTheme({ branchLeafPalette: legacyPreset.branchLeafPalette } as StyleCustomization),
    'autumn'
  );
});

test('Branching Camera: default follow mode, 1.1-1.8x zoom, branch+subs cluster framing without mid-reveal pull-back, end-only pull-back >= 1.5s, 6% safe margin, and 3/6 branches x 2/4 subs across formats/positions/backgrounds', () => {
  // 1) Defaults and zoom clamping
  assert.equal(DEFAULT_BRANCH_CAMERA, 'follow');
  assert.equal(DEFAULT_BRANCH_CAMERA_ZOOM, 1.4);
  assert.equal(resolveBranchCameraMode({} as StyleCustomization), 'follow');
  assert.equal(resolveBranchCameraMode({ branchCamera: 'auto' } as StyleCustomization), 'auto');
  assert.equal(resolveBranchCameraMode({ branchCamera: 'off' } as StyleCustomization), 'off');
  assert.equal(resolveBranchCameraZoom({} as StyleCustomization), 1.4);
  assert.equal(resolveBranchCameraZoom({ branchCameraZoom: 0.5 } as StyleCustomization), 1.1);
  assert.equal(resolveBranchCameraZoom({ branchCameraZoom: 2.5 } as StyleCustomization), 1.8);
  assert.equal(resolveBranchCameraZoom({ branchCameraZoom: 1.65 } as StyleCustomization), 1.65);

  const ctx = createMockCanvasContextForChat();
  const baseTimeline: TimelineConfig = {
    enterDuration: 0.6,
    holdDuration: 2.0,
    exitDuration: 0.6,
    autoHold: false,
  };

  const makeBranchTree = (branchCount: number, subCount: number): BranchTreeData => ({
    root: 'استراتيجية *التميّز*',
    branches: Array.from({ length: branchCount }, (_, bi) => ({
      id: `br-${bi + 1}`,
      text: `المسار الرئيسي ${bi + 1} للتطوير`,
      subs: Array.from({ length: subCount }, (_, si) => ({
        id: `br-${bi + 1}-s-${si + 1}`,
        text: `خطوة عملية *مهمة* رقم ${si + 1}`,
      })),
    })),
  });

  const trees = [
    { name: '3x2', tree: makeBranchTree(3, 2) },
    { name: '3x4', tree: makeBranchTree(3, 4) },
    { name: '6x2', tree: makeBranchTree(6, 2) },
    { name: '6x4', tree: makeBranchTree(6, 4) },
  ];

  // 2) Verify short endHold auto-extends when camera is active so full view stays >= 1.5s
  const shortHoldSched = computeBranchSchedule(
    trees[0].tree,
    { branchInterval: 1.4, subInterval: 0.6, endHold: 1.0 },
    { cameraActive: true }
  );
  assert.ok(shortHoldSched.pullBackStart !== undefined && shortHoldSched.pullBackEnd !== undefined);
  assert.equal(shortHoldSched.holdExtended, true);
  assert.ok(shortHoldSched.extendedReasonAr && shortHoldSched.extendedReasonAr.length > 10);
  assert.ok(shortHoldSched.pullBackStart! >= shortHoldSched.lastNodeSettledTime + 0.59);
  assert.ok(shortHoldSched.pullBackEnd! >= shortHoldSched.pullBackStart! + 0.99);
  assert.ok(
    shortHoldSched.exitStart - shortHoldSched.pullBackEnd! >= 1.49,
    `Full view end hold must be >= 1.5s (got ${shortHoldSched.exitStart - shortHoldSched.pullBackEnd!})`
  );

  // 3) Verify cluster focus, zero mid-reveal pull-back, end-only pull-back, and 6% safe-margin containment
  const sz16 = getRenderSize('16:9', '1080p');
  const sz9 = getRenderSize('9:16', '1080p');

  for (const { name, tree } of trees) {
    for (const fmt of ['16:9', '9:16'] as const) {
      const sz = fmt === '16:9' ? sz16 : sz9;
      const positions = fmt === '16:9' ? (['center', 'right', 'left', 'fullscreen'] as const) : (['center', 'fullscreen'] as const);
      for (const pos of positions) {
        const custom: StyleCustomization = {
          mode: 'branch',
          styleId: 'br_metro',
          branchStyleId: 'br_metro',
          accentColor: '#22D3EE',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1.0,
          format: fmt,
          position: pos,
          backgroundMode: 'style',
          greenScreen: false,
          seed: 77,
          minimalShape: 'arch',
          branchData: tree,
          branchTiming: { branchInterval: 1.4, subInterval: 0.5, endHold: 2.0 },
          branchLayout: 'auto',
          branchCamera: 'follow',
          branchCameraZoom: 1.5,
          branchHighlightCurrent: true,
        };

        const plan = buildBranchTreeLayout({
          ctx,
          custom,
          size: sz,
          styleId: 'br_metro',
          allowedArabicFonts: ['Cairo', 'Readex Pro', 'IBM Plex Sans Arabic'],
          defaultArabicFont: 'Cairo',
          defaultEnglishFont: 'Plus Jakarta Sans',
        });

        assert.equal(plan.cameraEnabled, true, `Camera must be active in follow mode (${name}, ${fmt}, ${pos})`);
        const safeLeft = sz.baseWidth * 0.06;
        const safeRight = sz.baseWidth * 0.94;
        const safeTop = sz.baseHeight * 0.06;
        const safeBottom = sz.baseHeight * 0.94;

        // Check every branch cluster while its sub-points appear:
        // Camera must stay focused on that branch cluster and NEVER pull back to full view mid-reveal
        const pullStart = plan.schedule.pullBackStart ?? plan.schedule.lastNodeSettledTime + 0.6;
        const pullEnd = plan.schedule.pullBackEnd ?? pullStart + 1.0;

        for (let bi = 0; bi < plan.branches.length; bi++) {
          const brNode = plan.branches[bi];
          const subNodes = plan.subs[bi] || [];
          const clusterNodes = [brNode, ...subNodes];
          const settleT = subNodes.length > 0 ? subNodes[subNodes.length - 1].popTime + 0.15 : brNode.connectorStart + 0.95;
          const nextStart = bi + 1 < plan.branches.length ? plan.branches[bi + 1].connectorStart : pullStart;
          const probeT = Math.min(settleT, nextStart - 0.05);

          const cam = sampleBranchCamera(plan, probeT);
          assert.equal(cam.active, true);
          // Pure determinism
          assert.deepEqual(cam, sampleBranchCamera(plan, probeT));

          // Verify cluster nodes are inside the 6% safe frame under this camera transform
          for (const nd of clusterNodes) {
            const sx1 = cam.viewportCenterX + (nd.x - cam.focusX) * cam.scale;
            const sy1 = cam.viewportCenterY + (nd.y - cam.focusY) * cam.scale;
            const sx2 = cam.viewportCenterX + (nd.x + nd.w - cam.focusX) * cam.scale;
            const sy2 = cam.viewportCenterY + (nd.y + nd.h - cam.focusY) * cam.scale;
            assert.ok(
              sx1 >= safeLeft - 8 && sx2 <= safeRight + 8 && sy1 >= safeTop - 8 && sy2 <= safeBottom + 8,
              `Cluster node ${nd.id} cut off or outside 6% margin in ${name}/${fmt}/${pos}: [${sx1.toFixed(1)},${sy1.toFixed(1)}..${sx2.toFixed(1)},${sy2.toFixed(1)}]`
            );
          }
        }

        // After pullBackEnd, camera reaches full-view wide shot and holds until exitStart
        const camBeforePull = sampleBranchCamera(plan, pullStart - 0.02);
        const camAfterPull = sampleBranchCamera(plan, pullEnd + 0.1);
        const camNearExit = sampleBranchCamera(plan, plan.schedule.exitStart - 0.05);
        assert.ok(camAfterPull.scale <= camBeforePull.scale + 0.01, 'End pull-back must ease out to wide full view');
        assert.ok(Math.abs(camAfterPull.scale - camNearExit.scale) < 0.01, 'Full view must stay steady during end hold');
      }
    }
  }

  // 4) Render across all 4 branching styles & backgrounds with camera follow active (zero crash, zero green shadowBlur)
  const content: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    branchData: trees[1].tree,
    branchTiming: DEFAULT_BRANCH_TIMING,
  };
  for (const styleId of ['br_flyer', 'br_metro', 'br_neural', 'br_tree'] as const) {
    for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
      const custom: StyleCustomization = {
        mode: 'branch',
        styleId,
        branchStyleId: styleId,
        accentColor: '#6FA8FF',
        keywordColor: '#FDE047',
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1,
        format: '16:9',
        position: 'center',
        backgroundMode: bg,
        greenScreen: bg === 'green',
        seed: 91,
        minimalShape: 'arch',
        branchData: trees[1].tree,
        branchTiming: DEFAULT_BRANCH_TIMING,
        branchCamera: 'follow',
        branchCameraZoom: 1.45,
        branchTreeTheme: 'night-spring',
      };
      renderQuoteFrame(ctx, 2.5, content, baseTimeline, custom, sz16);
    }
  }
});

test('Creature Keeps Up (br_flyer + pts_flyer horizontal cards): schedule-driven hops arrive right on reveal across all 4 creatures and tight/wide intervals', () => {
  const ctx = createMockCanvasContextForChat();
  const sz16 = getRenderSize('16:9', '1080p');
  const sz9 = getRenderSize('9:16', '1080p');

  // 1) br_flyer across all 4 creatures, tight & comfortable intervals, both formats
  for (const fmt of ['16:9', '9:16'] as const) {
    const sz = fmt === '16:9' ? sz16 : sz9;
    for (const creature of ['orb', 'butterfly', 'bat', 'firefly'] as FlyerCreatureId[]) {
      const custom: StyleCustomization = {
        mode: 'branch',
        styleId: 'br_flyer',
        branchStyleId: 'br_flyer',
        accentColor: '#6FA8FF',
        keywordColor: '#FDE047',
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1,
        format: fmt,
        position: 'center',
        backgroundMode: 'style',
        greenScreen: false,
        seed: 108,
        minimalShape: 'arch',
        branchData: DEFAULT_BRANCH_DATA,
        branchTiming: { branchInterval: 1.2, subInterval: 0.5, endHold: 2.0 },
        branchLayout: 'auto',
        branchCamera: 'follow',
        branchCameraZoom: 1.4,
        flyerCreature: creature,
        flyerFlightSpeed: DEFAULT_CALM_FLYER_SPEED,
      };
      const treePlan = buildBranchTreeLayout({
        ctx,
        custom,
        size: sz,
        styleId: 'br_flyer',
        allowedArabicFonts: ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic'],
        defaultArabicFont: 'Cairo',
        defaultEnglishFont: 'Plus Jakarta Sans',
      });
      const calmPlan = buildBrFlyerCalmFlightPlan(treePlan, custom, sz.baseWidth, sz.baseHeight);
      assert.equal(calmPlan.hops.length, calmPlan.stops.length - 1);

      for (const hop of calmPlan.hops) {
        const targetStop = calmPlan.stops[hop.toIdx];
        const expectedArrive = targetStop.textRevealStart ?? targetStop.activeStart;
        assert.ok(
          Math.abs(hop.endT - expectedArrive) <= 0.05,
          `br_flyer hop to ${targetStop.id} must arrive right at textRevealStart (${expectedArrive.toFixed(2)}, got ${hop.endT.toFixed(2)})`
        );
        // Creature position at arrival must be close to target stop (never lagging far behind)
        const stAtArrive = sampleCalmFlight(calmPlan, hop.endT);
        const distToAnchor = Math.hypot(
          stAtArrive.x - targetStop.anchor.x,
          stAtArrive.y - targetStop.anchor.y
        );
        const maxLagDist = Math.max(targetStop.nodeBox.w, targetStop.nodeBox.h) * 1.15 + 90;
        assert.ok(
          distToAnchor <= maxLagDist,
          `br_flyer (${creature}, ${fmt}) lagged behind ${targetStop.id} at arrival: dist=${distToAnchor.toFixed(1)} > ${maxLagDist.toFixed(1)}`
        );
      }
    }
  }

  // 2) pts_flyer horizontal cards across 3, 5, 8 items
  const ptsContent: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    pointsTitle: 'محاور *التميز*',
    pointsItems: Array.from({ length: 5 }, (_, i) => ({
      id: `hc-${i + 1}`,
      text: `النقطة *الأساسية* رقم ${i + 1} في العرض`,
    })),
    pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.3, autoInterval: false, endHold: 2.0 },
  };
  const hcCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
    ptsFlyerLayout: 'horizontal-cards',
    flyerCreature: 'firefly',
    flyerFlightSpeed: DEFAULT_CALM_FLYER_SPEED,
    pointsCamera: 'follow',
    pointsCameraZoom: 1.3,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#FFC857',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    seed: 109,
    minimalShape: 'arch',
  };
  const hcPlan = buildHorizontalCardsFlyerPlan(ctx, ptsContent, hcCustom, sz16);
  assert.equal(hcPlan.calmFlight.hops.length, hcPlan.cards.length - 1);
  for (const hop of hcPlan.calmFlight.hops) {
    const targetStop = hcPlan.calmFlight.stops[hop.toIdx];
    const prevStop = hcPlan.calmFlight.stops[hop.fromIdx];
    const expectedArrive = targetStop.textRevealStart ?? targetStop.activeStart;
    assert.ok(
      Math.abs(hop.endT - expectedArrive) <= 0.05,
      `Horizontal cards hop must arrive right at text reveal (${expectedArrive.toFixed(2)}, got ${hop.endT.toFixed(2)})`
    );
    // Early seamless departure: hop begins before previous card finishes revealing so it glides slowly (>= 0.85s)
    assert.ok(
      hop.startT < prevStop.textRevealEnd && hop.hopDuration >= 0.85,
      `Horizontal cards hop ${hop.fromIdx}->${hop.toIdx} should depart early for a calm glide (start=${hop.startT.toFixed(2)}, prevEnd=${prevStop.textRevealEnd.toFixed(2)}, dur=${hop.hopDuration.toFixed(2)})`
    );
    const st = sampleCalmFlight(hcPlan.calmFlight, hop.endT);
    const dist = Math.hypot(st.x - targetStop.anchor.x, st.y - targetStop.anchor.y);
    const maxLag = Math.max(targetStop.nodeBox.w, targetStop.nodeBox.h) * 1.1 + 90;
    assert.ok(dist <= maxLag, `Horizontal cards creature lagged behind card ${hop.toIdx}: dist=${dist.toFixed(1)}`);
  }
  // Strict poetic speed cap: even across wide row wraps, creature never rockets past ~680 px/s at default calm speed
  const peakHcSpeed = hcPlan.calmFlight.samples.reduce(
    (mx, s) => Math.max(mx, Math.hypot(s.vx, s.vy)),
    0
  );
  assert.ok(
    peakHcSpeed <= 695,
    `Horizontal cards peak speed should remain poetic and calm (got ${peakHcSpeed.toFixed(1)} px/s)`
  );

  // Genuine Cubic Bézier curvature: card-to-card hops visibly curve away from the straight chord
  for (const hop of hcPlan.calmFlight.hops) {
    const p0 = hcPlan.calmFlight.stops[hop.fromIdx].anchor;
    const p1 = hcPlan.calmFlight.stops[hop.toIdx].anchor;
    const chordLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (chordLen > 120) {
      let maxPerpDev = 0;
      for (let k = 1; k <= 9; k++) {
        const sampleT = hop.startT + (hop.endT - hop.startT) * (k / 10);
        const st = sampleCalmFlight(hcPlan.calmFlight, sampleT);
        const perpDev =
          Math.abs((p1.y - p0.y) * st.x - (p1.x - p0.x) * st.y + p1.x * p0.y - p1.y * p0.x) /
          chordLen;
        if (perpDev > maxPerpDev) maxPerpDev = perpDev;
      }
      assert.ok(
        maxPerpDev >= 22,
        `Horizontal cards hop ${hop.fromIdx}->${hop.toIdx} should follow a curved Bézier path (maxPerpDev=${maxPerpDev.toFixed(1)}px)`
      );
    }
  }
});

test('br_tree 4th theme "ربيعي ليلي" (night-spring): indigo-to-plum sky, amber lanterns, zero green foliage, zero shadowBlur in green mode, and preset persistence', () => {
  // 1) Theme registry & resolver
  assert.ok(TREE_THEMES['night-spring'], 'TREE_THEMES must include night-spring');
  assert.equal(TREE_THEMES['night-spring'].id, 'night-spring');
  assert.equal(TREE_THEMES['night-spring'].skyStops[0], '#0B1030');
  assert.equal(TREE_THEMES['night-spring'].skyStops[2], '#2A1B4D');
  assert.equal(TREE_THEMES['night-spring'].keywordMode, 'pink-ring-underline');
  assert.equal(resolveBranchTreeTheme('night-spring'), 'night-spring');
  assert.equal(resolveBranchTreeTheme({ branchTreeTheme: 'night-spring' }), 'night-spring');

  // Verify zero greenish palette entries across all 4 br_tree themes
  for (const themeKey of ['spring', 'autumn', 'night', 'night-spring'] as const) {
    const th = TREE_THEMES[themeKey];
    for (const color of [...th.blossomColors, ...th.blackBlossomColors]) {
      assert.equal(
        isGreenishColor(color),
        false,
        `br_tree theme ${themeKey} blossom color ${color} must never be green`
      );
    }
  }

  const baseTimeline: TimelineConfig = {
    enterDuration: 0.6,
    holdDuration: 2.0,
    exitDuration: 0.6,
    autoHold: false,
  };
  const content: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    branchData: DEFAULT_BRANCH_DATA,
    branchTiming: DEFAULT_BRANCH_TIMING,
  };

  // 2) Render all 4 themes across style, green, black and both formats; verify zero shadowBlur & flat amber discs in green mode
  for (const fmt of ['16:9', '9:16'] as const) {
    const sz = getRenderSize(fmt, '1080p');
    for (const theme of ['spring', 'autumn', 'night', 'night-spring'] as const) {
      for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
        let maxBlur = 0;
        const fillColors = new Set<string>();
        const ctx = createMockCanvasContextForChat();
        let curBlur = 0;
        let curFill: unknown = '';
        Object.defineProperty(ctx, 'shadowBlur', {
          get: () => curBlur,
          set: (v: number) => {
            curBlur = v;
            if (v > maxBlur) maxBlur = v;
          },
          configurable: true,
        });
        Object.defineProperty(ctx, 'fillStyle', {
          get: () => curFill,
          set: (v: unknown) => {
            curFill = v;
            if (typeof v === 'string') fillColors.add(v.toUpperCase());
          },
          configurable: true,
        });

        const custom: StyleCustomization = {
          mode: 'branch',
          styleId: 'br_tree',
          branchStyleId: 'br_tree',
          accentColor: '#FFB3D9',
          keywordColor: '#FF9EC4',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: fmt,
          position: 'center',
          backgroundMode: bg,
          greenScreen: bg === 'green',
          seed: 515,
          minimalShape: 'arch',
          branchData: DEFAULT_BRANCH_DATA,
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchCamera: 'follow',
          branchCameraZoom: 1.4,
          branchTreeTheme: theme,
        };

        renderQuoteFrame(ctx, 3.4, content, baseTimeline, custom, sz);

        if (bg === 'green') {
          assert.equal(maxBlur, 0, `br_tree (${theme}, ${fmt}) in GREEN mode must have 0 shadowBlur`);
          assert.ok(fillColors.has('#00FF00'), 'GREEN mode must paint flat #00FF00 chroma background');
          if (theme === 'night-spring') {
            assert.ok(
              fillColors.has('#FFC857'),
              'br_tree night-spring in GREEN mode must draw flat warm amber lantern discs (#FFC857)'
            );
          }
        }
      }
    }
  }
});

test('Multi Points Camera: defaults, pts_ranking disabled, 3/5/8 items across every style & format, focus-per-item without mid-reveal pull-back, end-only pull-back >= 1.5s, 6% safe margin, zero green shadowBlur, and preset persistence', () => {
  // 1) Defaults, zoom bounds, and pts_ranking disabled
  assert.equal(DEFAULT_POINTS_CAMERA, 'off');
  assert.equal(DEFAULT_POINTS_CAMERA_ZOOM, 1.3);
  assert.equal(resolvePointsCameraMode({} as StyleCustomization, 'pts_clean'), 'off');
  assert.equal(resolvePointsCameraMode({ pointsCamera: 'follow' } as StyleCustomization, 'pts_clean'), 'follow');
  assert.equal(resolvePointsCameraMode({ pointsCamera: 'auto' } as StyleCustomization, 'pts_timeline'), 'auto');
  assert.equal(resolvePointsCameraMode({ pointsCamera: 'follow' } as StyleCustomization, 'pts_ranking'), 'off');
  assert.equal(isPointsCameraActive({ pointsCamera: 'follow' }, 'pts_ranking', true), false);
  assert.equal(isPointsCameraActive({ pointsCamera: 'auto' }, 'pts_clean', false), false);
  assert.equal(isPointsCameraActive({ pointsCamera: 'auto' }, 'pts_clean', true), true);
  assert.equal(resolvePointsCameraZoom({} as StyleCustomization), 1.3);
  assert.equal(resolvePointsCameraZoom({ pointsCameraZoom: 0.7 } as StyleCustomization), 1.1);
  assert.equal(resolvePointsCameraZoom({ pointsCameraZoom: 2.2 } as StyleCustomization), 1.6);

  // 2) Points schedule hold extension for camera >= 1.5s full view after pull-back
  const items5: PointsItem[] = Array.from({ length: 5 }, (_, i) => ({
    id: `p-${i + 1}`,
    text: `النقطة *المهمة* رقم ${i + 1} في القائمة`,
  }));
  const camSched = computePointsSchedule(
    'خطوات *النجاح*',
    items5,
    { revealInterval: 1.2, autoInterval: false, endHold: 1.0 },
    'pts_clean',
    { cameraActive: true }
  );
  assert.ok(camSched.pullBackStart !== undefined && camSched.pullBackEnd !== undefined);
  assert.equal(camSched.holdExtended, true);
  assert.ok(camSched.extendedReasonAr && camSched.extendedReasonAr.length > 10);
  assert.ok(camSched.pullBackStart! >= camSched.lastItemRevealEnd + 0.59);
  assert.ok(camSched.pullBackEnd! >= camSched.pullBackStart! + 0.99);
  assert.ok(camSched.exitStart - camSched.pullBackEnd! >= 1.49);

  // 3) Direct samplePointsCamera trajectory & 6% safe-margin containment check
  const vpBox = { x: 192, y: 86, w: 1536, h: 907 };
  const fakeItems = camSched.items.map((it, idx) => ({
    x: 240,
    y: 160 + idx * 145,
    w: 1440,
    h: 118,
    startTime: it.startTime,
    revealEnd: it.revealEnd,
  }));
  const fullBounds = { x: 240, y: 160, w: 1440, h: 5 * 145 };
  for (let i = 0; i < fakeItems.length; i++) {
    const it = fakeItems[i];
    const probeT = i + 1 < fakeItems.length ? Math.min(it.startTime + 0.85, fakeItems[i + 1].startTime - 0.04) : camSched.pullBackStart! - 0.05;
    const cam = samplePointsCamera({
      items: fakeItems,
      fullBounds,
      viewportBox: vpBox,
      frameW: 1920,
      frameH: 1080,
      schedule: camSched,
      zoom: 1.45,
      t: probeT,
      active: true,
    });
    assert.equal(cam.active, true);
    // Item i must be cleanly inside 6% safe frame
    const sx1 = cam.viewportCenterX + (it.x - cam.focusX) * cam.scale;
    const sy1 = cam.viewportCenterY + (it.y - cam.focusY) * cam.scale;
    const sx2 = cam.viewportCenterX + (it.x + it.w - cam.focusX) * cam.scale;
    const sy2 = cam.viewportCenterY + (it.y + it.h - cam.focusY) * cam.scale;
    assert.ok(
      sx1 >= 1920 * 0.06 - 4 &&
        sx2 <= 1920 * 0.94 + 4 &&
        sy1 >= 1080 * 0.06 - 4 &&
        sy2 <= 1080 * 0.94 + 4,
      `Points camera clipped item ${i}: [${sx1.toFixed(1)},${sy1.toFixed(1)}..${sx2.toFixed(1)},${sy2.toFixed(1)}]`
    );
  }
  const camWide = samplePointsCamera({
    items: fakeItems,
    fullBounds,
    viewportBox: vpBox,
    frameW: 1920,
    frameH: 1080,
    schedule: camSched,
    zoom: 1.45,
    t: camSched.pullBackEnd! + 0.2,
    active: true,
  });
  assert.ok(camWide.scale <= 1.01, 'After pullBackEnd Points camera must settle on full list view');

  // 4) Render 3, 5, and 8 items across EVERY Points style (including pts_flyer vertical & horizontal cards), both formats, with camera 'follow'
  const baseTimeline: TimelineConfig = {
    enterDuration: 0.6,
    holdDuration: 2.0,
    exitDuration: 0.6,
    autoHold: false,
  };
  const pointsStyleVariants: { styleId: StyleCustomization['pointsStyleId']; ptsFlyerLayout?: 'vertical' | 'horizontal-cards' }[] = [
    { styleId: 'pts_clean' },
    { styleId: 'pts_timeline' },
    { styleId: 'pts_ranking' },
    { styleId: 'pts_flyer', ptsFlyerLayout: 'vertical' },
    { styleId: 'pts_flyer', ptsFlyerLayout: 'horizontal-cards' },
  ];

  for (const count of [3, 5, 8]) {
    const items: PointsItem[] = Array.from({ length: count }, (_, idx) => ({
      id: `pt-${count}-${idx + 1}`,
      text: `النقطة *الاستراتيجية* رقم ${idx + 1} لتطوير العمل باحترافية`,
    }));
    const content: QuoteContent = {
      quoteText: '',
      authorName: '',
      subtitle: '',
      photoSource: null,
      photoId: 'default',
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      quotationMarks: 'none',
      pointsTitle: `أهم ${count} *مبادئ* للنجاح`,
      pointsItems: items,
      pointsTiming: { revealInterval: 1.1, autoInterval: false, endHold: 2.0 },
    };

    for (const fmt of ['16:9', '9:16'] as const) {
      const sz = getRenderSize(fmt, '1080p');
      for (const variant of pointsStyleVariants) {
        const meta = getStyleMetadata(variant.styleId!);
        const supportedBgs = meta.supportedBackgrounds || ['style', 'green', 'black'];
        const bgList: BackgroundMode[] = supportedBgs.includes('green')
          ? ['style', 'green']
          : ['style', 'black'];

        for (const bg of bgList) {
          let maxBlur = 0;
          const drawnTexts: string[] = [];
          const ctx = createMockCanvasContextForChat();
          let curBlur = 0;
          Object.defineProperty(ctx, 'shadowBlur', {
            get: () => curBlur,
            set: (v: number) => {
              curBlur = v;
              if (v > maxBlur) maxBlur = v;
            },
            configurable: true,
          });
          const origFillText = ctx.fillText.bind(ctx);
          ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
            drawnTexts.push(text);
            return origFillText(text, x, y, maxWidth);
          };

          const custom: StyleCustomization = {
            mode: 'points',
            styleId: variant.styleId!,
            pointsStyleId: variant.styleId!,
            ptsFlyerLayout: variant.ptsFlyerLayout,
            pointsCamera: 'follow',
            pointsCameraZoom: 1.35,
            pointsHighlightCurrent: true,
            pointsMarkerType: meta.defaultMarkerType || 'arabic-indic',
            pointsTitle: content.pointsTitle,
            pointsItems: items,
            pointsTiming: content.pointsTiming,
            accentColor: meta.defaultAccent,
            keywordColor: meta.defaultKeywordColor,
            quoteFontOverride: '',
            authorFontOverride: '',
            fontSizeMultiplier: 1,
            format: fmt,
            position: 'center',
            backgroundMode: bg,
            greenScreen: bg === 'green',
            seed: 404,
            minimalShape: 'arch',
          };

          const ev = getEventTimes({ ctx, content, timeline: baseTimeline, custom, size: sz });
          assert.equal(ev.itemTimes?.length, count, `${variant.styleId} getEventTimes must report ${count} items`);

          const eff = getEffectiveTimeline(
            baseTimeline,
            '',
            'points',
            0,
            getTypingConfigForCustomization(custom)
          );
          // Sample mid-reveal and end-hold frames
          renderQuoteFrame(ctx, eff.total * 0.45, content, baseTimeline, custom, sz);
          renderQuoteFrame(ctx, eff.total - 0.9, content, baseTimeline, custom, sz);

          if (bg === 'green') {
            assert.equal(
              maxBlur,
              0,
              `${variant.styleId} (${variant.ptsFlyerLayout || 'default'}, ${count} items, ${fmt}) must have 0 shadowBlur in GREEN mode with camera follow`
            );
          }

          // Arabic words must remain connected (never split into 1-char Arabic glyphs)
          const arabicDrawn = drawnTexts.filter((s) => /[\u0621-\u064A]/.test(s));
          for (const w of arabicDrawn) {
            assert.ok(w.length >= 2, `Connected Arabic word broken in ${variant.styleId}: "${w}"`);
          }
        }
      }
    }
  }

  // 5) Preset & JSON round-trip persistence for Points camera & Branching camera + night-spring theme
  const fullPreset = {
    pointsCamera: 'follow' as const,
    pointsCameraZoom: 1.45,
    branchCamera: 'follow' as const,
    branchCameraZoom: 1.6,
    branchTreeTheme: 'night-spring' as const,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(fullPreset)), fullPreset);
});

test('Camera screen-edge behavior: no premature inner-box clip in open-frame Points & Branching styles across all positions, preserved inner clip in checklist/terminal, and soft 4.8% edge feather mask', () => {
  const sz16 = getRenderSize('16:9', '1080p');
  const sz9 = getRenderSize('9:16', '1080p');
  const baseTimeline: TimelineConfig = {
    enterDuration: 0.6,
    holdDuration: 2.0,
    exitDuration: 0.6,
    autoHold: false,
  };

  // Spy context that records every rect() immediately followed by clip()
  const makeClipSpyCtx = () => {
    const base = createMockCanvasContextForChat();
    let lastRect: { x: number; y: number; w: number; h: number } | null = null;
    const clippedRects: { x: number; y: number; w: number; h: number }[] = [];
    const origRect = base.rect.bind(base);
    const origClip = base.clip.bind(base);
    base.rect = (x: number, y: number, w: number, h: number) => {
      lastRect = { x, y, w, h };
      origRect(x, y, w, h);
    };
    base.clip = (...args: unknown[]) => {
      if (lastRect) {
        clippedRects.push({ ...lastRect });
        lastRect = null;
      }
      (origClip as (...a: unknown[]) => void)(...args);
    };
    return { ctx: base, clippedRects };
  };

  // Helper: detects a premature camera-viewport inner-box clip (a large box inset from the frame edges)
  const hasPrematureViewportClip = (
    rects: { x: number; y: number; w: number; h: number }[],
    W: number,
    H: number
  ) =>
    rects.some(
      (r) =>
        r.w >= W * 0.36 &&
        r.h >= H * 0.6 &&
        (r.x > 10 || r.y > 10 || r.x + r.w < W - 10 || r.y + r.h < H - 10)
    );

  // 1) Open-frame Branching styles: zero premature inner-box clips in center / right / left / fullscreen
  const branchContent: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    branchData: DEFAULT_BRANCH_DATA,
    branchTiming: DEFAULT_BRANCH_TIMING,
  };

  for (const styleId of ['br_flyer', 'br_metro', 'br_neural', 'br_tree'] as const) {
    for (const pos of ['center', 'right', 'left', 'fullscreen'] as const) {
      for (const bg of ['style', 'green', 'black'] as BackgroundMode[]) {
        const { ctx, clippedRects } = makeClipSpyCtx();
        const custom: StyleCustomization = {
          mode: 'branch',
          styleId,
          branchStyleId: styleId,
          accentColor: '#38BDF8',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          format: '16:9',
          position: pos,
          backgroundMode: bg,
          greenScreen: bg === 'green',
          seed: 123,
          minimalShape: 'arch',
          branchData: DEFAULT_BRANCH_DATA,
          branchTiming: DEFAULT_BRANCH_TIMING,
          branchLayout: 'auto',
          branchCamera: 'follow',
          branchCameraZoom: 1.5,
          branchHighlightCurrent: true,
        };
        renderQuoteFrame(ctx, 2.4, branchContent, baseTimeline, custom, sz16);
        assert.equal(
          hasPrematureViewportClip(clippedRects, sz16.baseWidth, sz16.baseHeight),
          false,
          `${styleId} (${pos}, ${bg}) must NOT clip prematurely to an inner viewport box`
        );
      }
    }
  }

  // 2) Open-frame Multi-Points styles: zero premature inner-box clips across center / right / left / fullscreen
  const ptsItems = Array.from({ length: 5 }, (_, i) => ({
    id: `edge-pt-${i}`,
    text: `نقطة *مهمة* رقم ${i + 1} لاختبار حدود الكاميرا`,
  }));
  const ptsContent: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    pointsTitle: 'اختبار الكاميرا',
    pointsItems: ptsItems,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  const openPointsVariants: { styleId: PointsStyleId; ptsFlyerLayout?: 'vertical' | 'horizontal-cards' }[] = [
    { styleId: 'pts_clean' },
    { styleId: 'pts_timeline' },
    { styleId: 'pts_flyer', ptsFlyerLayout: 'vertical' },
    { styleId: 'pts_flyer', ptsFlyerLayout: 'horizontal-cards' },
  ];

  for (const variant of openPointsVariants) {
    for (const pos of ['center', 'right', 'left', 'fullscreen'] as const) {
      const { ctx, clippedRects } = makeClipSpyCtx();
      const custom: StyleCustomization = {
        mode: 'points',
        styleId: variant.styleId,
        pointsStyleId: variant.styleId,
        ptsFlyerLayout: variant.ptsFlyerLayout,
        accentColor: '#38BDF8',
        keywordColor: '#FDE047',
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1,
        format: '16:9',
        position: pos,
        backgroundMode: 'style',
        greenScreen: false,
        seed: 55,
        minimalShape: 'arch',
        pointsTitle: 'اختبار الكاميرا',
        pointsItems: ptsItems,
        pointsTiming: DEFAULT_POINTS_TIMING,
        pointsCamera: 'follow',
        pointsCameraZoom: 1.4,
      };
      renderQuoteFrame(ctx, 2.6, ptsContent, baseTimeline, custom, sz16);
      assert.equal(
        hasPrematureViewportClip(clippedRects, sz16.baseWidth, sz16.baseHeight),
        false,
        `${variant.styleId} (${variant.ptsFlyerLayout || 'default'}, ${pos}) must NOT clip prematurely to an inner viewport box`
      );
    }
  }

  // 4) Verify soft 4-edge screen feather mask uses destination-in strictly outside the 6% safe margin (4.8% < 6%)
  for (const sz of [sz16, sz9]) {
    const stops: number[][] = [];
    const compositeOps: string[] = [];
    const mockLayerCtx = createMockCanvasContextForChat();
    mockLayerCtx.createLinearGradient = () => {
      const gradStops: number[] = [];
      stops.push(gradStops);
      return {
        addColorStop: (offset: number) => {
          gradStops.push(offset);
        },
      } as unknown as CanvasGradient;
    };
    const origFillRect = mockLayerCtx.fillRect.bind(mockLayerCtx);
    mockLayerCtx.fillRect = (x: number, y: number, w: number, h: number) => {
      compositeOps.push(mockLayerCtx.globalCompositeOperation);
      origFillRect(x, y, w, h);
    };

    applyScreenEdgeFeatherMask(
      mockLayerCtx,
      sz.baseWidth,
      sz.baseHeight,
      DEFAULT_CAMERA_EDGE_FEATHER_RATIO
    );

    assert.deepEqual(compositeOps, ['destination-in', 'destination-in']);
    assert.equal(stops.length, 2, 'Must build horizontal + vertical feather gradients');
    // Full-opacity start stop (index 3) must stay strictly inside outer 6% margin so framed content is 100% solid
    const hOpaqueStartPx = stops[0][3] * sz.baseWidth;
    const vOpaqueStartPx = stops[1][3] * sz.baseHeight;
    assert.ok(
      hOpaqueStartPx < sz.baseWidth * 0.06,
      `Horizontal feather (${hOpaqueStartPx.toFixed(1)}px) must stay outside 6% safe margin (${(sz.baseWidth * 0.06).toFixed(1)}px)`
    );
    assert.ok(
      vOpaqueStartPx < sz.baseHeight * 0.06,
      `Vertical feather (${vOpaqueStartPx.toFixed(1)}px) must stay outside 6% safe margin (${(sz.baseHeight * 0.06).toFixed(1)}px)`
    );
  }
});

test('Explicit Cubic Bézier flight paths across ALL Flyer creatures and ALL Flyer styles (phrase_flyer, pts_flyer vertical & horizontal-cards, br_flyer)', () => {
  // 1) Core Cubic Bézier math evaluator & arc-length measurement
  const p0 = { x: 100, y: 400 };
  const c1 = { x: 250, y: 200 };
  const c2 = { x: 550, y: 200 };
  const p3 = { x: 700, y: 400 };
  const startPt = evaluateCubicBezier(p0, c1, c2, p3, 0);
  const midPt = evaluateCubicBezier(p0, c1, c2, p3, 0.5);
  const endPt = evaluateCubicBezier(p0, c1, c2, p3, 1);
  assert.ok(Math.hypot(startPt.x - p0.x, startPt.y - p0.y) < 1e-6);
  assert.ok(Math.hypot(endPt.x - p3.x, endPt.y - p3.y) < 1e-6);
  assert.ok(Math.abs(midPt.x - 400) < 1e-6 && Math.abs(midPt.y - 250) < 1e-6, `Midpoint should lift to y=250 (got ${midPt.y})`);
  assert.ok(Math.abs(startPt.dx - 3 * (c1.x - p0.x)) < 1e-6 && Math.abs(startPt.dy - 3 * (c1.y - p0.y)) < 1e-6);
  const arcLen = measureCubicBezierLength(p0, c1, c2, p3, 16);
  const chordLen = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  assert.ok(arcLen > chordLen * 1.08, `Bézier arc length (${arcLen.toFixed(1)}) must exceed straight chord (${chordLen.toFixed(1)})`);

  // Tangent-to-Bézier conversion preserves exact endpoint velocities
  const seg = computeCubicBezierSegmentFromTangents(
    { x: 10, y: 20 },
    { vx: 120, vy: -90 },
    { x: 210, y: 80 },
    { vx: 90, vy: 60 },
    1.5
  );
  const b0 = evaluateCubicBezier(seg.p0, seg.c1, seg.c2, seg.p3, 0);
  const b1 = evaluateCubicBezier(seg.p0, seg.c1, seg.c2, seg.p3, 1);
  assert.ok(Math.abs(b0.dx / 1.5 - 120) < 1e-6 && Math.abs(b0.dy / 1.5 - -90) < 1e-6);
  assert.ok(Math.abs(b1.dx / 1.5 - 90) < 1e-6 && Math.abs(b1.dy / 1.5 - 60) < 1e-6);

  // Explicit cpOut / cpIn handles on FlightWaypoint override default tangent curvature
  const customWps = [
    { t: 0, x: 100, y: 400, cpOut: { x: 200, y: 180 } },
    { t: 2, x: 700, y: 400, cpIn: { x: 600, y: 180 } },
  ];
  const midExplicit = sampleFlightWaypoints(customWps, 1.0, 2.5, 3.0);
  assert.ok(midExplicit.y < 250, `Explicit Bézier handles must lift waypoint midpoint cleanly above chord (got y=${midExplicit.y.toFixed(1)})`);

  const ctx = createMockCanvasContextForChat();
  const sz = getRenderSize('16:9', '1080p');
  const creatures: FlyerCreatureId[] = ['firefly', 'butterfly', 'bat', 'orb'];

  const ptsContent: QuoteContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none',
    pointsTitle: 'محاور *الإبداع*',
    pointsItems: Array.from({ length: 5 }, (_, i) => ({
      id: `bez-pt-${i + 1}`,
      text: `النقطة *الرقمية* رقم ${i + 1}`,
    })),
    pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.4, autoInterval: false, endHold: 2.0 },
  };

  const phraseContent: QuoteContent = {
    ...ptsContent,
    quoteText: 'الحياة رحلة *جميلة* تتنفس بالهدوء والإلهام',
  };

  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
    ptsFlyerLayout: 'horizontal-cards',
    flyerCreature: 'orb',
    flyerFlightSpeed: DEFAULT_CALM_FLYER_SPEED,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#F472B6',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    seed: 2026,
    minimalShape: 'arch',
  };

  // 2) Verify ALL 4 creatures across pts_flyer (horizontal-cards), br_flyer, pts_flyer (vertical), and phrase_flyer
  for (const creature of creatures) {
    // 2a) pts_flyer horizontal cards: every hop exposes explicit Cubic Bézier control points & visibly curves
    const hcPlan = buildHorizontalCardsFlyerPlan(
      ctx,
      ptsContent,
      { ...baseCustom, mode: 'points', styleId: 'pts_flyer', pointsStyleId: 'pts_flyer', ptsFlyerLayout: 'horizontal-cards', flyerCreature: creature },
      sz
    );
    assert.ok(hcPlan.calmFlight.hops.length >= 4);
    for (const hop of hcPlan.calmFlight.hops) {
      assert.ok(hop.bezier && Number.isFinite(hop.bezier.c1.x) && Number.isFinite(hop.bezier.c2.y), `${creature} horizontal hop must expose explicit Cubic Bézier curve`);
      const chord = Math.hypot(hop.bezier.p3.x - hop.bezier.p0.x, hop.bezier.p3.y - hop.bezier.p0.y);
      const bLen = measureCubicBezierLength(hop.bezier.p0, hop.bezier.c1, hop.bezier.c2, hop.bezier.p3, 12);
      assert.ok(bLen > chord + 4, `${creature} horizontal hop ${hop.fromIdx}->${hop.toIdx} Bézier arc must curve beyond straight chord`);
    }

    // 2b) br_flyer: every hop exposes explicit Cubic Bézier control points & curves beyond straight chord
    const brCustom: StyleCustomization = {
      ...baseCustom,
      mode: 'branch',
      styleId: 'br_flyer',
      branchStyleId: 'br_flyer',
      branchData: DEFAULT_BRANCH_DATA,
      branchTiming: { branchInterval: 1.2, subInterval: 0.5, endHold: 2.0 },
      branchLayout: 'auto',
      flyerCreature: creature,
    };
    const brLayout = buildBranchTreeLayout({
      ctx,
      custom: brCustom,
      size: sz,
      styleId: 'br_flyer',
      allowedArabicFonts: ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic'],
      defaultArabicFont: 'Cairo',
      defaultEnglishFont: 'Plus Jakarta Sans',
    });
    const brPlan = buildBrFlyerCalmFlightPlan(brLayout, brCustom, sz.baseWidth, sz.baseHeight);
    assert.ok(brPlan.hops.length >= 4);
    for (const hop of brPlan.hops) {
      assert.ok(hop.bezier && Number.isFinite(hop.bezier.c1.x) && Number.isFinite(hop.bezier.c2.y), `${creature} br_flyer hop must expose explicit Cubic Bézier curve`);
      const chord = Math.hypot(hop.bezier.p3.x - hop.bezier.p0.x, hop.bezier.p3.y - hop.bezier.p0.y);
      if (chord > 60) {
        const bLen = measureCubicBezierLength(hop.bezier.p0, hop.bezier.c1, hop.bezier.c2, hop.bezier.p3, 12);
        assert.ok(bLen > chord + 2, `${creature} br_flyer hop ${hop.fromIdx}->${hop.toIdx} must curve organically`);
      }
    }

    // 2c) phrase_flyer: sampled Bézier trajectory visibly curves above straight start->end chord
    const phCustom: StyleCustomization = {
      ...baseCustom,
      mode: 'phrase',
      styleId: 'phrase_flyer',
      flyerCreature: creature,
      flyerFlightSpeed: DEFAULT_FLYER_FLIGHT_SPEED,
    };
    const phTimeline: TimelineConfig = {
      enterDuration: 1.8,
      holdDuration: 3.5,
      exitDuration: 0.8,
      autoHold: false,
    };
    const phPlan = buildPhraseFlyerPlan(ctx, phraseContent, phTimeline, phCustom, sz);
    const phStart = sampleFlightWaypoints(phPlan.waypoints, 0.2, phPlan.effective.exitStart, phPlan.effective.total);
    const phEnd = sampleFlightWaypoints(phPlan.waypoints, phPlan.effective.exitStart * 0.7, phPlan.effective.exitStart, phPlan.effective.total);
    const phChord = Math.hypot(phEnd.x - phStart.x, phEnd.y - phStart.y);
    let phMaxDev = 0;
    for (let k = 1; k <= 12; k++) {
      const tk = 0.2 + (phPlan.effective.exitStart * 0.7 - 0.2) * (k / 13);
      const st = sampleFlightWaypoints(phPlan.waypoints, tk, phPlan.effective.exitStart, phPlan.effective.total);
      const dev = phChord > 10
        ? Math.abs((phEnd.y - phStart.y) * st.x - (phEnd.x - phStart.x) * st.y + phEnd.x * phStart.y - phEnd.y * phStart.x) / phChord
        : Math.hypot(st.x - phStart.x, st.y - phStart.y);
      if (dev > phMaxDev) phMaxDev = dev;
    }
    assert.ok(phMaxDev >= 16, `${creature} phrase_flyer must follow a curved Bézier wave (got dev=${phMaxDev.toFixed(1)}px)`);

    // 2d) pts_flyer vertical: sampled Bézier S-wave visibly curves laterally rather than dropping straight down
    const vertCustom: StyleCustomization = {
      ...baseCustom,
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      ptsFlyerLayout: 'vertical',
      flyerCreature: creature,
      flyerFlightSpeed: DEFAULT_FLYER_FLIGHT_SPEED,
    };
    const vertPlan = buildPointsFlyerPlan(ctx, ptsContent, vertCustom, sz);
    const vStart = sampleFlightWaypoints(vertPlan.waypoints, 0.5, vertPlan.schedule.exitStart, vertPlan.schedule.totalDuration);
    const vEnd = sampleFlightWaypoints(vertPlan.waypoints, vertPlan.schedule.exitStart * 0.85, vertPlan.schedule.exitStart, vertPlan.schedule.totalDuration);
    const vChord = Math.hypot(vEnd.x - vStart.x, vEnd.y - vStart.y);
    let vMaxDev = 0;
    for (let k = 1; k <= 14; k++) {
      const tk = 0.5 + (vertPlan.schedule.exitStart * 0.85 - 0.5) * (k / 15);
      const st = sampleFlightWaypoints(vertPlan.waypoints, tk, vertPlan.schedule.exitStart, vertPlan.schedule.totalDuration);
      const dev = vChord > 10
        ? Math.abs((vEnd.y - vStart.y) * st.x - (vEnd.x - vStart.x) * st.y + vEnd.x * vStart.y - vEnd.y * vStart.x) / vChord
        : Math.hypot(st.x - vStart.x, st.y - vStart.y);
      if (dev > vMaxDev) vMaxDev = dev;
    }
    assert.ok(vMaxDev >= 28, `${creature} vertical pts_flyer must follow a curved Bézier S-wave (got dev=${vMaxDev.toFixed(1)}px)`);
  }
});

test('Multiple Items ("عناصر متعددة") extension for Image & Video modes: 5 styles, toggle OFF regression, determinism, safe bounds, edge aspects/videos, Arabic captions, green screen rules, SFX events, filenames, and presets', () => {
  // 1) Registry & limits verification
  assert.equal(MAX_GALLERY_ITEMS, 8);
  assert.equal(MAX_GALLERY_VIDEOS, 4);
  assert.equal(GALLERY_STYLES_LIST.length, 6);
  const expectedGalleryStyles: GalleryStyleId[] = [
    'gal_float',
    'gal_orbit',
    'gal_polaroid',
    'gal_wall',
    'gal_bubbles',
    'gal_circle',
  ];
  assert.deepEqual(
    GALLERY_STYLES_LIST.map((s) => s.id),
    expectedGalleryStyles
  );
  for (const st of GALLERY_STYLES_LIST) {
    assert.equal(st.recommendedBackground, 'green', `${st.id} must recommend green background`);
    assert.deepEqual(
      st.supportedBackgrounds,
      ['style', 'green', 'black'],
      `${st.id} must support style, green, and black background modes`
    );
  }

  // 2) Toggle OFF regression guarantee: Image & Video modes behave identically when galleryEnabled is false
  const baseCustom: StyleCustomization = {
    mode: 'image',
    styleId: 'img_polaroid',
    imageStyleId: 'img_polaroid',
    videoStyleId: 'vid_floating',
    galleryEnabled: false,
    galleryStyleId: 'gal_float',
    format: '16:9',
    position: 'center',
    videoBox: DEFAULT_VIDEO_BOX,
    backgroundMode: 'green',
    greenScreen: true,
    accentColor: '#38BDF8',
    keywordColor: '#FFD166',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
  };
  assert.equal(isGalleryActive(baseCustom), false);
  assert.equal(resolveActiveStyleId(baseCustom), 'img_polaroid');
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'image-img_polaroid-green-center-1080p.mp4'
  );

  const videoOffCustom: StyleCustomization = {
    ...baseCustom,
    mode: 'video',
    styleId: 'vid_floating',
    galleryEnabled: false,
  };
  assert.equal(isGalleryActive(videoOffCustom), false);
  assert.equal(resolveActiveStyleId(videoOffCustom), 'vid_floating');
  assert.equal(
    buildExportFileName(videoOffCustom, '1080p', 'mp4'),
    'video-vid_floating-green-center-1080p.mp4'
  );

  // 3) Toggle ON works identically in BOTH Image and Video modes + filenames match gallery-{style}-{bg}-{position}-{res}.mp4
  for (const hostMode of ['image', 'video'] as const) {
    const galOn: StyleCustomization = {
      ...baseCustom,
      mode: hostMode,
      galleryEnabled: true,
      galleryStyleId: 'gal_orbit',
      position: 'right',
      videoBox: { x: 46, y: 12, w: 48, h: 76 },
      backgroundMode: 'green',
    };
    assert.equal(isGalleryActive(galOn), true);
    assert.equal(resolveActiveStyleId(galOn), 'gal_orbit');
    assert.equal(resolveGalleryStyleId(galOn.galleryStyleId), 'gal_orbit');
    assert.equal(
      buildExportFileName(galOn, '1080p', 'mp4'),
      'gallery-gal_orbit-green-right-1080p.mp4'
    );
    // Non-fullscreen box supports style, green, and black backgrounds
    assert.equal(isGalleryBoxFullscreen(galOn), false);
    assert.equal(resolveGalleryBackground({ ...galOn, backgroundMode: 'style' }), 'style');
    assert.equal(resolveGalleryBackground({ ...galOn, backgroundMode: 'black' }), 'black');
    // Fullscreen box allows 'style' background
    const fullBoxCustom: StyleCustomization = {
      ...galOn,
      position: 'fullscreen',
      videoBox: { x: 0, y: 0, w: 100, h: 100 },
      backgroundMode: 'style',
    };
    assert.equal(isGalleryBoxFullscreen(fullBoxCustom), true);
    assert.equal(resolveGalleryBackground(fullBoxCustom), 'style');
    assert.equal(
      buildExportFileName(fullBoxCustom, '1440p', 'mp4'),
      'gallery-gal_orbit-style-fullscreen-1440p.mp4'
    );
  }

  // 4) Edge-case mixed items (tall photo, wide screenshot, square PNG, rotated phone clip, no-audio clip, long diacritic Arabic captions with multi-line *keyword*)
  const mkMockPoster = (w: number, h: number, greenRatio?: number) =>
    ({
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => {
          const pixels = 36 * 36;
          const data = new Uint8ClampedArray(pixels * 4);
          const greenCount = Math.round(pixels * (greenRatio ?? 0));
          for (let p = 0; p < pixels; p++) {
            const o = p * 4;
            if (p < greenCount) {
              data[o] = 10;
              data[o + 1] = 240;
              data[o + 2] = 20;
              data[o + 3] = 255;
            } else {
              data[o] = 40;
              data[o + 1] = 60;
              data[o + 2] = 180;
              data[o + 3] = 255;
            }
          }
          return { data };
        },
      }),
    }) as unknown as HTMLCanvasElement;

  // Verify green pixel sampling ratio detection (> 8%)
  const origDoc = (globalThis as unknown as { document?: unknown }).document;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => mkMockPoster(36, 36, 0.25),
  };
  const sampledGreenRatio = computeDrawableGreenRatio(mkMockPoster(200, 200, 0.25));
  assert.ok(sampledGreenRatio > 0.08, `Expected green ratio > 0.08, got ${sampledGreenRatio}`);
  if (origDoc === undefined) {
    delete (globalThis as unknown as { document?: unknown }).document;
  } else {
    (globalThis as unknown as { document: unknown }).document = origDoc;
  }

  const edgeItems8: GalleryItemConfig[] = [
    {
      id: 'edge-tall-photo',
      kind: 'image',
      fileName: 'tall.jpg',
      caption: 'لقطة طولية *مُتَمَيِّزَةٌ جِدّاً* بتشكيل عربي كامل',
      fit: 'contain',
      displayWidth: 600,
      displayHeight: 1600,
    },
    {
      id: 'edge-wide-shot',
      kind: 'image',
      fileName: 'wide-ui.png',
      caption: 'تقرير *الأداء التشغيلي المتقدم* للربع الأول 2026',
      fit: 'contain',
      displayWidth: 2560,
      displayHeight: 800,
    },
    {
      id: 'edge-square-png',
      kind: 'image',
      fileName: 'logo.png',
      caption: 'شعار *مُشفَّر*',
      fit: 'contain',
      displayWidth: 1000,
      displayHeight: 1000,
    },
    {
      id: 'edge-vert-clip',
      kind: 'video',
      fileName: 'phone-rot90.mp4',
      caption: 'مقطع *هاتف عمودي* مُدوَّر',
      fit: 'cover',
      displayWidth: 1080,
      displayHeight: 1920,
      duration: 5.5,
      trimIn: 0.4,
      trimOut: 4.8,
      speed: 1.25,
      audioEnabled: false,
      audioVolume: 0.7,
      endBehavior: 'loop',
      hasAudio: true,
      rotation: 90,
    },
    {
      id: 'edge-no-audio-clip',
      kind: 'video',
      fileName: 'silent.mp4',
      caption: 'فيديو *صامت* للتجربة',
      fit: 'contain',
      displayWidth: 1920,
      displayHeight: 1080,
      duration: 4.0,
      trimIn: 0,
      trimOut: 4.0,
      speed: 0.75,
      audioEnabled: false,
      audioVolume: 0.8,
      endBehavior: 'freeze',
      hasAudio: false,
    },
    {
      id: 'edge-video-3',
      kind: 'video',
      fileName: 'clip3.mp4',
      caption: 'عرض *حركي* متزامن',
      fit: 'cover',
      displayWidth: 1280,
      displayHeight: 720,
      duration: 6.0,
      trimIn: 0,
      trimOut: 5.0,
      speed: 1.0,
      audioEnabled: true,
      audioVolume: 0.5,
      endBehavior: 'loop',
      hasAudio: true,
    },
    {
      id: 'edge-video-4',
      kind: 'video',
      fileName: 'clip4.mp4',
      caption: 'المقطع *الرابع* الأخير',
      fit: 'contain',
      displayWidth: 1440,
      displayHeight: 1080,
      duration: 3.5,
      trimIn: 0,
      trimOut: 3.5,
      speed: 1.5,
      audioEnabled: false,
      audioVolume: 0.8,
      endBehavior: 'loop',
      hasAudio: true,
    },
    {
      id: 'edge-green-photo',
      kind: 'image',
      fileName: 'forest.jpg',
      caption: 'مشهد *طبيعي* غني بالتفاصيل العربية المترابطة',
      fit: 'cover',
      displayWidth: 1600,
      displayHeight: 1000,
    },
  ];

  const edgeMediaMap: Record<string, GalleryRuntimeMediaEntry> = {};
  for (const it of edgeItems8) {
    const w = it.displayWidth || 1200;
    const h = it.displayHeight || 800;
    const poster = mkMockPoster(w, h, it.id === 'edge-green-photo' ? 0.3 : 0.01);
    edgeMediaMap[it.id] = {
      id: it.id,
      kind: it.kind,
      poster,
      displayWidth: w,
      displayHeight: h,
      greenPixelRatio: it.id === 'edge-green-photo' ? 0.3 : 0.01,
    };
  }

  // 5) Test all 5 styles × 2 formats × 3 boxes (small, medium, fullscreen) × item counts (1, 3, 5, 8)
  const boxes = [
    { name: 'small', pos: 'top-right' as const, box: { x: 64, y: 10, w: 30, h: 36 } },
    { name: 'medium', pos: 'center' as const, box: { x: 18, y: 14, w: 64, h: 72 } },
    { name: 'fullscreen', pos: 'fullscreen' as const, box: { x: 0, y: 0, w: 100, h: 100 } },
  ];
  const itemCounts = [1, 3, 5, 8];

  for (const format of ['16:9', '9:16'] as const) {
    const size = getRenderSize(format, '1080p');
    for (const bSpec of boxes) {
      for (const count of itemCounts) {
        const subset = edgeItems8.slice(0, count);
        const testCustomBase: StyleCustomization = {
          ...baseCustom,
          mode: 'image',
          galleryEnabled: true,
          format,
          position: bSpec.pos,
          videoBox: bSpec.box,
          galleryItems: subset,
          galleryAppearance: count === 3 ? 'together' : 'stagger',
          galleryInterval: 0.7,
          galleryHighlightCurrent: true,
          galleryFloatIntensity: 1.0,
          galleryEndHold: 3.0,
          galleryItemSfxType: 'chime',
        };

        // Verify schedule + timeline match
        const sched = computeGallerySchedule({
          itemCount: count,
          appearance: testCustomBase.galleryAppearance,
          interval: 0.7,
          endHold: 3.0,
        });
        const eff = getEffectiveTimeline(
          DEFAULT_IMAGE_TIMELINE,
          '',
          'image',
          0.35,
          getTypingConfigForCustomization(testCustomBase)
        );
        assert.equal(eff.total, sched.total, 'Gallery effective timeline must match schedule total');
        assert.equal(sched.itemStarts.length, count);

        // Verify focus weights highlight current item (weight=1) and dim others (weight=0)
        if (count >= 3 && testCustomBase.galleryAppearance === 'stagger') {
          const midT = sched.itemStarts[1] + 0.35;
          const focus = computeGalleryFocusWeights(midT, sched, true, 'gal_float');
          assert.equal(focus.activeIndex, 1);
          assert.equal(focus.weights[1], 1);
          assert.equal(focus.weights[0], 0);
        }

        // Verify deterministic layout + zero box edge collision across float motion cycle
        const boxPx = resolveGalleryBoxPixels(testCustomBase, size);
        for (const styleId of expectedGalleryStyles) {
          const layoutA = computeGalleryLayout({
            items: subset,
            boxX: boxPx.boxX,
            boxY: boxPx.boxY,
            boxWidth: boxPx.boxWidth,
            boxHeight: boxPx.boxHeight,
            format,
            seed: testCustomBase.seed,
            styleId,
            floatIntensity: 1.0,
            highlightEnabled: true,
          });
          const layoutB = computeGalleryLayout({
            items: subset,
            boxX: boxPx.boxX,
            boxY: boxPx.boxY,
            boxWidth: boxPx.boxWidth,
            boxHeight: boxPx.boxHeight,
            format,
            seed: testCustomBase.seed,
            styleId,
            floatIntensity: 1.0,
            highlightEnabled: true,
          });
          assert.deepEqual(layoutA, layoutB, `Layout must be deterministic for ${styleId}`);
          assert.equal(layoutA.slots.length, count);

          // Sample motion at settled time and verify determinism + strictly inside box
          const settledT = sched.lastAppearEnd + 0.4;
          const focusInfo = computeGalleryFocusWeights(settledT, sched, true, styleId);
          for (const slot of layoutA.slots) {
            const item = subset[slot.index];
            const m1 = sampleGalleryItemMotion({
              slot,
              item,
              t: settledT,
              schedule: sched,
              custom: testCustomBase,
              focusWeight: focusInfo.weights[slot.index] ?? 1,
              hasActiveFocus: focusInfo.activeIndex >= 0,
              styleId,
            });
            const m2 = sampleGalleryItemMotion({
              slot,
              item,
              t: settledT,
              schedule: sched,
              custom: testCustomBase,
              focusWeight: focusInfo.weights[slot.index] ?? 1,
              hasActiveFocus: focusInfo.activeIndex >= 0,
              styleId,
            });
            assert.deepEqual(m1, m2, 'Motion must be a pure deterministic function of t');

            assert.ok(
              m1.x - slot.width * 0.5 >= boxPx.boxX - 2,
              `${styleId} item left edge must not exit box (${format}/${bSpec.name}/n=${count})`
            );
            assert.ok(
              m1.x + slot.width * 0.5 <= boxPx.boxX + boxPx.boxWidth + 2,
              `${styleId} item right edge must not exit box (${format}/${bSpec.name}/n=${count})`
            );
            assert.ok(
              m1.y - slot.height * 0.5 >= boxPx.boxY - 2,
              `${styleId} item top edge must not exit box (${format}/${bSpec.name}/n=${count})`
            );
            assert.ok(
              m1.y + slot.height * 0.5 <= boxPx.boxY + boxPx.boxHeight + 2,
              `${styleId} item bottom edge must not exit box (${format}/${bSpec.name}/n=${count})`
            );
          }

          // Render in both green and (when fullscreen) style backgrounds
          const bgsToTest: BackgroundMode[] =
            bSpec.name === 'fullscreen' ? ['style', 'green'] : ['green'];
          for (const bg of bgsToTest) {
            let maxBlur = 0;
            let curBlur = 0;
            const drawnTexts: string[] = [];
            const ctx = createMockCanvasContextForChat();
            const origFillText = ctx.fillText.bind(ctx);
            ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
              drawnTexts.push(String(text));
              return origFillText(text, x, y, maxWidth);
            };
            Object.defineProperty(ctx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const renderCustom: StyleCustomization = {
              ...testCustomBase,
              styleId,
              galleryStyleId: styleId,
              backgroundMode: bg,
              greenScreen: bg === 'green',
            };
            const contentObj = {
              quoteText: '',
              authorName: '',
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              galleryItems: subset,
              galleryMedia: edgeMediaMap,
            };

            const events = getSceneEventTimes(
              ctx,
              contentObj,
              DEFAULT_IMAGE_TIMELINE,
              renderCustom,
              size
            );
            assert.equal(events.enterStart, 0.04);
            assert.equal(events.itemTimes?.length, count);
            assert.equal(events.itemTimes?.[0], 0.6);
            assert.equal(events.itemSfxStyle, 'chime');
            assert.ok(events.keywordTimes.length >= 1, 'Keyword captions must produce keywordTimes');

            // Render entrance, hold, and exit frames
            for (const sampleT of [0.85, sched.lastAppearEnd + 0.5, sched.total - 0.15]) {
              renderQuoteFrame(
                ctx,
                sampleT,
                contentObj,
                DEFAULT_IMAGE_TIMELINE,
                renderCustom,
                size
              );
            }

            if (bg === 'green') {
              assert.equal(
                maxBlur,
                0,
                `${styleId} (${format}/${bSpec.name}/n=${count}) green mode must enforce shadowBlur === 0`
              );
            }

            // Verify Arabic captions are NEVER split into single-letter fragments
            for (const txt of drawnTexts) {
              const trimmed = txt.trim();
              if (/[\u0600-\u06FF]/.test(trimmed)) {
                assert.ok(
                  trimmed.length > 1,
                  `Arabic caption text must never be split into single characters (got "${trimmed}")`
                );
              }
            }
          }
        }
      }
    }
  }

  // 6) Preset JSON serialization check: preserves all gallery settings & metadata, never stores File objects
  const presetPayload = {
    galleryEnabled: true,
    galleryStyleId: 'gal_polaroid' as GalleryStyleId,
    galleryAppearance: 'stagger' as const,
    galleryInterval: 0.9,
    galleryHighlightCurrent: true,
    galleryFloatIntensity: 1.2,
    galleryEndHold: 4.5,
    galleryItemSfxType: 'whoosh' as const,
    galleryItems: edgeItems8.slice(0, 3),
    videoBox: { x: 12, y: 10, w: 76, h: 80 },
    backgroundMode: 'green' as BackgroundMode,
  };
  const roundTripped = JSON.parse(JSON.stringify(presetPayload));
  assert.deepEqual(roundTripped, presetPayload);
  for (const item of roundTripped.galleryItems) {
    assert.equal('file' in item, false, 'Presets must never serialize File objects');
    assert.equal('objectUrl' in item, false, 'Presets must never serialize objectUrl');
  }
});

test('Lifta Swash Fixed Regular and Palestine Regular are registered with Arabic-only labels, available in all 39 styles without exception, calibrated, and render cleanly', () => {
  const expectedEntries: { family: ArabicFontFamily; labelAr: string }[] = [
    { family: 'Lifta Swash Fixed Regular', labelAr: 'لفتا سوش' },
    { family: 'Palestine Regular', labelAr: 'فلسطين' },
  ];

  // 1) Registered in both main and author Arabic font lists with Arabic-only labels
  for (const { family, labelAr } of expectedEntries) {
    const mainEntry = ARABIC_FONTS_LIST.find((f) => f.family === family);
    assert.ok(mainEntry, `ARABIC_FONTS_LIST must include ${family}`);
    assert.equal(mainEntry!.labelAr, labelAr);
    assert.ok(!/[A-Za-z]/.test(mainEntry!.labelAr), `Label for ${family} must be Arabic only`);

    const authorEntry = AUTHOR_ARABIC_FONTS_LIST.find((f) => f.family === family);
    assert.ok(authorEntry, `AUTHOR_ARABIC_FONTS_LIST must include ${family}`);
    assert.equal(authorEntry!.labelAr, labelAr);
  }

  // 2) Included in all 40 styles without exception (including terminal/typewriter styles)
  assert.equal(ALL_STYLES_LIST.length, 40);
  for (const st of ALL_STYLES_LIST) {
    if (st.allowedFonts && st.allowedFonts.length > 0) {
      for (const { family } of expectedEntries) {
        assert.ok(
          st.allowedFonts.includes(family),
          `Style ${st.id} must include ${family} in allowedFonts`
        );
      }
    }
  }

  // 3) Calibration profiles & preferred weight 400 prevent faux-bolding
  const liftaCal = getFontCalibration('Lifta Swash Fixed Regular');
  const palestineCal = getFontCalibration('Palestine Regular');

  assert.equal(liftaCal.preferredWeight, 400);
  assert.ok(liftaCal.sizeScale < 1);
  assert.ok(liftaCal.minLineHeightRatio >= 1.66);
  assert.ok(liftaCal.fallbackChain?.includes('"Reem Kufi"'));

  assert.equal(palestineCal.preferredWeight, 400);
  assert.ok(palestineCal.minLineHeightRatio >= 1.64);
  assert.ok(palestineCal.fallbackChain?.includes('"Aref Ruqaa"'));

  assert.deepEqual(resolveStudioFontSpec('Lifta Swash Fixed Regular', 700), {
    cssFontFamily: 'Lifta Swash Fixed Regular',
    cssFontWeight: 400,
  });
  assert.deepEqual(resolveStudioFontSpec('Palestine Regular', 800), {
    cssFontFamily: 'Palestine Regular',
    cssFontWeight: 400,
  });

  const ctx = createMockCanvasContextForChat();
  applyStudioCanvasTextProps(ctx, 'Lifta Swash Fixed Regular', 700, 48, 'rtl');
  assert.ok(ctx.font.startsWith('400 48px "Lifta Swash Fixed Regular"'));
  assert.ok(ctx.font.includes('"Reem Kufi"'));

  applyStudioCanvasTextProps(ctx, 'Palestine Regular', 800, 48, 'rtl');
  assert.ok(ctx.font.startsWith('400 48px "Palestine Regular"'));
  assert.ok(ctx.font.includes('"Aref Ruqaa"'));

  // 4) Calibrated layout stays within safe box bounds
  for (const { family } of expectedEntries) {
    const layout = layoutArabicQuote(ctx, {
      text: 'نص عربي *جميل* للتجربة مع 2026 Arabic & English داخل الإطار الآمن',
      quotationMarks: 'none',
      fontFamily: family,
      fontWeight: 700,
      minFontSize: 28,
      maxFontSize: 56,
      fontSizeMultiplier: 1.0,
      lineHeightRatio: 1.55,
      boxX: 40,
      boxY: 40,
      boxWidth: 720,
      boxHeight: 420,
      align: 'center',
      direction: 'rtl',
    });
    assert.ok(layout.maxLineWidth <= 720 * 1.03, `${family} maxLineWidth within box`);
    assert.ok(layout.totalHeight <= 420 * 1.05, `${family} totalHeight within box`);
    assert.ok(layout.lineHeightRatio >= 1.66, `${family} lineHeightRatio >= 1.66`);
  }

  // 5) Render sample styles across modes including terminal & typewriter in 16:9 and 9:16
  const sampleStyles = [
    { mode: 'quote' as const, styleId: 'midnight-blue' as const },
    { mode: 'phrase' as const, styleId: 'pixel_terminal' as const },
    { mode: 'phrase' as const, styleId: 'old_typewriter' as const },
    { mode: 'chat' as const, styleId: 'chat_terminal' as const },
    { mode: 'points' as const, styleId: 'pts_clean' as const },
    { mode: 'image' as const, styleId: 'img_polaroid' as const },
  ];

  for (const format of ['16:9', '9:16'] as const) {
    const baseW = format === '16:9' ? 1920 : 1080;
    const baseH = format === '16:9' ? 1080 : 1920;
    for (const { mode, styleId } of sampleStyles) {
      for (const { family } of expectedEntries) {
        const custom: StyleCustomization = {
          mode,
          styleId,
          phraseStyleId: mode === 'phrase' ? styleId : undefined,
          chatStyleId: mode === 'chat' ? styleId : undefined,
          pointsStyleId: mode === 'points' ? styleId : undefined,
          imageStyleId: mode === 'image' ? styleId : undefined,
          format,
          position: 'center',
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#38BDF8',
          keywordColor: '#FFD400',
          quoteFontOverride: family,
          authorFontOverride: family,
          fontSizeMultiplier: 1.0,
          minimalShape: 'circle',
          seed: 42,
        };
        const content: QuoteContent = {
          quoteText: 'كلمات *خالدة* تُكتب بخط عربي أصيل',
          authorName: 'الكاتب',
          subtitle: 'اختبار الخطوط',
          photoSource: null,
          photoId: 'none',
          crop: { zoom: 1, offsetX: 0, offsetY: 0 },
          quotationMarks: 'guillemets',
          imageCaption: 'تعليق *مميز* بالخط الجديد',
        };
        const timeline: TimelineConfig = {
          enterDuration: 2.0,
          holdDuration: 3.0,
          exitDuration: 1.0,
          autoHold: false,
        };
        const renderCtx = createMockCanvasContextForChat();
        assert.doesNotThrow(() => {
          renderQuoteFrame(renderCtx, 1.8, content, timeline, custom, {
            width: baseW,
            height: baseH,
            baseWidth: baseW,
            baseHeight: baseH,
            scale: 1,
          });
        }, `renderQuoteFrame must succeed for ${styleId} (${format}) with ${family}`);
      }
    }
  }
});

test('Gallery 6th style "دائرة دوّارة" (gal_circle): look, circular geometry, double orbit, continuous & step motion, focus highlight, Arabic hub captions with diacritics & multi-line keywords, green screen rules, filenames, events, and presets', () => {
  // 1) Registry placement (6th & last card) and metadata
  assert.equal(GALLERY_STYLES_LIST[GALLERY_STYLES_LIST.length - 1].id, 'gal_circle');
  assert.equal(GAL_CIRCLE_CONFIG.id, 'gal_circle');
  assert.equal(GAL_CIRCLE_CONFIG.nameAr, 'دائرة دوّارة');
  assert.deepEqual(GAL_CIRCLE_CONFIG.supportedBackgrounds, ['style', 'green', 'black']);
  assert.equal(GAL_CIRCLE_CONFIG.recommendedBackground, 'green');
  assert.equal(CIRCLE_FOCUS_MAX_SCALE, 1.18);
  assert.equal(CIRCLE_STEP_ROTATE_SEC, 0.9);
  assert.equal(DEFAULT_GALLERY_CIRCLE_SPEED, 14);
  assert.equal(DEFAULT_GALLERY_CIRCLE_RING_THICKNESS, 3);

  // 2) Exact export filename format: gallery-circle-{bg}-{position}-{res}.mp4
  const baseCircleCustom: StyleCustomization = {
    mode: 'image',
    styleId: 'gal_circle',
    imageStyleId: 'img_polaroid',
    videoStyleId: 'vid_floating',
    galleryEnabled: true,
    galleryStyleId: 'gal_circle',
    galleryAppearance: 'stagger',
    galleryInterval: 0.7,
    galleryHighlightCurrent: true,
    galleryFloatIntensity: 1.0,
    galleryEndHold: 3.0,
    galleryItemSfxType: 'pop',
    galleryCircleMotionMode: 'continuous',
    galleryCircleDirection: 'cw',
    galleryCircleSpeed: 14,
    galleryCircleFocusPosition: 'top',
    galleryCircleShowTrack: true,
    galleryCircleRingThickness: 3,
    galleryCircleDoubleOrbit: false,
    galleryCircleHubTitle: 'عنوان المركز الافتراضي',
    format: '16:9',
    position: 'center',
    videoBox: { x: 18, y: 14, w: 64, h: 72 },
    backgroundMode: 'green',
    greenScreen: true,
    accentColor: '#38BDF8',
    keywordColor: '#FBBF24',
    quoteFontOverride: 'Readex Pro',
    authorFontOverride: 'Cairo',
    fontSizeMultiplier: 1.0,
    minimalShape: 'circle',
    seed: 2026,
  };

  assert.equal(
    buildExportFileName(baseCircleCustom, '1080p', 'mp4'),
    'gallery-circle-green-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseCircleCustom,
        mode: 'video',
        position: 'fullscreen',
        videoBox: { x: 0, y: 0, w: 100, h: 100 },
        backgroundMode: 'style',
        greenScreen: false,
      },
      '1440p',
      'mp4'
    ),
    'gallery-circle-style-fullscreen-1440p.mp4'
  );
  // Non-fullscreen supports style, green, and black backgrounds
  assert.equal(
    resolveGalleryBackground({ ...baseCircleCustom, backgroundMode: 'style' }),
    'style'
  );
  assert.equal(
    resolveGalleryBackground({ ...baseCircleCustom, backgroundMode: 'black' }),
    'black'
  );
  // Other gallery styles keep their original filename format untouched
  assert.equal(
    buildExportFileName(
      { ...baseCircleCustom, styleId: 'gal_float', galleryStyleId: 'gal_float' },
      '1080p',
      'mp4'
    ),
    'gallery-gal_float-green-center-1080p.mp4'
  );

  // 3) Mixed image + video items including transparent PNG, long diacritic captions, multi-line *keyword*, and no-caption item (for hub title fallback)
  const mkMockDrawable = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
      getContext: () => ({ drawImage: () => {} }),
    }) as unknown as HTMLCanvasElement;

  const circleItems8: GalleryItemConfig[] = [
    {
      id: 'c1-png',
      kind: 'image',
      fileName: 'transparent-badge.png',
      caption: 'مُقَدِّمَةٌ *تَفْصِيلِيَّةٌ مُتَعَدِّدَةُ السُّطُورِ وَالْكَلِمَاتِ* بِالتَّشْكِيلِ الْكَامِلِ',
      fit: 'cover',
      displayWidth: 800,
      displayHeight: 800,
    },
    {
      id: 'c2-video',
      kind: 'video',
      fileName: 'reel-clip.mp4',
      caption: '', // intentionally empty to exercise hubTitle fallback
      fit: 'cover',
      displayWidth: 1080,
      displayHeight: 1920,
      duration: 6.0,
      trimIn: 0.5,
      trimOut: 5.5,
      speed: 1.0,
      audioEnabled: true,
      audioVolume: 0.75,
      endBehavior: 'loop',
      hasAudio: true,
    },
    {
      id: 'c3-wide',
      kind: 'image',
      fileName: 'wide-chart.jpg',
      caption: 'تَحْلِيلُ *الأَدَاءِ الشَّامِلِ* لِعَامِ 2026',
      fit: 'cover',
      displayWidth: 2400,
      displayHeight: 900,
    },
    {
      id: 'c4-video-freeze',
      kind: 'video',
      fileName: 'clip-freeze.mp4',
      caption: 'مَقْطَعُ *فِيدْيُو* يَتَوَقَّفُ عِنْدَ النِّهَايَةِ',
      fit: 'cover',
      displayWidth: 1920,
      displayHeight: 1080,
      duration: 3.0,
      trimIn: 0,
      trimOut: 3.0,
      speed: 1.25,
      audioEnabled: false,
      audioVolume: 0.8,
      endBehavior: 'freeze',
      hasAudio: false,
    },
    {
      id: 'c5-tall',
      kind: 'image',
      fileName: 'portrait.png',
      caption: 'لَقْطَةٌ *عَمُودِيَّةٌ مُمَيَّزَةٌ* دَاخِلَ دَائِرَةٍ كَامِلَةٍ',
      fit: 'cover',
      displayWidth: 700,
      displayHeight: 1600,
    },
    {
      id: 'c6-video-3',
      kind: 'video',
      fileName: 'clip3.mp4',
      caption: 'عَرْضٌ *مَرْئِيٌّ* مُتَزَامِنٌ',
      fit: 'cover',
      displayWidth: 1280,
      displayHeight: 720,
      duration: 4.5,
      trimIn: 0,
      trimOut: 4.5,
      speed: 1.0,
      audioEnabled: false,
      audioVolume: 0.6,
      endBehavior: 'loop',
      hasAudio: true,
    },
    {
      id: 'c7-img',
      kind: 'image',
      fileName: 'card7.jpg',
      caption: 'العُنْصُرُ *السَّابِعُ* فِي المَدَارِ',
      fit: 'cover',
      displayWidth: 1200,
      displayHeight: 900,
    },
    {
      id: 'c8-img',
      kind: 'image',
      fileName: 'card8.png',
      caption: 'خِتَامُ *الدَّائِرَةِ الدَّوَّارَةِ* بِجَوْدَةٍ عَالِيَةٍ',
      fit: 'cover',
      displayWidth: 1000,
      displayHeight: 1000,
    },
  ];

  const circleMediaMap: Record<string, GalleryRuntimeMediaEntry> = {};
  for (const it of circleItems8) {
    const w = it.displayWidth || 1000;
    const h = it.displayHeight || 1000;
    circleMediaMap[it.id] = {
      id: it.id,
      kind: it.kind,
      poster: mkMockDrawable(w, h),
      displayWidth: w,
      displayHeight: h,
      greenPixelRatio: 0.01,
    };
  }

  // 4) Geometry & non-overlap verification for n = 1, 2, 3, 5, 8 across small / medium / fullscreen in 16:9 & 9:16
  const testCounts = [1, 2, 3, 5, 8];
  const testBoxes = [
    { name: 'small', pos: 'top-right' as const, box: { x: 66, y: 10, w: 28, h: 34 } },
    { name: 'medium', pos: 'center' as const, box: { x: 18, y: 14, w: 64, h: 72 } },
    { name: 'fullscreen', pos: 'fullscreen' as const, box: { x: 0, y: 0, w: 100, h: 100 } },
  ];

  for (const format of ['16:9', '9:16'] as const) {
    const size = getRenderSize(format, '1080p');
    for (const bSpec of testBoxes) {
      const boxPx = resolveGalleryBoxPixels(
        { ...baseCircleCustom, format, position: bSpec.pos, videoBox: bSpec.box },
        size
      );

      for (const n of testCounts) {
        for (const reqDouble of [false, true]) {
          const geom = computeCircleGalleryGeometry({
            itemCount: n,
            boxX: boxPx.boxX,
            boxY: boxPx.boxY,
            boxWidth: boxPx.boxWidth,
            boxHeight: boxPx.boxHeight,
            highlightEnabled: true,
            doubleOrbit: reqDouble,
            ringThickness: 3,
            isGreen: bSpec.name !== 'fullscreen',
          });

          // Double orbit ONLY active when requested AND n >= 5
          assert.equal(
            geom.isDoubleOrbit,
            reqDouble && n >= 5,
            `isDoubleOrbit mismatch for n=${n}, req=${reqDouble}`
          );

          if (n === 1) {
            assert.equal(geom.outerTrackRadius, 0);
            assert.ok(geom.decorTrackRadius > geom.outerItemRadius * geom.focusMaxScale);
          } else if (!geom.isDoubleOrbit) {
            // Diameter never exceeds formula d = min(0.38*R, 0.8*2*pi*R/n)
            const specMaxD = Math.min(
              0.38 * geom.outerTrackRadius,
              (0.8 * Math.PI * 2 * geom.outerTrackRadius) / n
            );
            assert.ok(
              geom.outerItemDiameter <= specMaxD + 0.05,
              `n=${n} diameter ${geom.outerItemDiameter} exceeded spec ${specMaxD}`
            );
          } else {
            // Double orbit: outer & inner rings radially separated with zero overlap
            const radialClearance =
              geom.outerTrackRadius -
              geom.outerItemRadius * geom.focusMaxScale -
              (geom.innerTrackRadius + geom.innerItemRadius * geom.focusMaxScale);
            assert.ok(
              radialClearance >= 2,
              `Double orbit rings overlap (${format}/${bSpec.name}/n=${n}, clearance=${radialClearance})`
            );
          }

          // Sample settled state and check zero item-item overlap and strict box containment
          const subset = circleItems8.slice(0, n);
          const custom: StyleCustomization = {
            ...baseCircleCustom,
            format,
            position: bSpec.pos,
            videoBox: bSpec.box,
            galleryItems: subset,
            galleryCircleDoubleOrbit: reqDouble,
            backgroundMode: bSpec.name === 'fullscreen' ? 'style' : 'green',
            greenScreen: bSpec.name !== 'fullscreen',
          };
          const sched = computeGallerySchedule({
            itemCount: n,
            appearance: custom.galleryAppearance,
            interval: custom.galleryInterval,
            endHold: custom.galleryEndHold,
          });
          const settledT = sched.lastAppearEnd + 0.6;
          const stA = sampleCircleGalleryState({
            items: subset,
            t: settledT,
            custom,
            boxX: boxPx.boxX,
            boxY: boxPx.boxY,
            boxWidth: boxPx.boxWidth,
            boxHeight: boxPx.boxHeight,
            isGreen: bSpec.name !== 'fullscreen',
          });
          const stB = sampleCircleGalleryState({
            items: subset,
            t: settledT,
            custom,
            boxX: boxPx.boxX,
            boxY: boxPx.boxY,
            boxWidth: boxPx.boxWidth,
            boxHeight: boxPx.boxHeight,
            isGreen: bSpec.name !== 'fullscreen',
          });
          assert.deepEqual(stA, stB, 'sampleCircleGalleryState must be strictly deterministic');
          assert.equal(stA.items.length, n);

          // Strict box containment
          for (const it of stA.items) {
            const effR = it.radius * it.scale;
            assert.ok(
              it.x - effR >= boxPx.boxX - 1.5,
              `Left cutoff (${format}/${bSpec.name}/n=${n}/dbl=${reqDouble})`
            );
            assert.ok(
              it.x + effR <= boxPx.boxX + boxPx.boxWidth + 1.5,
              `Right cutoff (${format}/${bSpec.name}/n=${n}/dbl=${reqDouble})`
            );
            assert.ok(
              it.y - effR >= boxPx.boxY - 1.5,
              `Top cutoff (${format}/${bSpec.name}/n=${n}/dbl=${reqDouble})`
            );
            assert.ok(
              it.y + effR <= boxPx.boxY + boxPx.boxHeight + 1.5,
              `Bottom cutoff (${format}/${bSpec.name}/n=${n}/dbl=${reqDouble})`
            );
          }

          // Zero neighbor overlap
          for (let i = 0; i < stA.items.length; i++) {
            for (let j = i + 1; j < stA.items.length; j++) {
              const a = stA.items[i];
              const b = stA.items[j];
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              const minDist = a.radius * a.scale + b.radius * b.scale;
              assert.ok(
                dist >= minDist - 0.5,
                `Items ${i} & ${j} overlapped (${format}/${bSpec.name}/n=${n}/dbl=${reqDouble}: dist=${dist.toFixed(1)} < ${minDist.toFixed(1)})`
              );
            }
          }

          // With n === 2, items must sit directly opposite each other (distance === 2 * R)
          if (n === 2) {
            const dist2 = Math.hypot(
              stA.items[0].x - stA.items[1].x,
              stA.items[0].y - stA.items[1].y
            );
            assert.ok(
              Math.abs(dist2 - 2 * stA.geometry.outerTrackRadius) < 1.0,
              `2 items must sit directly opposite each other (dist=${dist2}, expected=${2 * stA.geometry.outerTrackRadius})`
            );
          }
        }
      }
    }
  }

  // 5) Motion modes (continuous cw/ccw + step), 4 focus positions, double-orbit opposite rotation, smooth no-stutter trajectory, and highlight toggle
  const motionBox = { boxX: 240, boxY: 80, boxWidth: 1440, boxHeight: 920 };
  const items5 = circleItems8.slice(0, 5);
  const sched5 = computeGallerySchedule({
    itemCount: 5,
    appearance: 'together',
    interval: 0.8,
    endHold: 6.0,
  });

  // Continuous CW vs CCW & double-orbit opposite direction check
  const cwCustom: StyleCustomization = {
    ...baseCircleCustom,
    galleryItems: items5,
    galleryAppearance: 'together',
    galleryInterval: 0.8,
    galleryEndHold: 6.0,
    galleryCircleMotionMode: 'continuous',
    galleryCircleDirection: 'cw',
    galleryCircleSpeed: 24,
    galleryCircleDoubleOrbit: true,
  };
  const stT1 = sampleCircleGalleryState({
    items: items5,
    t: 2.0,
    custom: cwCustom,
    ...motionBox,
    isGreen: false,
  });
  const stT2 = sampleCircleGalleryState({
    items: items5,
    t: 3.0,
    custom: cwCustom,
    ...motionBox,
    isGreen: false,
  });
  // Outer item (index 0) moves clockwise (+angle), inner item (index 1) moves counter-clockwise (-angle)
  assert.ok(stT2.items[0].theta > stT1.items[0].theta, 'Outer ring must rotate CW (+theta)');
  assert.ok(
    stT2.items[1].theta < stT1.items[1].theta,
    'Inner ring in double orbit must rotate opposite to outer ring (-theta)'
  );

  // Smoothness check (no sudden position jumps / stutter across 30fps steps in both continuous & step modes)
  for (const motionMode of ['continuous', 'step'] as const) {
    const smoothCustom: StyleCustomization = {
      ...cwCustom,
      galleryCircleMotionMode: motionMode,
      galleryCircleDoubleOrbit: false,
    };
    let prev = sampleCircleGalleryState({
      items: items5,
      t: sched5.lastAppearEnd + 0.1,
      custom: smoothCustom,
      ...motionBox,
      isGreen: false,
    });
    const rTrack = prev.geometry.outerTrackRadius;
    const maxStepPx =
      motionMode === 'step'
        ? (rTrack * 3.0 * ((Math.PI * 2) / items5.length)) / (CIRCLE_STEP_ROTATE_SEC * 30) + 4
        : (rTrack * ((24 * Math.PI) / 180)) / 30 + 4;
    let prevDx: number[] | null = null;
    let prevDy: number[] | null = null;
    for (let step = 1; step <= 60; step++) {
      const t = sched5.lastAppearEnd + 0.1 + step / 30;
      const cur = sampleCircleGalleryState({
        items: items5,
        t,
        custom: smoothCustom,
        ...motionBox,
        isGreen: false,
      });
      const curDx: number[] = [];
      const curDy: number[] = [];
      for (let idx = 0; idx < items5.length; idx++) {
        const dx = cur.items[idx].x - prev.items[idx].x;
        const dy = cur.items[idx].y - prev.items[idx].y;
        curDx.push(dx);
        curDy.push(dy);
        const jump = Math.hypot(dx, dy);
        assert.ok(
          jump <= maxStepPx,
          `Unexpected motion jump in ${motionMode} mode at t=${t.toFixed(2)}: jump=${jump.toFixed(1)}px > ${maxStepPx.toFixed(1)}px`
        );
        if (prevDx && prevDy) {
          const accel = Math.hypot(dx - prevDx[idx], dy - prevDy[idx]);
          assert.ok(
            accel <= 14,
            `Unexpected motion stutter (acceleration spike) in ${motionMode} mode at t=${t.toFixed(2)}: accel=${accel.toFixed(1)}px`
          );
        }
      }
      prevDx = curDx;
      prevDy = curDy;
      prev = cur;
    }
  }

  // Focus position check across all 4 positions (top, right, left, bottom) at t just after step 0 settles
  for (const focusPos of ['top', 'right', 'left', 'bottom'] as const) {
    const posCustom: StyleCustomization = {
      ...cwCustom,
      galleryCircleMotionMode: 'step',
      galleryCircleFocusPosition: focusPos,
      galleryCircleDoubleOrbit: false,
    };
    const st = sampleCircleGalleryState({
      items: items5,
      t: sched5.lastAppearEnd + 0.1,
      custom: posCustom,
      ...motionBox,
      isGreen: false,
    });
    const expectedAngle = getFocusAngleRad(focusPos);
    assert.equal(st.focusedIndex, 0);
    assert.ok(
      Math.abs(st.items[0].theta - expectedAngle) < 0.05,
      `Item 0 should start aligned to focus position ${focusPos}`
    );
    assert.ok(st.items[0].scale > 1.15 && st.items[0].scale <= 1.181);
    assert.ok(st.items[2].alpha <= 0.72);
  }

  // Highlight OFF disables scaling and dimming
  const noHiSt = sampleCircleGalleryState({
    items: items5,
    t: sched5.lastAppearEnd + 0.2,
    custom: { ...cwCustom, galleryHighlightCurrent: false, galleryCircleDoubleOrbit: false },
    ...motionBox,
    isGreen: false,
  });
  for (const it of noHiSt.items) {
    assert.ok(Math.abs(it.scale - 1.0) < 0.01, 'Highlight OFF must keep item scale at 1.0');
    assert.ok(Math.abs(it.alpha - 1.0) < 0.01, 'Highlight OFF must keep item alpha at 1.0');
  }

  // 6) Full renderQuoteFrame + style/green/black rules + Arabic character-join safety + hubTitle fallback + getSceneEventTimes
  for (const bg of ['style', 'green', 'black'] as const) {
    const size = getRenderSize('16:9', '1080p');
    let maxBlur = 0;
    let curBlur = 0;
    const fillTexts: string[] = [];
    const strokeTexts: string[] = [];
    const fillStylesUsed: string[] = [];
    const ctx = createMockCanvasContextForChat();
    const origFillText = ctx.fillText.bind(ctx);
    const origStrokeText = ctx.strokeText.bind(ctx);
    const origFillRect = ctx.fillRect.bind(ctx);
    ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
      fillTexts.push(String(text));
      return origFillText(text, x, y, maxWidth);
    };
    ctx.strokeText = (text: string, x: number, y: number, maxWidth?: number) => {
      strokeTexts.push(String(text));
      return origStrokeText(text, x, y, maxWidth);
    };
    ctx.fillRect = (x: number, y: number, w: number, h: number) => {
      if (typeof ctx.fillStyle === 'string') fillStylesUsed.push(ctx.fillStyle);
      return origFillRect(x, y, w, h);
    };
    Object.defineProperty(ctx, 'shadowBlur', {
      get: () => curBlur,
      set: (v: number) => {
        curBlur = v;
        if (v > maxBlur) maxBlur = v;
      },
      configurable: true,
    });

    const renderCustom: StyleCustomization = {
      ...baseCircleCustom,
      position: 'fullscreen',
      videoBox: { x: 0, y: 0, w: 100, h: 100 },
      backgroundMode: bg,
      greenScreen: bg === 'green',
      galleryItems: circleItems8,
      galleryCircleMotionMode: 'step',
      galleryCircleDoubleOrbit: true,
      galleryCircleHubTitle: 'عنوان المركز الاحتياطي',
    };
    const contentObj: QuoteContent = {
      quoteText: '',
      authorName: '',
      subtitle: '',
      photoSource: null,
      photoId: 'default',
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      quotationMarks: 'none',
      galleryItems: circleItems8,
      galleryMedia: circleMediaMap,
    };

    const events = getSceneEventTimes(ctx, contentObj, DEFAULT_IMAGE_TIMELINE, renderCustom, size);
    assert.equal(events.enterStart, 0.04);
    assert.equal(events.itemTimes?.length, 8);
    assert.ok(events.keywordTimes.length >= 1);

    const sched8 = computeGallerySchedule({
      itemCount: 8,
      appearance: renderCustom.galleryAppearance,
      interval: renderCustom.galleryInterval,
      endHold: renderCustom.galleryEndHold,
    });
    // Render entrance, item 0 focused (long diacritic + multi-line keyword), item 1 focused (empty caption -> hubTitle fallback), and exit
    for (const sampleT of [
      0.85,
      sched8.lastAppearEnd + 0.15,
      sched8.lastAppearEnd + renderCustom.galleryInterval! + CIRCLE_STEP_ROTATE_SEC + 0.15,
      sched8.total - 0.15,
    ]) {
      renderQuoteFrame(ctx, sampleT, contentObj, DEFAULT_IMAGE_TIMELINE, renderCustom, size);
    }

    if (bg === 'green') {
      assert.equal(maxBlur, 0, 'gal_circle green mode must have shadowBlur === 0');
      assert.ok(
        fillStylesUsed.some((s) => s.toUpperCase() === '#00FF00'),
        'gal_circle green mode must fill flat #00FF00 background'
      );
      assert.ok(
        strokeTexts.length > 0,
        'gal_circle green mode must draw hard dark outline on hub caption'
      );
    }

    // Verify Arabic hub text was drawn and NEVER split into single characters
    const arabicDrawn = fillTexts.filter((t) => /[\u0600-\u06FF]/.test(t));
    assert.ok(arabicDrawn.length > 0, 'Hub caption must render Arabic words');
    for (const txt of arabicDrawn) {
      assert.ok(
        txt.trim().length > 1,
        `gal_circle Arabic text must never split into single characters (got "${txt}")`
      );
    }
  }

  // 7) Preset & JSON round-trip preserves all 8 gal_circle settings and never stores File/objectUrl
  const circlePreset = {
    galleryEnabled: true,
    galleryStyleId: 'gal_circle' as GalleryStyleId,
    galleryCircleMotionMode: 'step' as const,
    galleryCircleDirection: 'ccw' as const,
    galleryCircleSpeed: 28,
    galleryCircleFocusPosition: 'left' as const,
    galleryCircleShowTrack: false,
    galleryCircleRingThickness: 6,
    galleryCircleDoubleOrbit: true,
    galleryCircleHubTitle: 'ألبوم العرض الدائري',
    galleryItems: circleItems8.slice(0, 5),
  };
  const roundTripped = JSON.parse(JSON.stringify(circlePreset));
  assert.deepEqual(roundTripped, circlePreset);
  for (const item of roundTripped.galleryItems) {
    assert.equal('file' in item, false);
    assert.equal('objectUrl' in item, false);
  }
});








