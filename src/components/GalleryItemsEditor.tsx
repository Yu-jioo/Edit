import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Film,
  GripVertical,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  computeGallerySchedule,
  DEFAULT_GALLERY_CIRCLE_DIRECTION,
  DEFAULT_GALLERY_CIRCLE_DOUBLE_ORBIT,
  DEFAULT_GALLERY_CIRCLE_FOCUS_POSITION,
  DEFAULT_GALLERY_CIRCLE_HUB_TITLE,
  DEFAULT_GALLERY_CIRCLE_MOTION_MODE,
  DEFAULT_GALLERY_CIRCLE_RING_THICKNESS,
  DEFAULT_GALLERY_CIRCLE_SHOW_TRACK,
  DEFAULT_GALLERY_CIRCLE_SPEED,
  DEFAULT_GALLERY_END_HOLD,
  DEFAULT_GALLERY_FLOAT_INTENSITY,
  DEFAULT_GALLERY_INTERVAL,
  getGalleryDemoPosterCanvas,
  MAX_GALLERY_ITEMS,
  MAX_GALLERY_VIDEOS,
  resolveCircleDirection,
  resolveCircleFocusPosition,
  resolveCircleMotionMode,
  resolveCircleRingThickness,
  resolveCircleSpeed,
  resolveGalleryStyleId,
} from '../styles';
import {
  GalleryAppearanceMode,
  GalleryCircleDirection,
  GalleryCircleFocusPosition,
  GalleryCircleMotionMode,
  GalleryItemConfig,
  GalleryRuntimeMediaEntry,
  ImageFitMode,
  StyleCustomization,
  VideoEndBehavior,
} from '../types';
import { clamp } from '../utils/math';

interface GalleryThumbPreviewProps {
  item: GalleryItemConfig;
  index: number;
  mediaEntry?: GalleryRuntimeMediaEntry;
}

const GalleryThumbPreview: React.FC<GalleryThumbPreviewProps> = ({
  item,
  index,
  mediaEntry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = mediaEntry?.poster || getGalleryDemoPosterCanvas(item, index);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sw =
      src instanceof HTMLImageElement ? src.naturalWidth || src.width : src.width;
    const sh =
      src instanceof HTMLImageElement ? src.naturalHeight || src.height : src.height;
    if (sw > 0 && sh > 0) {
      const scale = Math.max(canvas.width / sw, canvas.height / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(src, (canvas.width - dw) * 0.5, (canvas.height - dh) * 0.5, dw, dh);
    }
  }, [item, index, mediaEntry]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={64}
      className="w-14 h-10 rounded-lg object-cover border border-slate-700/80 shrink-0 bg-slate-950"
    />
  );
};

interface GalleryItemsEditorProps {
  items: GalleryItemConfig[];
  mediaMap: Record<string, GalleryRuntimeMediaEntry>;
  loading: boolean;
  errorMessage: string | null;
  presetNotice: string | null;
  onDismissError: () => void;
  onDismissPresetNotice: () => void;
  onAddFiles: (files: FileList | File[]) => void;
  onReplaceItemFile: (itemId: string, file: File) => void;
  onUpdateItem: (itemId: string, patch: Partial<GalleryItemConfig>) => void;
  onDeleteItem: (itemId: string) => void;
  onReorderItems: (fromIdx: number, toIdx: number) => void;
}

export const GalleryItemsEditor: React.FC<GalleryItemsEditorProps> = ({
  items,
  mediaMap,
  loading,
  errorMessage,
  presetNotice,
  onDismissError,
  onDismissPresetNotice,
  onAddFiles,
  onReplaceItemFile,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id || null);
  const [isDragOverZone, setIsDragOverZone] = useState<boolean>(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const videoCount = items.filter((it) => it.kind === 'video').length;
  const remainingSlots = Math.max(0, MAX_GALLERY_ITEMS - items.length);

  // Support pasting images/videos from clipboard while Gallery editor is mounted
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const mediaFiles = Array.from(files).filter(
          (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
        );
        if (mediaFiles.length > 0) {
          e.preventDefault();
          onAddFiles(mediaFiles);
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onAddFiles]);

  const handleWrapKeyword = (item: GalleryItemConfig) => {
    const cur = (item.caption || '').trim();
    if (!cur) {
      onUpdateItem(item.id, { caption: 'عنصر *مميز*' });
      return;
    }
    if (cur.includes('*')) return;
    const words = cur.split(/\s+/);
    const targetIdx = words.length > 1 ? words.length - 1 : 0;
    words[targetIdx] = `*${words[targetIdx]}*`;
    onUpdateItem(item.id, { caption: words.join(' ') });
  };

  return (
    <div className="space-y-3" data-testid="gallery-items-editor">
      {presetNotice && (
        <div
          data-testid="gallery-preset-notice"
          className="flex items-start justify-between gap-2 rounded-xl bg-sky-500/10 border border-sky-500/30 p-2.5 text-xs text-sky-200"
        >
          <span>{presetNotice}</span>
          <button
            type="button"
            onClick={onDismissPresetNotice}
            className="text-sky-400 hover:text-white shrink-0 font-semibold"
          >
            إغلاق
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          data-testid="gallery-error-banner"
          className="flex items-start justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-500/35 p-2.5 text-xs text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-amber-300 hover:text-white shrink-0 font-semibold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Multi-Select Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOverZone(true);
        }}
        onDragLeave={() => setIsDragOverZone(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOverZone(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onAddFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-xl border border-dashed p-3 text-center transition-colors ${
          isDragOverZone
            ? 'border-sky-400 bg-sky-500/10'
            : 'border-slate-700 bg-slate-950/80 hover:border-slate-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && replaceTargetId) {
              onReplaceItemFile(replaceTargetId, f);
            }
            setReplaceTargetId(null);
            e.target.value = '';
          }}
        />

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            disabled={loading || remainingSlots === 0}
            data-testid="btn-gallery-upload"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-bold transition-colors disabled:opacity-45"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {loading
                ? 'جاري تجهيز الملفات...'
                : remainingSlots === 0
                  ? 'تم الوصول للحد الأقصى (8 عناصر)'
                  : 'إضافة صور أو مقاطع فيديو (متعدد)'}
            </span>
          </button>
          <p className="text-[11px] text-slate-400">
            اسحب وأفلت أو الصق (Ctrl+V) · حتى {MAX_GALLERY_ITEMS} عناصر (بحد أقصى {MAX_GALLERY_VIDEOS} فيديوهات)
          </p>
          <div className="flex items-center gap-3 text-[11px] text-slate-300 font-mono-tabular">
            <span>
              العناصر: {items.length}/{MAX_GALLERY_ITEMS}
            </span>
            <span>·</span>
            <span>
              الفيديوهات: {videoCount}/{MAX_GALLERY_VIDEOS}
            </span>
          </div>
        </div>
      </div>

      {/* Reorderable Items List */}
      <div className="space-y-2">
        {items.map((item, idx) => {
          const mediaEntry = mediaMap[item.id];
          const isExpanded = expandedId === item.id;
          const isMissingRealFile = !mediaEntry;
          const dur = Math.max(0.2, item.duration || mediaEntry?.duration || 6.0);
          const trimIn = clamp(item.trimIn ?? 0, 0, Math.max(0, dur - 0.1));
          const trimOut = clamp(item.trimOut ?? dur, trimIn + 0.1, dur);
          const speed = clamp(item.speed ?? 1.0, 0.5, 2.0);
          const audioEnabled = Boolean(item.audioEnabled);
          const endBehavior: VideoEndBehavior = item.endBehavior || 'loop';

          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx) {
                  onReorderItems(dragIdx, idx);
                }
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              data-testid={`gallery-item-card-${idx}`}
              className={`rounded-xl border bg-slate-950/90 transition-colors ${
                dragIdx === idx
                  ? 'border-sky-400 opacity-75'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Item Header Row */}
              <div className="flex items-center gap-2 p-2">
                <span
                  title="اسحب لإعادة الترتيب"
                  className="cursor-grab text-slate-500 hover:text-slate-300"
                >
                  <GripVertical className="w-4 h-4" />
                </span>

                <GalleryThumbPreview item={item} index={idx} mediaEntry={mediaEntry} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.kind === 'video' ? (
                      <Film className="w-3 h-3 text-sky-400 shrink-0" />
                    ) : (
                      <ImageIcon className="w-3 h-3 text-indigo-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-100 truncate">
                      {item.fileName || `عنصر ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    <span>
                      {item.displayWidth}×{item.displayHeight}
                    </span>
                    <span>·</span>
                    <span>{item.fit === 'contain' ? 'احتواء' : 'ملء'}</span>
                    {isMissingRealFile && (
                      <span className="text-amber-300">· تجريبي</span>
                    )}
                  </div>
                </div>

                {/* Quick Item Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="تحريك لأعلى"
                    disabled={idx === 0}
                    onClick={() => onReorderItems(idx, idx - 1)}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="تحريك لأسفل"
                    disabled={idx === items.length - 1}
                    onClick={() => onReorderItems(idx, idx + 1)}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="استبدال الملف"
                    onClick={() => {
                      setReplaceTargetId(item.id);
                      replaceInputRef.current?.click();
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="حذف العنصر"
                    disabled={items.length <= 1}
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={isExpanded ? 'طي الإعدادات' : 'إعدادات العنصر'}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Per-Item Controls */}
              {isExpanded && (
                <div className="border-t border-slate-800/80 p-2.5 space-y-2.5 bg-slate-900/40 rounded-b-xl">
                  {/* Optional Caption */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-slate-300">
                        تعليق اختياري (يدعم *الكلمة*)
                      </label>
                      <button
                        type="button"
                        onClick={() => handleWrapKeyword(item)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[10px] font-bold"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>تمييز</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="auto"
                      value={item.caption ?? ''}
                      onChange={(e) => onUpdateItem(item.id, { caption: e.target.value })}
                      placeholder="اتركه فارغاً أو اكتب تعليقاً..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  {/* Fit Toggle: ملء / احتواء */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-300">الملاءمة:</span>
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                      {(
                        [
                          { id: 'cover' as ImageFitMode, label: 'ملء' },
                          { id: 'contain' as ImageFitMode, label: 'احتواء' },
                        ]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onUpdateItem(item.id, { fit: opt.id })}
                          className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            item.fit === opt.id
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Video-specific controls */}
                  {item.kind === 'video' && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800/70">
                      {/* Trim In / Out */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>بداية القص</span>
                            <span className="font-mono-tabular text-sky-300">
                              {trimIn.toFixed(1)}ث
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0.1, dur - 0.2)}
                            step={0.1}
                            value={trimIn}
                            onChange={(e) => {
                              const nextIn = parseFloat(e.target.value);
                              onUpdateItem(item.id, {
                                trimIn: nextIn,
                                trimOut: Math.max(nextIn + 0.2, trimOut),
                              });
                            }}
                            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>نهاية القص</span>
                            <span className="font-mono-tabular text-sky-300">
                              {trimOut.toFixed(1)}ث
                            </span>
                          </div>
                          <input
                            type="range"
                            min={Math.min(dur, trimIn + 0.2)}
                            max={dur}
                            step={0.1}
                            value={trimOut}
                            onChange={(e) =>
                              onUpdateItem(item.id, {
                                trimOut: Math.max(trimIn + 0.2, parseFloat(e.target.value)),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg"
                          />
                        </div>
                      </div>

                      {/* Speed 0.5x - 2.0x */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-300">سرعة التشغيل</span>
                          <span className="font-mono-tabular text-sky-300 font-semibold">
                            {speed.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2.0}
                          step={0.1}
                          value={speed}
                          onChange={(e) =>
                            onUpdateItem(item.id, { speed: parseFloat(e.target.value) })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg"
                        />
                      </div>

                      {/* End Behavior: Loop (default) / Freeze */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-300">
                          عند نهاية المقطع:
                        </span>
                        <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                          {(
                            [
                              { id: 'loop' as VideoEndBehavior, label: 'تكرار' },
                              { id: 'freeze' as VideoEndBehavior, label: 'تجميد' },
                            ]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onUpdateItem(item.id, { endBehavior: opt.id })}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                endBehavior === opt.id
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Clip Audio Toggle (default OFF) + Volume */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={item.hasAudio === false}
                              checked={audioEnabled && item.hasAudio !== false}
                              onChange={(e) =>
                                onUpdateItem(item.id, { audioEnabled: e.target.checked })
                              }
                              className="rounded accent-sky-400"
                            />
                            {audioEnabled && item.hasAudio !== false ? (
                              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                            ) : (
                              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            <span>صوت المقطع</span>
                          </label>
                          <span className="font-mono-tabular text-[11px] text-slate-400">
                            {Math.round((item.audioVolume ?? 0.8) * 100)}%
                          </span>
                        </div>
                        {item.hasAudio === false ? (
                          <p className="text-[10px] text-slate-400">
                            هذا المقطع لا يحتوي على مسار صوتي.
                          </p>
                        ) : (
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            disabled={!audioEnabled}
                            value={item.audioVolume ?? 0.8}
                            onChange={(e) =>
                              onUpdateItem(item.id, {
                                audioVolume: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg disabled:opacity-40"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface GalleryGlobalTimingControlsProps {
  customization: StyleCustomization;
  setCustomization: React.Dispatch<React.SetStateAction<StyleCustomization>>;
  itemCount: number;
}

export const GalleryGlobalTimingControls: React.FC<GalleryGlobalTimingControlsProps> = ({
  customization,
  setCustomization,
  itemCount,
}) => {
  const appearance: GalleryAppearanceMode = customization.galleryAppearance || 'stagger';
  const interval = clamp(
    customization.galleryInterval ?? DEFAULT_GALLERY_INTERVAL,
    0.3,
    2.0
  );
  const floatIntensity = clamp(
    customization.galleryFloatIntensity ?? DEFAULT_GALLERY_FLOAT_INTENSITY,
    0,
    1.5
  );
  const endHold = clamp(
    customization.galleryEndHold ?? DEFAULT_GALLERY_END_HOLD,
    1.0,
    8.0
  );
  const highlightCurrent = customization.galleryHighlightCurrent !== false;
  const activeGalStyle = resolveGalleryStyleId(
    customization.galleryStyleId || customization.styleId
  );
  const isCircleStyle = activeGalStyle === 'gal_circle';
  const circleMotionMode = resolveCircleMotionMode(
    customization.galleryCircleMotionMode ?? DEFAULT_GALLERY_CIRCLE_MOTION_MODE
  );
  const circleDirection = resolveCircleDirection(
    customization.galleryCircleDirection ?? DEFAULT_GALLERY_CIRCLE_DIRECTION
  );
  const circleSpeed = resolveCircleSpeed(
    customization.galleryCircleSpeed ?? DEFAULT_GALLERY_CIRCLE_SPEED
  );
  const circleFocusPosition = resolveCircleFocusPosition(
    customization.galleryCircleFocusPosition ?? DEFAULT_GALLERY_CIRCLE_FOCUS_POSITION
  );
  const circleShowTrack =
    customization.galleryCircleShowTrack ?? DEFAULT_GALLERY_CIRCLE_SHOW_TRACK;
  const circleRingThickness = resolveCircleRingThickness(
    customization.galleryCircleRingThickness ?? DEFAULT_GALLERY_CIRCLE_RING_THICKNESS
  );
  const circleDoubleOrbit =
    customization.galleryCircleDoubleOrbit ?? DEFAULT_GALLERY_CIRCLE_DOUBLE_ORBIT;
  const circleHubTitle =
    customization.galleryCircleHubTitle ?? DEFAULT_GALLERY_CIRCLE_HUB_TITLE;
  const canDoubleOrbit = itemCount >= 5;

  const schedule = computeGallerySchedule({
    itemCount,
    appearance,
    interval,
    endHold,
  });

  return (
    <div className="space-y-3.5" data-testid="gallery-global-timing-controls">
      {/* Appearance Mode: تتابع / معًا */}
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-slate-300">
          طريقة ظهور العناصر
        </span>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          {(
            [
              { id: 'stagger' as GalleryAppearanceMode, label: 'تتابع (واحد تلو الآخر)' },
              { id: 'together' as GalleryAppearanceMode, label: 'معًا (في وقت واحد)' },
            ]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`gallery-appearance-${opt.id}`}
              onClick={() =>
                setCustomization((c) => ({ ...c, galleryAppearance: opt.id }))
              }
              className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
                appearance === opt.id
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interval Slider (0.3 - 2.0 s) */}
      {(appearance === 'stagger' || (isCircleStyle && circleMotionMode === 'step')) && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <label htmlFor="gallery-interval-slider" className="text-slate-300 font-medium">
              {isCircleStyle && circleMotionMode === 'step'
                ? 'الفاصل الزمني / وقفة كل خطوة'
                : 'الفاصل الزمني بين العناصر'}
            </label>
            <span className="font-mono-tabular text-sky-400 font-semibold">
              {interval.toFixed(1)} ثانية
            </span>
          </div>
          <input
            id="gallery-interval-slider"
            data-testid="gallery-interval-slider"
            type="range"
            min={0.3}
            max={2.0}
            step={0.1}
            value={interval}
            onChange={(e) =>
              setCustomization((c) => ({
                ...c,
                galleryInterval: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      )}

      {/* Highlight Current Item Checkbox (default ON) */}
      <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
        <div>
          <span className="block text-xs font-semibold text-slate-200">
            تمييز العنصر الحالي
          </span>
          <span className="block text-[10px] text-slate-400">
            {isCircleStyle
              ? 'تكبير العنصر الأقرب لموضع التركيز (1.18×) وإبرازه وتعتيم البقية إلى ~70%'
              : 'تكبير العنصر النشط (1.08×) وإبرازه وتعتيم البقية إلى ~70%'}
          </span>
        </div>
        <input
          type="checkbox"
          data-testid="gallery-highlight-checkbox"
          checked={highlightCurrent}
          onChange={(e) =>
            setCustomization((c) => ({
              ...c,
              galleryHighlightCurrent: e.target.checked,
            }))
          }
          className="rounded accent-sky-400 w-4 h-4 shrink-0"
        />
      </label>

      {/* Dedicated Rotating Circle ("دائرة دوّارة") Controls */}
      {isCircleStyle && (
        <div
          className="rounded-xl border border-sky-500/25 bg-slate-950/80 p-3 space-y-3"
          data-testid="gallery-circle-controls"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-300">إعدادات الدائرة الدوّارة</span>
            <span className="text-[10px] text-slate-400">
              {circleMotionMode === 'continuous' ? 'دوران مستمر' : 'خطوة خطوة'}
            </span>
          </div>

          {/* Motion Mode Selector */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-slate-300">نمط الحركة</span>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'continuous' as GalleryCircleMotionMode, label: 'دوران مستمر' },
                  { id: 'step' as GalleryCircleMotionMode, label: 'خطوة خطوة' },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`gallery-circle-motion-${opt.id}`}
                  onClick={() =>
                    setCustomization((c) => ({
                      ...c,
                      galleryCircleMotionMode: opt.id,
                    }))
                  }
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                    circleMotionMode === opt.id
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction Selector */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-slate-300">اتجاه الدوران</span>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'cw' as GalleryCircleDirection, label: 'عقارب الساعة' },
                  { id: 'ccw' as GalleryCircleDirection, label: 'عكسها' },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`gallery-circle-dir-${opt.id}`}
                  onClick={() =>
                    setCustomization((c) => ({
                      ...c,
                      galleryCircleDirection: opt.id,
                    }))
                  }
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                    circleDirection === opt.id
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speed Slider (4-40 deg/s, default 14) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <label htmlFor="gallery-circle-speed-slider" className="text-slate-300 font-medium">
                سرعة الدوران
              </label>
              <span className="font-mono-tabular text-sky-400 font-semibold">
                {Math.round(circleSpeed)}°/ث
              </span>
            </div>
            <input
              id="gallery-circle-speed-slider"
              data-testid="gallery-circle-speed-slider"
              type="range"
              min={4}
              max={40}
              step={1}
              value={circleSpeed}
              onChange={(e) =>
                setCustomization((c) => ({
                  ...c,
                  galleryCircleSpeed: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Focus Position (أعلى / يمين / يسار / أسفل) */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold text-slate-300">موضع التركيز</span>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'top' as GalleryCircleFocusPosition, label: 'أعلى' },
                  { id: 'right' as GalleryCircleFocusPosition, label: 'يمين' },
                  { id: 'left' as GalleryCircleFocusPosition, label: 'يسار' },
                  { id: 'bottom' as GalleryCircleFocusPosition, label: 'أسفل' },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`gallery-circle-focus-${opt.id}`}
                  onClick={() =>
                    setCustomization((c) => ({
                      ...c,
                      galleryCircleFocusPosition: opt.id,
                    }))
                  }
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                    circleFocusPosition === opt.id
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ring Thickness Slider (1-8 px) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <label htmlFor="gallery-circle-thickness-slider" className="text-slate-300 font-medium">
                سماكة الإطار الدائري
              </label>
              <span className="font-mono-tabular text-sky-400 font-semibold">
                {circleRingThickness.toFixed(1)} px
              </span>
            </div>
            <input
              id="gallery-circle-thickness-slider"
              data-testid="gallery-circle-thickness-slider"
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={circleRingThickness}
              onChange={(e) =>
                setCustomization((c) => ({
                  ...c,
                  galleryCircleRingThickness: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Track Visibility Toggle */}
          <label className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2 cursor-pointer">
            <span className="text-[11px] font-semibold text-slate-200">
              إظهار المسار الدائري
            </span>
            <input
              type="checkbox"
              data-testid="gallery-circle-track-checkbox"
              checked={circleShowTrack}
              onChange={(e) =>
                setCustomization((c) => ({
                  ...c,
                  galleryCircleShowTrack: e.target.checked,
                }))
              }
              className="rounded accent-sky-400 w-4 h-4 shrink-0"
            />
          </label>

          {/* Double Orbit Toggle (only when items >= 5) */}
          <label
            className={`flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2 ${
              canDoubleOrbit ? 'cursor-pointer' : 'opacity-55 cursor-not-allowed'
            }`}
            title={canDoubleOrbit ? undefined : 'يتفعّل خيار مدارين عند وجود 5 عناصر فأكثر'}
          >
            <div>
              <span className="block text-[11px] font-semibold text-slate-200">
                مدارين (خارجي وداخلي متعاكسان)
              </span>
              <span className="block text-[10px] text-slate-400">
                {canDoubleOrbit
                  ? 'توزيع العناصر بالتناوب على مدارين يدوران بعكس بعضهما'
                  : 'يتفعّل تلقائياً عند إضافة 5 عناصر فأكثر'}
              </span>
            </div>
            <input
              type="checkbox"
              data-testid="gallery-circle-double-orbit-checkbox"
              disabled={!canDoubleOrbit}
              checked={canDoubleOrbit && circleDoubleOrbit}
              onChange={(e) =>
                setCustomization((c) => ({
                  ...c,
                  galleryCircleDoubleOrbit: e.target.checked,
                }))
              }
              className="rounded accent-sky-400 w-4 h-4 shrink-0"
            />
          </label>

          {/* Optional Hub Title Field */}
          <div className="space-y-1">
            <label
              htmlFor="gallery-circle-hub-title"
              className="block text-[11px] font-semibold text-slate-300"
            >
              عنوان المركز (اختياري — يظهر عند عدم وجود تعليق للعنصر)
            </label>
            <input
              id="gallery-circle-hub-title"
              data-testid="gallery-circle-hub-title"
              type="text"
              dir="auto"
              value={circleHubTitle}
              placeholder="مثال: رحلة *الابتكار*..."
              onChange={(e) =>
                setCustomization((c) => ({
                  ...c,
                  galleryCircleHubTitle: e.target.value,
                }))
              }
              className="w-full rounded-lg bg-slate-900 border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>
      )}

      {/* Float Intensity Slider (0 - 1.5, default 1.0) */}
      {!isCircleStyle && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <label htmlFor="gallery-float-slider" className="text-slate-300 font-medium">
              شدة الطفو والتمايل (Float)
            </label>
            <span className="font-mono-tabular text-sky-400 font-semibold">
              {floatIntensity.toFixed(2)}×
            </span>
          </div>
          <input
            id="gallery-float-slider"
            data-testid="gallery-float-slider"
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={floatIntensity}
            onChange={(e) =>
              setCustomization((c) => ({
                ...c,
                galleryFloatIntensity: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      )}

      {/* End Hold Slider (1 - 8 s, default 3 s) */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <label htmlFor="gallery-endhold-slider" className="text-slate-300 font-medium">
            ثبات النهاية بعد ظهور جميع العناصر
          </label>
          <span className="font-mono-tabular text-sky-400 font-semibold">
            {endHold.toFixed(1)} ثانية
          </span>
        </div>
        <input
          id="gallery-endhold-slider"
          data-testid="gallery-endhold-slider"
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={endHold}
          onChange={(e) =>
            setCustomization((c) => ({
              ...c,
              galleryEndHold: parseFloat(e.target.value),
            }))
          }
          className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Total Duration Summary Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 font-semibold">المدة الإجمالية للعناصر المتعددة</span>
          <span
            data-testid="gallery-total-duration"
            className="font-mono-tabular text-sky-400 font-bold"
          >
            {schedule.total.toFixed(1)} ثانية
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400 tabular-nums">
          <span>دخول ثابت: 0.6 ث</span>
          <span>خروج ثابت: 0.6 ث</span>
          <span>عدد العناصر: {schedule.itemCount}</span>
          <span>ثبات النهاية: {schedule.endHold.toFixed(1)} ث</span>
        </div>
      </div>
    </div>
  );
};
