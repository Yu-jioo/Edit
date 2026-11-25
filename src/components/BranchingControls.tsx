import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  BranchCameraMode,
  BranchLayoutMode,
  BranchMetroPalette,
  BranchStyleId,
  BranchTimingConfig,
  BranchTreeData,
  BranchTreeTheme,
  StyleMetadata,
} from '../types';
import {
  computeBranchSchedule,
  countBranchStats,
  DEFAULT_BRANCH_DATA,
  DEFAULT_BRANCH_TIMING,
  MAX_BRANCH_BRANCHES,
  MAX_BRANCH_SUBS,
  MAX_BRANCH_TOTAL_NODES,
  MIN_BRANCH_BRANCHES,
  parseQuickPasteBranchTree,
} from '../utils/math';

interface BranchingInputSectionProps {
  data: BranchTreeData;
  onChange: (next: BranchTreeData) => void;
}

export const BranchingInputSection: React.FC<BranchingInputSectionProps> = ({
  data,
  onChange,
}) => {
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');

  const tree = data || DEFAULT_BRANCH_DATA;
  const stats = useMemo(() => countBranchStats(tree), [tree]);

  const canAddBranch =
    tree.branches.length < MAX_BRANCH_BRANCHES &&
    stats.totalNodes < MAX_BRANCH_TOTAL_NODES;

  const updateRoot = (root: string) => {
    onChange({ ...tree, root });
  };

  const updateBranchText = (bi: number, text: string) => {
    const nextBranches = tree.branches.map((b, idx) =>
      idx === bi ? { ...b, text } : b
    );
    onChange({ ...tree, branches: nextBranches });
  };

  const addBranch = () => {
    if (!canAddBranch) return;
    const newId = `br-${Date.now()}-${tree.branches.length + 1}`;
    onChange({
      ...tree,
      branches: [
        ...tree.branches,
        { id: newId, text: `فرع جديد ${tree.branches.length + 1}`, subs: [] },
      ],
    });
  };

  const deleteBranch = (bi: number) => {
    if (tree.branches.length <= MIN_BRANCH_BRANCHES) return;
    onChange({
      ...tree,
      branches: tree.branches.filter((_, idx) => idx !== bi),
    });
  };

  const moveBranch = (bi: number, delta: -1 | 1) => {
    const target = bi + delta;
    if (target < 0 || target >= tree.branches.length) return;
    const next = [...tree.branches];
    [next[bi], next[target]] = [next[target], next[bi]];
    onChange({ ...tree, branches: next });
  };

  const addSub = (bi: number) => {
    const branch = tree.branches[bi];
    if (!branch) return;
    if (branch.subs.length >= MAX_BRANCH_SUBS) return;
    if (stats.totalNodes >= MAX_BRANCH_TOTAL_NODES) return;
    const nextBranches = tree.branches.map((b, idx) =>
      idx === bi
        ? {
            ...b,
            subs: [
              ...b.subs,
              {
                id: `${b.id}-s${Date.now()}-${b.subs.length + 1}`,
                text: `نقطة فرعية ${b.subs.length + 1}`,
              },
            ],
          }
        : b
    );
    onChange({ ...tree, branches: nextBranches });
  };

  const updateSubText = (bi: number, si: number, text: string) => {
    const nextBranches = tree.branches.map((b, idx) =>
      idx === bi
        ? {
            ...b,
            subs: b.subs.map((s, sIdx) => (sIdx === si ? { ...s, text } : s)),
          }
        : b
    );
    onChange({ ...tree, branches: nextBranches });
  };

  const deleteSub = (bi: number, si: number) => {
    const nextBranches = tree.branches.map((b, idx) =>
      idx === bi
        ? { ...b, subs: b.subs.filter((_, sIdx) => sIdx !== si) }
        : b
    );
    onChange({ ...tree, branches: nextBranches });
  };

  const moveSub = (bi: number, si: number, delta: -1 | 1) => {
    const branch = tree.branches[bi];
    if (!branch) return;
    const target = si + delta;
    if (target < 0 || target >= branch.subs.length) return;
    const nextSubs = [...branch.subs];
    [nextSubs[si], nextSubs[target]] = [nextSubs[target], nextSubs[si]];
    const nextBranches = tree.branches.map((b, idx) =>
      idx === bi ? { ...b, subs: nextSubs } : b
    );
    onChange({ ...tree, branches: nextBranches });
  };

  const applyQuickPaste = () => {
    if (!quickPasteText.trim()) return;
    const parsed = parseQuickPasteBranchTree(quickPasteText);
    onChange(parsed);
    setShowQuickPaste(false);
    setQuickPasteText('');
  };

  return (
    <section className="space-y-3" aria-label="التفرّع">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-4 h-4 text-sky-400 shrink-0" />
          <h2 className="text-xs font-bold text-slate-200">التفرّع</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {stats.totalNodes} / {MAX_BRANCH_TOTAL_NODES} عقدة
          </span>
          <button
            type="button"
            onClick={() => setShowQuickPaste((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
              showQuickPaste
                ? 'bg-sky-500/20 border-sky-400/60 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <ClipboardPaste className="w-3 h-3" />
            لصق سريع
          </button>
        </div>
      </div>

      {showQuickPaste && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            السطر الأول = النقطة الرئيسية، الأسطر العادية = فروع (2–6)، الأسطر التي تبدأ بـ{' '}
            <code className="text-sky-300">-</code> أو مسافة بادئة = نقاط فرعية للفرع السابق.
          </p>
          <textarea
            dir="auto"
            rows={6}
            value={quickPasteText}
            onChange={(e) => setQuickPasteText(e.target.value)}
            placeholder={`النجاح\nالتخطيط *الاستراتيجي*\n- تحديد أهداف واضحة\n- ترتيب الأولويات اليومية\nالاستمرارية والتطوير\n- التعلم من التجارب`}
            className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowQuickPaste(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={applyQuickPaste}
              disabled={!quickPasteText.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 whitespace-nowrap"
            >
              تطبيق الشجرة
            </button>
          </div>
        </div>
      )}

      {/* Root Input */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <label htmlFor="branch-root-input" className="font-semibold text-slate-300">
            النقطة الرئيسية (الأصل)
          </label>
          <span className="tabular-nums">{stats.rootWords} / 6 كلمات</span>
        </div>
        <input
          id="branch-root-input"
          type="text"
          dir="auto"
          value={tree.root}
          onChange={(e) => updateRoot(e.target.value)}
          placeholder="مثال: النجاح"
          className="w-full rounded-lg bg-slate-900 border border-slate-700/80 px-3 py-2 text-xs font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
        />
        <p className="text-[10px] text-slate-500">
          يمكن تمييز كلمة مفتاحية بوضعها بين نجمتين مثل <span className="text-amber-300">*الاستراتيجي*</span> في أي عقدة.
        </p>
      </div>

      {/* Branches Tree List */}
      <div className="space-y-2.5">
        {tree.branches.map((branch, bi) => {
          const canAddSub =
            branch.subs.length < MAX_BRANCH_SUBS &&
            stats.totalNodes < MAX_BRANCH_TOTAL_NODES;
          return (
            <div
              key={branch.id}
              className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-2.5 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-sky-500/15 text-sky-300 text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                  {bi + 1}
                </span>
                <input
                  type="text"
                  dir="auto"
                  value={branch.text}
                  onChange={(e) => updateBranchText(bi, e.target.value)}
                  placeholder={`عنوان الفرع ${bi + 1}`}
                  className="flex-1 min-w-0 rounded-lg bg-slate-950/90 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveBranch(bi, -1)}
                    disabled={bi === 0}
                    title="تحريك للأعلى"
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-25"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBranch(bi, 1)}
                    disabled={bi === tree.branches.length - 1}
                    title="تحريك للأسفل"
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-25"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBranch(bi)}
                    disabled={tree.branches.length <= MIN_BRANCH_BRANCHES}
                    title="حذف الفرع"
                    className="p-1 rounded hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 disabled:opacity-25"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sub-points under this branch */}
              {branch.subs.length > 0 && (
                <div className="pr-4 mr-2 border-r border-slate-800 space-y-1.5">
                  {branch.subs.map((sub, si) => (
                    <div key={sub.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                        {bi + 1}.{si + 1}
                      </span>
                      <input
                        type="text"
                        dir="auto"
                        value={sub.text}
                        onChange={(e) => updateSubText(bi, si, e.target.value)}
                        placeholder={`نقطة فرعية ${si + 1}`}
                        className="flex-1 min-w-0 rounded-md bg-slate-950/70 border border-slate-800/80 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                      />
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveSub(bi, si, -1)}
                          disabled={si === 0}
                          title="تحريك للأعلى"
                          className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSub(bi, si, 1)}
                          disabled={si === branch.subs.length - 1}
                          title="تحريك للأسفل"
                          className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSub(bi, si)}
                          title="حذف النقطة الفرعية"
                          className="p-1 rounded hover:bg-rose-500/15 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => addSub(bi)}
                  disabled={!canAddSub}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 disabled:opacity-35 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  إضافة نقطة فرعية ({branch.subs.length}/{MAX_BRANCH_SUBS})
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addBranch}
          disabled={!canAddBranch}
          className="w-full py-2 rounded-xl border border-dashed border-slate-700 hover:border-sky-500/60 hover:bg-sky-500/5 text-xs font-semibold text-slate-300 hover:text-sky-300 disabled:opacity-35 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة فرع رئيسي ({tree.branches.length}/{MAX_BRANCH_BRANCHES})
        </button>
      </div>

      {/* Soft Arabic warnings */}
      {stats.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 space-y-1">
          {stats.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

interface BranchingStyleControlsProps {
  activeStyleId: BranchStyleId;
  activeStyleMeta: StyleMetadata;
  branchData: BranchTreeData;
  branchLayout: BranchLayoutMode;
  branchCamera: BranchCameraMode;
  branchCameraZoom: number;
  branchHighlightCurrent: boolean;
  branchTreeTheme: BranchTreeTheme;
  branchMetroPalette: BranchMetroPalette;
  branchTiming: BranchTimingConfig;
  onChangeLayout: (layout: BranchLayoutMode) => void;
  onChangeCamera: (cam: BranchCameraMode) => void;
  onChangeCameraZoom: (zoom: number) => void;
  onChangeHighlightCurrent: (val: boolean) => void;
  onChangeTreeTheme: (theme: BranchTreeTheme) => void;
  onChangeMetroPalette: (palette: BranchMetroPalette) => void;
  onChangeTiming: (next: BranchTimingConfig) => void;
}

const LAYOUT_LABELS: Record<BranchLayoutMode, string> = {
  auto: 'تلقائي',
  radial: 'شعاعي',
  horizontal: 'أفقي (من اليمين)',
  vertical: 'عمودي',
};

const CAMERA_OPTIONS: { id: BranchCameraMode; label: string }[] = [
  { id: 'follow', label: 'تتبع' },
  { id: 'auto', label: 'تلقائي' },
  { id: 'off', label: 'إيقاف' },
];

const TREE_THEME_OPTIONS: { id: BranchTreeTheme; label: string; dot: string }[] = [
  { id: 'spring', label: 'ربيعي', dot: '#FF9EC4' },
  { id: 'autumn', label: 'خريفي', dot: '#F28C28' },
  { id: 'night', label: 'ليلي', dot: '#6FD3FF' },
  { id: 'night-spring', label: 'ربيعي ليلي', dot: '#FFC857' },
];

const METRO_PALETTE_OPTIONS: { id: BranchMetroPalette; label: string; dot: string }[] = [
  { id: 'neon', label: 'نيون', dot: '#22D3EE' },
  { id: 'pastel', label: 'باستيل', dot: '#C4B5FD' },
  { id: 'duotone', label: 'ثنائي اللون', dot: '#F472B6' },
];

export const BranchingStyleControls: React.FC<BranchingStyleControlsProps> = ({
  activeStyleId,
  activeStyleMeta,
  branchData,
  branchLayout,
  branchCamera,
  branchCameraZoom,
  branchHighlightCurrent,
  branchTreeTheme,
  branchMetroPalette,
  branchTiming,
  onChangeLayout,
  onChangeCamera,
  onChangeCameraZoom,
  onChangeHighlightCurrent,
  onChangeTreeTheme,
  onChangeMetroPalette,
  onChangeTiming,
}) => {
  const timing = branchTiming || DEFAULT_BRANCH_TIMING;
  const cameraActive = branchCamera === 'follow';
  const schedule = useMemo(
    () => computeBranchSchedule(branchData, timing, { cameraActive }),
    [branchData, timing, cameraActive]
  );

  const supportedLayouts = activeStyleMeta.supportedBranchLayouts || [
    'auto',
    'radial',
    'horizontal',
    'vertical',
  ];

  return (
    <div className="space-y-3.5 pt-2 border-t border-slate-800/80">
      {/* Layout Selector (when style allows switching layouts) */}
      {!activeStyleMeta.hideBranchLayoutSelector && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">التخطيط</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {supportedLayouts.map((layoutId) => {
              const active = branchLayout === layoutId;
              return (
                <button
                  key={layoutId}
                  type="button"
                  onClick={() => onChangeLayout(layoutId)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {LAYOUT_LABELS[layoutId]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Tree Theme selector (only for br_tree) */}
      {activeStyleId === 'br_tree' && (
        <div className="space-y-1.5" data-testid="branch-tree-theme-selector">
          <span className="text-xs font-semibold text-slate-300 block">الثيم</span>
          <div className="grid grid-cols-2 gap-1.5">
            {TREE_THEME_OPTIONS.map((opt) => {
              const active = branchTreeTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`branch-tree-theme-${opt.id}`}
                  onClick={() => onChangeTreeTheme(opt.id)}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.dot }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Metro Color Palette selector (only for br_metro) */}
      {activeStyleId === 'br_metro' && (
        <div className="space-y-1.5" data-testid="branch-metro-palette-selector">
          <span className="text-xs font-semibold text-slate-300 block">لوحة الألوان</span>
          <div className="grid grid-cols-3 gap-1.5">
            {METRO_PALETTE_OPTIONS.map((opt) => {
              const active = branchMetroPalette === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`branch-metro-palette-${opt.id}`}
                  onClick={() => onChangeMetroPalette(opt.id)}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.dot }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Highlight current branch toggle */}
      <label className="flex items-center justify-between gap-2 cursor-pointer py-1">
        <span className="text-xs font-semibold text-slate-300">تمييز الفرع الحالي</span>
        <input
          type="checkbox"
          checked={branchHighlightCurrent}
          onChange={(e) => onChangeHighlightCurrent(e.target.checked)}
          className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
        />
      </label>

      {/* Camera selector & zoom */}
      <div className="space-y-2" data-testid="branch-camera-controls">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">الكاميرا</span>
          <span className="text-[10px] text-slate-500">
            {branchCamera === 'follow'
              ? 'تركيز على كل فرع مع نقاطه الفرعية'
              : branchCamera === 'auto'
                ? 'تتبع تلقائي عند صِغر النص فقط'
                : 'كادر ثابت كامل الشجرة'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {CAMERA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`branch-camera-${opt.id}`}
              onClick={() => onChangeCamera(opt.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                branchCamera === opt.id
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {branchCamera !== 'off' && (
          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>تقريب الكاميرا (Zoom)</span>
              <span dir="ltr" className="text-sky-400 font-semibold tabular-nums">
                {branchCameraZoom.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              data-testid="branch-camera-zoom-slider"
              min={1.1}
              max={1.8}
              step={0.05}
              value={branchCameraZoom}
              onChange={(e) => onChangeCameraZoom(parseFloat(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Timing Sliders */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200">توقيت التفرّع</span>
          <span className="text-xs font-bold text-sky-400 tabular-nums">
            المدة الكلية: {schedule.totalDuration.toFixed(1)}ث
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>فاصل الفروع الرئيسية</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {timing.branchInterval.toFixed(1)} ث
            </span>
          </div>
          <input
            type="range"
            min={0.8}
            max={3.0}
            step={0.1}
            value={timing.branchInterval}
            onChange={(e) =>
              onChangeTiming({ ...timing, branchInterval: parseFloat(e.target.value) })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>فاصل النقاط الفرعية</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {timing.subInterval.toFixed(1)} ث
            </span>
          </div>
          <input
            type="range"
            min={0.3}
            max={1.5}
            step={0.1}
            value={timing.subInterval}
            onChange={(e) =>
              onChangeTiming({ ...timing, subInterval: parseFloat(e.target.value) })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>ثبات النهاية</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {timing.endHold.toFixed(1)} ث
            </span>
          </div>
          <input
            type="range"
            min={1.0}
            max={6.0}
            step={0.2}
            value={timing.endHold}
            onChange={(e) =>
              onChangeTiming({ ...timing, endHold: parseFloat(e.target.value) })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
          <span>دخول ثابت: 0.6 ث</span>
          <span>خروج ثابت: 0.6 ث</span>
        </div>

        {schedule.holdExtended && schedule.extendedReasonAr && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            {schedule.extendedReasonAr}
          </p>
        )}
      </div>
    </div>
  );
};
