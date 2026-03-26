'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FitText from './FitText';
import MobileFundCardDrawer from './MobileFundCardDrawer';
import MobileSettingModal from './MobileSettingModal';
import { DragIcon, ExitIcon, SettingsIcon, SortIcon, StarIcon } from './Icons';
import { fetchRelatedSectors } from '@/app/api/fund';

const MOBILE_NON_FROZEN_COLUMN_IDS = [
  'relatedSector',
  'yesterdayChangePercent',
  'estimateChangePercent',
  'totalChangePercent',
  'holdingDays',
  'todayProfit',
  'holdingProfit',
  'latestNav',
  'estimateNav',
];
const MOBILE_COLUMN_HEADERS = {
  relatedSector: '关联板块',
  latestNav: '最新净值',
  estimateNav: '估算净值',
  yesterdayChangePercent: '昨日涨幅',
  estimateChangePercent: '估值涨幅',
  totalChangePercent: '估算收益',
  holdingDays: '持有天数',
  todayProfit: '当日收益',
  holdingProfit: '持有收益',
};
const MOBILE_LOCAL_SORT_KEYS = new Set(['latestNav', 'estimateNav', 'holdingDays', 'todayProfit']);

const RowSortableContext = createContext(null);

function SortableRow({ row, children, isTableDragging, disabled }) {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: row.original.code, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, opacity: 0.8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      className="table-row-wrapper"
      style={{ ...style, position: 'relative' }}
      {...attributes}
    >
      <RowSortableContext.Provider value={{ setActivatorNodeRef, listeners }}>
        {typeof children === 'function' ? children(setActivatorNodeRef, listeners) : children}
      </RowSortableContext.Provider>
    </div>
  );
}

/**
 * 移动端基金列表表格组件（基于 @tanstack/react-table，与 PcFundTable 相同数据结构）
 *
 * @param {Object} props - 与 PcFundTable 一致
 * @param {Array<Object>} props.data - 表格数据（与 pcFundTableData 同结构）
 * @param {(row: any) => void} [props.onRemoveFund] - 删除基金
 * @param {string} [props.currentTab] - 当前分组
 * @param {Set<string>} [props.favorites] - 自选集合
 * @param {(row: any) => void} [props.onToggleFavorite] - 添加/取消自选
 * @param {(row: any) => void} [props.onRemoveFromGroup] - 从当前分组移除
 * @param {(row: any, meta: { hasHolding: boolean }) => void} [props.onHoldingAmountClick] - 点击持仓金额
 * @param {boolean} [props.refreshing] - 是否刷新中
 * @param {string} [props.sortBy] - 排序方式，'default' 时长按行触发拖拽排序
 * @param {(oldIndex: number, newIndex: number) => void} [props.onReorder] - 拖拽排序回调
 * @param {(row: any) => Object} [props.getFundCardProps] - 给定行返回 FundCard 的 props；传入后点击基金名称将用底部弹框展示卡片视图
 * @param {boolean} [props.masked] - 是否隐藏持仓相关金额
 */
export default function MobileFundTable({
  data = [],
  onRemoveFund,
  currentTab,
  favorites = new Set(),
  onToggleFavorite,
  onRemoveFromGroup,
  onHoldingAmountClick,
  onHoldingProfitClick, // 保留以兼容调用方，表格内已不再使用点击切换
  refreshing = false,
  sortBy = 'default',
  sortOrder = 'desc',
  onSortChange,
  onReorder,
  onCustomSettingsChange,
  stickyTop = 0,
  viewMode = 'list',
  onViewModeChange,
  getFundCardProps,
  blockDrawerClose = false,
  closeDrawerRef,
  masked = false,
  scrollSyncRef,
}) {
  const [isNameSortMode, setIsNameSortMode] = useState(false);

  // 排序模式下拖拽手柄无需长按，直接拖动即可；非排序模式长按整行触发拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isNameSortMode ? { delay: 0, tolerance: 5 } : { delay: 400, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);
  const ignoreNextDrawerCloseRef = useRef(false);

  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);

  useEffect(() => {
    if (closeDrawerRef) {
      closeDrawerRef.current = () => setCardSheetRow(null);
      return () => { closeDrawerRef.current = null; };
    }
  }, [closeDrawerRef]);

  useEffect(() => {
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFromGroupRef.current = onRemoveFromGroup;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
  }, [
    onToggleFavorite,
    onRemoveFromGroup,
    onHoldingAmountClick,
  ]);

  const handleDragStart = (e) => setActiveId(e.active.id);
  const handleDragCancel = () => setActiveId(null);
  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (active && over && active.id !== over.id && onReorder) {
      const oldIndex = data.findIndex((item) => item.code === active.id);
      const newIndex = data.findIndex((item) => item.code === over.id);
      if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
    }
    setActiveId(null);
  };

  const groupKey = currentTab ?? 'all';

  const getCustomSettingsWithMigration = () => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return {};
      if (parsed.pcTableColumnOrder != null || parsed.pcTableColumnVisibility != null || parsed.pcTableColumns != null || parsed.mobileTableColumnOrder != null || parsed.mobileTableColumnVisibility != null) {
        const all = {
          ...(parsed.all && typeof parsed.all === 'object' ? parsed.all : {}),
          pcTableColumnOrder: parsed.pcTableColumnOrder,
          pcTableColumnVisibility: parsed.pcTableColumnVisibility,
          pcTableColumns: parsed.pcTableColumns,
          mobileTableColumnOrder: parsed.mobileTableColumnOrder,
          mobileTableColumnVisibility: parsed.mobileTableColumnVisibility,
        };
        delete parsed.pcTableColumnOrder;
        delete parsed.pcTableColumnVisibility;
        delete parsed.pcTableColumns;
        delete parsed.mobileTableColumnOrder;
        delete parsed.mobileTableColumnVisibility;
        parsed.all = all;
        window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return {};
    }
  };

  const getInitialMobileConfigByGroup = () => {
    const parsed = getCustomSettingsWithMigration();
    const byGroup = {};
    Object.keys(parsed).forEach((k) => {
      if (k === 'pcContainerWidth') return;
      const group = parsed[k];
      if (!group || typeof group !== 'object') return;
      const order = Array.isArray(group.mobileTableColumnOrder) && group.mobileTableColumnOrder.length > 0
        ? group.mobileTableColumnOrder
        : null;
      const visibility = group.mobileTableColumnVisibility && typeof group.mobileTableColumnVisibility === 'object'
        ? group.mobileTableColumnVisibility
        : null;
      byGroup[k] = {
        mobileTableColumnOrder: order ? (() => {
          const valid = order.filter((id) => MOBILE_NON_FROZEN_COLUMN_IDS.includes(id));
          const missing = MOBILE_NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
          return [...valid, ...missing];
        })() : null,
        mobileTableColumnVisibility: visibility,
        mobileShowFullFundName: group.mobileShowFullFundName === true,
      };
    });
    return byGroup;
  };

  const [configByGroup, setConfigByGroup] = useState(getInitialMobileConfigByGroup);

  const currentGroupMobile = configByGroup[groupKey];
  const showFullFundName = currentGroupMobile?.mobileShowFullFundName ?? false;
  const defaultOrder = [...MOBILE_NON_FROZEN_COLUMN_IDS];
  const defaultVisibility = (() => {
    const o = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => { o[id] = true; });
    // 新增列：默认隐藏（用户可在表格设置中开启）
    o.relatedSector = false;
    o.holdingDays = false;
    return o;
  })();

  const mobileColumnOrder = (() => {
    const order = currentGroupMobile?.mobileTableColumnOrder ?? defaultOrder;
    if (!Array.isArray(order) || order.length === 0) return [...MOBILE_NON_FROZEN_COLUMN_IDS];
    const valid = order.filter((id) => MOBILE_NON_FROZEN_COLUMN_IDS.includes(id));
    const missing = MOBILE_NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  })();
  const mobileColumnVisibility = (() => {
    const vis = currentGroupMobile?.mobileTableColumnVisibility ?? null;
    if (vis && typeof vis === 'object' && Object.keys(vis).length > 0) {
      const next = { ...vis };
      if (next.relatedSector === undefined) next.relatedSector = false;
      if (next.holdingDays === undefined) next.holdingDays = false;
      return next;
    }
    return defaultVisibility;
  })();

  const persistMobileGroupConfig = (updates) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.mobileTableColumnOrder !== undefined) group.mobileTableColumnOrder = updates.mobileTableColumnOrder;
      if (updates.mobileTableColumnVisibility !== undefined) group.mobileTableColumnVisibility = updates.mobileTableColumnVisibility;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], ...updates } }));
      onCustomSettingsChange?.();
    } catch {}
  };

  const setMobileColumnOrder = (nextOrderOrUpdater) => {
    const next = typeof nextOrderOrUpdater === 'function'
      ? nextOrderOrUpdater(mobileColumnOrder)
      : nextOrderOrUpdater;
    persistMobileGroupConfig({ mobileTableColumnOrder: next });
  };
  const setMobileColumnVisibility = (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(mobileColumnVisibility)
      : nextOrUpdater;
    persistMobileGroupConfig({ mobileTableColumnVisibility: next });
  };

  const persistShowFullFundName = (show) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      group.mobileShowFullFundName = show;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({
        ...prev,
        [groupKey]: { ...prev[groupKey], mobileShowFullFundName: show }
      }));
      onCustomSettingsChange?.();
    } catch {}
  };

  const handleToggleShowFullFundName = (show) => {
    persistShowFullFundName(show);
  };

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [mobileLocalSort, setMobileLocalSort] = useState({ sortBy: 'default', sortOrder: 'desc' });

  const effectiveSortBy = MOBILE_LOCAL_SORT_KEYS.has(mobileLocalSort.sortBy) ? mobileLocalSort.sortBy : sortBy;
  const effectiveSortOrder = MOBILE_LOCAL_SORT_KEYS.has(mobileLocalSort.sortBy) ? mobileLocalSort.sortOrder : sortOrder;

  const toggleSort = (nextSortBy) => {
    if (!nextSortBy) return;

    if (MOBILE_LOCAL_SORT_KEYS.has(nextSortBy)) {
      if (mobileLocalSort.sortBy !== nextSortBy) {
        setMobileLocalSort({ sortBy: nextSortBy, sortOrder: 'desc' });
        return;
      }
      if (mobileLocalSort.sortOrder === 'desc') {
        setMobileLocalSort({ sortBy: nextSortBy, sortOrder: 'asc' });
        return;
      }
      setMobileLocalSort({ sortBy: 'default', sortOrder: 'desc' });
      return;
    }

    if (!onSortChange) return;

    if (sortBy !== nextSortBy) {
      setMobileLocalSort({ sortBy: 'default', sortOrder: 'desc' });
      onSortChange(nextSortBy, 'desc');
      return;
    }
    if (sortOrder === 'desc') {
      onSortChange(nextSortBy, 'asc');
      return;
    }
    onSortChange('default', 'desc');
  };

  const renderSortLabel = useCallback((label, sortKey, align = 'left') => {
    const active = effectiveSortBy === sortKey;
    return (
      <button
        type="button"
        className={`mobile-header-sort ${active ? 'active' : ''} ${align === 'right' ? 'align-right' : ''}`}
        onClick={(e) => {
          e.stopPropagation?.();
          toggleSort(sortKey);
        }}
      >
        <span>{label}</span>
        <span className="mobile-header-sort-arrows" aria-hidden="true">
          <span style={{ opacity: active && effectiveSortOrder === 'asc' ? 1 : 0.32 }}>▲</span>
          <span style={{ opacity: active && effectiveSortOrder === 'desc' ? 1 : 0.32 }}>▼</span>
        </span>
      </button>
    );
  }, [effectiveSortBy, effectiveSortOrder, toggleSort]);

  useEffect(() => {
    if (effectiveSortBy !== 'default') setIsNameSortMode(false);
  }, [effectiveSortBy]);

  // 排序模式下，点击页面任意区域（含表格外）退出排序；使用冒泡阶段，避免先于排序按钮处理
  useEffect(() => {
    if (!isNameSortMode) return;
    const onDocClick = () => setIsNameSortMode(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [isNameSortMode]);

  const [cardSheetRow, setCardSheetRow] = useState(null);
  const tableContainerRef = useRef(null);
  const portalHeaderRef = useRef(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showPortalHeader, setShowPortalHeader] = useState(false);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const updateWidth = () => setTableContainerWidth(el.clientWidth || 0);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    const handleScroll = () => {
      setIsScrolled(tableEl.scrollLeft > 0);

      if (scrollSyncRef?.current) {
        scrollSyncRef.current.scrollLeft = tableEl.scrollLeft;
      }

      const portalEl = portalHeaderRef.current;
      if (!portalEl) return;
      if (Math.abs(portalEl.scrollLeft - tableEl.scrollLeft) <= 1) return;
      portalEl.scrollLeft = tableEl.scrollLeft;
    };

    handleScroll();
    tableEl.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      tableEl.removeEventListener('scroll', handleScroll);
    };
  }, [scrollSyncRef]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePortalHeaderVisibility = () => {
      const tableEl = tableContainerRef.current;
      if (!tableEl) {
        setShowPortalHeader(false);
        return;
      }

      const rect = tableEl.getBoundingClientRect();
      const headerHeight = 42;
      const shouldShow = rect.top <= stickyTop && rect.bottom > stickyTop + headerHeight;
      setShowPortalHeader(shouldShow);
    };

    updatePortalHeaderVisibility();
    window.addEventListener('scroll', updatePortalHeaderVisibility, { passive: true });
    window.addEventListener('resize', updatePortalHeaderVisibility, { passive: true });

    return () => {
      window.removeEventListener('scroll', updatePortalHeaderVisibility);
      window.removeEventListener('resize', updatePortalHeaderVisibility);
    };
  }, [stickyTop, data.length, sortBy, sortOrder, mobileColumnOrder, mobileColumnVisibility]);

  useEffect(() => {
    const portalEl = portalHeaderRef.current;
    const tableEl = tableContainerRef.current;
    if (!portalEl || !tableEl) return;

    if (Math.abs(portalEl.scrollLeft - tableEl.scrollLeft) > 1) {
      portalEl.scrollLeft = tableEl.scrollLeft;
    }

    return () => {
    };
  }, [scrollSyncRef, showPortalHeader]);

  const NAME_CELL_WIDTH = 148;
  const GAP = 0;
  const LAST_COLUMN_EXTRA = 2;
  const METRICS_PADDING_LEFT = 8;
  const FALLBACK_WIDTHS = {
    fundName: 140,
    relatedSector: 120,
    latestNav: 76,
    estimateNav: 76,
    yesterdayChangePercent: 72,
    estimateChangePercent: 72,
    totalChangePercent: 72,
    holdingDays: 64,
    todayProfit: 72,
    holdingProfit: 72,
  };

  const relatedSectorEnabled = mobileColumnVisibility?.relatedSector !== false;
  const relatedSectorCacheRef = useRef(new Map());
  const [relatedSectorByCode, setRelatedSectorByCode] = useState({});

  const fetchRelatedSector = async (code) => fetchRelatedSectors(code);

  const runWithConcurrency = async (items, limit, worker) => {
    const queue = [...items];
    const runners = Array.from({ length: Math.max(1, limit) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item == null) continue;
         
        await worker(item);
      }
    });
    await Promise.all(runners);
  };

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const codes = Array.from(new Set(data.map((d) => d?.code).filter(Boolean)));
    const missing = codes.filter((code) => !relatedSectorCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      await runWithConcurrency(missing, 4, async (code) => {
        const value = await fetchRelatedSector(code);
        relatedSectorCacheRef.current.set(code, value);
        if (cancelled) return;
        setRelatedSectorByCode((prev) => {
          if (prev[code] === value) return prev;
          return { ...prev, [code]: value };
        });
      });
    })();

    return () => { cancelled = true; };
  }, [relatedSectorEnabled, data]);

  const columnWidthMap = useMemo(() => {
    const visibleNonNameIds = mobileColumnOrder.filter((id) => mobileColumnVisibility[id] !== false);
    const nonNameCount = visibleNonNameIds.length;
    if (tableContainerWidth > 0 && nonNameCount > 0) {
      const gapTotal = nonNameCount >= 3 ? 3 * GAP : nonNameCount * GAP;
      const available = tableContainerWidth - NAME_CELL_WIDTH - gapTotal - LAST_COLUMN_EXTRA;
      const map = { fundName: NAME_CELL_WIDTH };

      visibleNonNameIds.forEach((id) => {
        map[id] = FALLBACK_WIDTHS[id] ?? 64;
      });

      const minRequired = visibleNonNameIds.reduce((sum, id) => sum + (map[id] ?? 0), 0);
      if (available > minRequired) {
        const extraPerColumn = Math.floor((available - minRequired) / nonNameCount);
        visibleNonNameIds.forEach((id) => {
          map[id] += extraPerColumn;
        });
      }

      MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
        if (map[id] == null) map[id] = FALLBACK_WIDTHS[id] ?? 64;
      });

      return map;
    }
    return { ...FALLBACK_WIDTHS };
  }, [tableContainerWidth, mobileColumnOrder, mobileColumnVisibility, FALLBACK_WIDTHS]);

  const handleResetMobileColumnOrder = () => {
    setMobileColumnOrder([...MOBILE_NON_FROZEN_COLUMN_IDS]);
  };
  const handleResetMobileColumnVisibility = () => {
    const allVisible = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = true;
    });
    allVisible.relatedSector = false;
    allVisible.holdingDays = false;
    setMobileColumnVisibility(allVisible);
  };
  const handleToggleMobileColumnVisibility = (columnId, visible) => {
    setMobileColumnVisibility((prev = {}) => ({ ...prev, [columnId]: visible }));
  };

  // 移动端名称列：无拖拽把手，长按整行触发排序；点击名称可打开底部卡片弹框（需传入 getFundCardProps）
  // 当 isNameSortMode 且 sortBy==='default' 时，左侧显示排序/拖拽图标，可拖动行排序
  const MobileFundNameCell = ({ info, showFullFundName, onOpenCardSheet, isNameSortMode: nameSortMode, sortBy: currentSortBy }) => {
    const original = info.row.original || {};
    const fundName = info.getValue() ?? '—';
    const code = original.code;
    const isUpdated = original.isUpdated;
    const hasDca = original.hasDca;
    const hasHoldingAmount = original.holdingAmountValue != null;
    const holdingAmountDisplay = hasHoldingAmount ? (original.holdingAmount ?? '—') : null;
    const isFavorites = favorites?.has?.(code);
    const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';
    const rowSortable = useContext(RowSortableContext);
    const showDragHandle = nameSortMode && currentSortBy === 'default' && rowSortable;

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showDragHandle ? (
          <span
            ref={rowSortable.setActivatorNodeRef}
            className="icon-button fav-button"
            title="拖动排序"
            style={{ backgroundColor: 'transparent', touchAction: 'none', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={(e) => e.stopPropagation()}
            {...rowSortable.listeners}
          >
            <DragIcon width="18" height="18" />
          </span>
        ) : isGroupTab ? (
          <button
            className="icon-button fav-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onRemoveFromGroupRef.current?.(original);
            }}
            title="从当前分组移除"
            style={{ backgroundColor: 'transparent'}}
          >
            <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
          </button>
        ) : (
          <button
            className={`icon-button fav-button ${isFavorites ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation?.();
              onToggleFavoriteRef.current?.(original);
            }}
            title={isFavorites ? '取消自选' : '添加自选'}
            style={{ backgroundColor: 'transparent'}}
          >
            <StarIcon width="18" height="18" filled={isFavorites} />
          </button>
        )}
        <div className="title-text">
          <span
            className={`name-text ${showFullFundName ? 'show-full' : ''}`}
            title={isUpdated ? '今日净值已更新' : onOpenCardSheet ? '点击查看卡片' : ''}
            role={onOpenCardSheet ? 'button' : undefined}
            tabIndex={onOpenCardSheet ? 0 : undefined}
            style={{
              fontSize: '12px',
              ...(onOpenCardSheet ? { cursor: 'pointer' } : {}),
            }}
            onClick={(e) => {
              if (onOpenCardSheet) {
                e.stopPropagation?.();
                onOpenCardSheet(original);
              }
            }}
            onKeyDown={(e) => {
              if (onOpenCardSheet && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onOpenCardSheet(original);
              }
            }}
          >
            {fundName}
          </span>
          {holdingAmountDisplay ? (
            <span
              className={`code-text ${isUpdated ? 'holding-amount-updated' : 'muted'}`}
              role="button"
              tabIndex={0}
              title="点击设置持仓"
              style={{
                cursor: 'pointer',
                color: isUpdated ? 'var(--primary)' : undefined,
                fontWeight: isUpdated ? 600 : undefined,
              }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }
              }}
            >
              {masked ? <span className="mask-text">******</span> : holdingAmountDisplay}
              {hasDca && <span className="dca-indicator">定</span>}
            </span>
          ) : code ? (
            <span
              className="muted code-text"
              role="button"
              tabIndex={0}
              title="设置持仓"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: false });
                }
              }}
            >
              #{code}
              {hasDca && <span className="dca-indicator">定</span>}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'fundName',
        header: () => (
          <div className="mobile-fund-header-name-wrap">
            <div className="mobile-fund-header-tools">
              <button
                type="button"
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation?.();
                  setSettingModalOpen(true);
                }}
                title="个性化设置"
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  minWidth: '28px',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SettingsIcon width="15" height="15" />
              </button>
              {sortBy === 'default' && (
                <button
                  type="button"
                  className={`icon-button ${isNameSortMode ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation?.();
                    setIsNameSortMode((prev) => !prev);
                  }}
                  title={isNameSortMode ? '退出排序' : '拖动排序'}
                  style={{
                    border: 'none',
                    width: '28px',
                    height: '28px',
                    minWidth: '28px',
                    backgroundColor: 'transparent',
                    color: isNameSortMode ? 'var(--primary)' : 'var(--text)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SortIcon width="15" height="15" />
                </button>
              )}
            </div>
            <div className="mobile-fund-header-title">
              {renderSortLabel('基金名称', 'name')}
            </div>
          </div>
        ),
        cell: (info) => (
          <MobileFundNameCell
            info={info}
            showFullFundName={showFullFundName}
            onOpenCardSheet={getFundCardProps ? (row) => setCardSheetRow(row) : undefined}
            isNameSortMode={isNameSortMode}
            sortBy={effectiveSortBy}
          />
        ),
        meta: { align: 'left', cellClassName: 'name-cell', width: columnWidthMap.fundName },
      },
      {
        id: 'relatedSector',
        header: '关联板块',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = (code && (relatedSectorByCode?.[code] ?? relatedSectorCacheRef.current.get(code))) || '';
          const display = value || '—';
          return (
            <div style={{ width: '100%', textAlign: value ? 'left' : 'right', fontSize: '12px' }}>
              {display}
            </div>
          );
        },
        meta: { align: 'left', cellClassName: 'related-sector-cell', width: columnWidthMap.relatedSector ?? 120 },
      },
      {
        accessorKey: 'latestNav',
        header: () => renderSortLabel('最新净值', 'latestNav', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const date = original.latestNavDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span style={{ display: 'block', width: '100%', fontWeight: 600 }}>
                <FitText maxFontSize={12} minFontSize={9}>
                  {info.getValue() ?? '—'}
                </FitText>
              </span>
              <span className="muted" style={{ fontSize: '9px' }}>{displayDate}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.latestNav },
      },
      {
        accessorKey: 'estimateNav',
        header: () => renderSortLabel('估算净值', 'estimateNav', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const date = original.estimateNavDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          const estimateNav = info.getValue();
          const hasEstimateNav = estimateNav != null && estimateNav !== '—';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span style={{ display: 'block', width: '100%', fontWeight: 600 }}>
                <FitText maxFontSize={12} minFontSize={9}>
                  {estimateNav ?? '—'}
                </FitText>
              </span>
              {hasEstimateNav && displayDate && displayDate !== '-' ? (
                <span className="muted" style={{ fontSize: '9px' }}>{displayDate}</span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.estimateNav },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: () => renderSortLabel('昨日涨幅', 'yesterdayIncrease', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const date = original.yesterdayDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 600, fontSize: '12px' }}>
                {info.getValue() ?? '—'}
              </span>
              <span className="muted" style={{ fontSize: '9px' }}>{displayDate}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'change-cell', width: columnWidthMap.yesterdayChangePercent },
      },
      {
        accessorKey: 'estimateChangePercent',
        header: () => renderSortLabel('估值涨幅', 'yield', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const time = original.estimateTime ?? '-';
          const displayTime = typeof time === 'string' && time.length > 5 ? time.slice(5) : time;
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = info.getValue();
          const hasText = text != null && text !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 600, fontSize: '12px' }}>
                {text ?? '—'}
              </span>
              {hasText && displayTime && displayTime !== '-' ? (
                <span className="muted" style={{ fontSize: '9px' }}>{displayTime}</span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'est-change-cell', width: columnWidthMap.estimateChangePercent },
      },
      {
        accessorKey: 'totalChangePercent',
        header: () => renderSortLabel('估算收益', 'estimateProfit', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (original.estimateProfit ?? '') : '—';
          const percentStr = original.estimateProfitPercent ?? '';

          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 600 }}>
                <FitText maxFontSize={12} minFontSize={6}>
                  {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {hasProfit && percentStr && !masked ? (
                <span className={`${cls} estimate-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.7em', opacity: 0.88, fontWeight: 500 }}>
                  <FitText maxFontSize={10} minFontSize={6}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'total-change-cell', width: columnWidthMap.totalChangePercent },
      },
      {
        accessorKey: 'holdingDays',
        header: () => renderSortLabel('持有天数', 'holdingDays', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingDaysValue;
          if (value == null) {
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
            <div style={{ fontWeight: 600, textAlign: 'right', fontSize: '12px' }}>
              {value}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-days-cell', width: columnWidthMap.holdingDays ?? 64 },
      },
      {
        accessorKey: 'todayProfit',
        header: () => renderSortLabel('当日收益', 'todayProfit', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.todayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (info.getValue() ?? '') : '—';
          const percentStr = original.todayProfitPercent ?? '';
          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 600 }}>
                <FitText maxFontSize={12} minFontSize={6}>
                  {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {percentStr && !masked ? (
                <span className={`${cls} today-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.7em', opacity: 0.88, fontWeight: 500 }}>
                  <FitText maxFontSize={10} minFontSize={6}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'profit-cell', width: columnWidthMap.todayProfit },
      },
      {
        accessorKey: 'holdingProfit',
        header: () => renderSortLabel('持有收益', 'holding', 'right'),
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingProfitValue;
          const hasTotal = value != null;
          const cls = hasTotal ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasTotal ? (info.getValue() ?? '') : '—';
          const percentStr = original.holdingProfitPercent ?? '';
          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 600 }}>
                <FitText maxFontSize={12} minFontSize={6}>
                  {masked && hasTotal ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {percentStr && !masked ? (
                <span className={`${cls} holding-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.7em', opacity: 0.88, fontWeight: 500 }}>
                  <FitText maxFontSize={10} minFontSize={6}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-cell', width: columnWidthMap.holdingProfit },
      },
    ],
    [currentTab, favorites, refreshing, columnWidthMap, showFullFundName, getFundCardProps, isNameSortMode, effectiveSortBy, relatedSectorByCode, viewMode, onViewModeChange, masked, renderSortLabel]
  );

  const sortedTableData = useMemo(() => {
    if (!Array.isArray(data) || data.length <= 1) return data;

    if (!MOBILE_LOCAL_SORT_KEYS.has(effectiveSortBy)) return data;

    const parseNumber = (value) => {
      if (value == null || value === '') return Number.NaN;
      if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
      const normalized = String(value).replace(/[¥,%\s,]/g, '').replace(/[^\d.+-]/g, '');
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    const getSortValue = (row) => {
      if (effectiveSortBy === 'latestNav') return parseNumber(row?.latestNav);
      if (effectiveSortBy === 'estimateNav') return parseNumber(row?.estimateNav);
      if (effectiveSortBy === 'holdingDays') return parseNumber(row?.holdingDaysValue);
      if (effectiveSortBy === 'todayProfit') return parseNumber(row?.todayProfitValue);
      return Number.NaN;
    };

    return [...data].sort((a, b) => {
      const valA = getSortValue(a);
      const valB = getSortValue(b);
      const hasA = Number.isFinite(valA);
      const hasB = Number.isFinite(valB);

      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;

      return effectiveSortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [data, effectiveSortBy, effectiveSortOrder]);

  const table = useReactTable({
    data: sortedTableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnOrder: ['fundName', ...mobileColumnOrder],
      columnVisibility: { fundName: true, ...mobileColumnVisibility },
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === 'function' ? updater(['fundName', ...mobileColumnOrder]) : updater;
      const newNonFrozen = next.filter((id) => id !== 'fundName');
      if (newNonFrozen.length) {
        setMobileColumnOrder(newNonFrozen);
      }
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ fundName: true, ...mobileColumnVisibility }) : updater;
      const rest = { ...next };
      delete rest.fundName;
      setMobileColumnVisibility(rest);
    },
    initialState: {
      columnPinning: {
        left: ['fundName'],
      },
    },
    defaultColumn: {
      cell: (info) => info.getValue() ?? '—',
    },
  });

  const headerGroup = table.getHeaderGroups()[0];

  const visibleMetricHeaders = headerGroup?.headers?.filter((header) => header.column.id !== 'fundName') ?? [];
  const metricsWidth = visibleMetricHeaders.reduce((sum, header, index) => {
    const width = header.column.columnDef.meta?.width ?? 80;
    const gapWidth = index > 0 ? GAP : 0;
    const trailingWidth = index === visibleMetricHeaders.length - 1 ? LAST_COLUMN_EXTRA : 0;
    return sum + width + gapWidth + trailingWidth;
  }, visibleMetricHeaders.length > 0 ? METRICS_PADDING_LEFT : 0);

  const mobileTableWidth = NAME_CELL_WIDTH + metricsWidth;
  const tableWidthStyle = mobileTableWidth ? { width: `max(100%, ${mobileTableWidth}px)` } : { width: '100%' };

  const getAlignClass = (columnId) => {
    if (columnId === 'fundName') return '';
    if (['latestNav', 'estimateNav', 'yesterdayChangePercent', 'estimateChangePercent', 'totalChangePercent', 'holdingDays', 'todayProfit', 'holdingProfit'].includes(columnId)) return 'text-right';
    return 'text-right';
  };

  const renderTableHeader = ()=>{
    if(!headerGroup) return null;
    const nameHeader = headerGroup.headers.find((header) => header.column.id === 'fundName');
    const metricHeaders = headerGroup.headers.filter((header) => header.column.id !== 'fundName');

    return (
      <div
        className="mobile-fund-flex-row mobile-fund-flex-header-row"
        style={tableWidthStyle}
      >
        <div
          className={`mobile-fund-flex-cell mobile-fund-flex-header-cell mobile-fund-flex-name-cell ${isScrolled ? 'is-scrolled' : ''}`}
          style={{
            width: NAME_CELL_WIDTH,
            minWidth: NAME_CELL_WIDTH,
            maxWidth: NAME_CELL_WIDTH,
          }}
        >
          {nameHeader && !nameHeader.isPlaceholder
            ? flexRender(nameHeader.column.columnDef.header, nameHeader.getContext())
            : null}
        </div>

        <div className="mobile-fund-flex-metrics" style={{ width: metricsWidth || undefined }}>
          {metricHeaders.map((header, headerIndex) => {
            const columnId = header.column.id;
            const alignClass = getAlignClass(columnId);
            const width = header.column.columnDef.meta?.width ?? FALLBACK_WIDTHS[columnId] ?? 80;
            const isLastHeader = headerIndex === metricHeaders.length - 1;

            return (
              <div
                key={header.id}
                className={`mobile-fund-flex-cell mobile-fund-flex-header-cell mobile-fund-flex-metric-cell ${alignClass}`}
                style={{
                  width,
                  minWidth: width,
                  maxWidth: width,
                  paddingRight: isLastHeader ? LAST_COLUMN_EXTRA : undefined,
                }}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            );
          })}
        </div>
      </div>
    )
  }

  const renderContent = (onlyShowHeader) => {
    if (onlyShowHeader) {
      return (
        <div className="mobile-fund-table mobile-fund-table-portal-header" ref={portalHeaderRef} style={{ top: stickyTop }}>
          <div className="mobile-fund-table-scroll" style={tableWidthStyle}>
            {renderTableHeader()}
          </div>
        </div>
      );
    }

    const rows = table.getRowModel().rows;
    const renderRowContent = (row, index, listeners, setActivatorNodeRef) => {
      const visibleCells = row.getVisibleCells();
      const nameCell = visibleCells.find((cell) => cell.column.id === 'fundName');
      const metricCells = visibleCells.filter((cell) => cell.column.id !== 'fundName');
      const rowBackground = index % 2 === 0 ? 'var(--bg)' : 'var(--table-row-alt-bg)';

      return (
        <div
          className="mobile-fund-flex-row"
          style={{ ...tableWidthStyle, background: rowBackground }}
          onClick={() => setIsNameSortMode(false)}
          {...listeners}
        >
          <div
            ref={setActivatorNodeRef}
            className={`mobile-fund-flex-cell mobile-fund-flex-name-cell ${isScrolled ? 'is-scrolled' : ''}`}
            style={{
              width: NAME_CELL_WIDTH,
              minWidth: NAME_CELL_WIDTH,
              maxWidth: NAME_CELL_WIDTH,
              background: rowBackground,
            }}
          >
            {nameCell ? flexRender(nameCell.column.columnDef.cell, nameCell.getContext()) : null}
          </div>

          <div className="mobile-fund-flex-metrics" style={{ width: metricsWidth || undefined }}>
            {metricCells.map((cell, cellIndex) => {
              const columnId = cell.column.id;
              const alignClass = getAlignClass(columnId);
              const cellClassName = cell.column.columnDef.meta?.cellClassName || '';
              const width = cell.column.columnDef.meta?.width ?? FALLBACK_WIDTHS[columnId] ?? 80;
              const isLastCell = cellIndex === metricCells.length - 1;

              return (
                <div
                  key={cell.id}
                  className={`mobile-fund-flex-cell mobile-fund-flex-metric-cell ${alignClass} ${cellClassName}`}
                  style={{
                    width,
                    minWidth: width,
                    maxWidth: width,
                    paddingRight: isLastCell ? LAST_COLUMN_EXTRA : undefined,
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="mobile-fund-table" ref={tableContainerRef}>
        <div
          className="mobile-fund-table-scroll"
          style={tableWidthStyle}
        >
          {renderTableHeader()}

          {!onlyShowHeader && (
            (isNameSortMode ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext
                  items={data.map((item) => item.code)}
                  strategy={verticalListSortingStrategy}
                >
                  {rows.map((row, index) => (
                    <SortableRow
                      key={row.original.code || row.id}
                      row={row}
                      isTableDragging={!!activeId}
                      disabled={sortBy !== 'default'}
                    >
                      {(setActivatorNodeRef, listeners) => (
                        renderRowContent(row, index, listeners, setActivatorNodeRef)
                      )}
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              rows.map((row, index) => (
                <div
                  key={row.original.code || row.id}
                  className="mobile-fund-flex-row-wrapper"
                >
                  {renderRowContent(row, index)}
                </div>
              ))
            ))

          )}
        </div>

        {rows.length === 0 && !onlyShowHeader && (
          <div className="mobile-fund-flex-empty-row">
            <div className="mobile-fund-flex-empty-cell" style={{ textAlign: 'center' }}>
              <span className="muted">暂无数据</span>
            </div>
          </div>
        )}

        {!onlyShowHeader && (
          <MobileSettingModal
            open={settingModalOpen}
            onClose={() => setSettingModalOpen(false)}
            columns={mobileColumnOrder.map((id) => ({ id, header: MOBILE_COLUMN_HEADERS[id] ?? id }))}
            columnVisibility={mobileColumnVisibility}
            onColumnReorder={(newOrder) => {
              setMobileColumnOrder(newOrder);
            }}
            onToggleColumnVisibility={handleToggleMobileColumnVisibility}
            onResetColumnOrder={handleResetMobileColumnOrder}
            onResetColumnVisibility={handleResetMobileColumnVisibility}
            showFullFundName={showFullFundName}
            onToggleShowFullFundName={handleToggleShowFullFundName}
          />
        )}

        <MobileFundCardDrawer
          open={!!(cardSheetRow && getFundCardProps)}
          onOpenChange={(open) => { if (!open) setCardSheetRow(null); }}
          blockDrawerClose={blockDrawerClose}
          ignoreNextDrawerCloseRef={ignoreNextDrawerCloseRef}
          cardSheetRow={cardSheetRow}
          getFundCardProps={getFundCardProps}
        />

        {showPortalHeader && ReactDOM.createPortal(renderContent(true), document.body)}

      </div>
    );
  };

  return (
    <>
      {renderContent()}
    </>
  );
}
