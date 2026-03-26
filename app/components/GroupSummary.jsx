'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { PinIcon, PinOffIcon, EyeIcon, EyeOffIcon, SwitchIcon, CloseIcon, SettingsIcon } from './Icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import FitText from './FitText';

function formatSummaryNumber(value, decimals = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0.00';
  return Math.abs(numericValue).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function trimTrailingZeros(value) {
  return value.replace(/\.0+$|(?<=\.\d*[1-9])0+$/u, '');
}

function formatAssetCompactNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0';

  const sign = numericValue < 0 ? '-' : '';
  const absValue = Math.abs(numericValue);

  if (absValue >= 100000000) {
    return `${sign}${trimTrailingZeros((absValue / 100000000).toFixed(2))}亿`;
  }

  if (absValue >= 10000) {
    return `${sign}${trimTrailingZeros((absValue / 10000).toFixed(2))}万`;
  }

  if (absValue >= 1000) {
    return `${sign}${trimTrailingZeros((absValue / 1000).toFixed(2))}千`;
  }

  return `${sign}${formatSummaryNumber(absValue, 2)}`;
}

function shouldCompactAssetNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return false;
  const integerDigits = Math.trunc(Math.abs(numericValue)).toString().length;
  const totalDigits = integerDigits + 2;
  return totalDigits > 9;
}

function shouldCompactMetricNumber(value, maxDigits = 7, decimals = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return false;
  const integerDigits = Math.trunc(Math.abs(numericValue)).toString().length;
  const totalDigits = integerDigits + decimals;
  return totalDigits > maxDigits;
}

function formatSignedCompactMoney(value, compacted) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0.00';
  if (!compacted) return formatSummaryNumber(numericValue, 2);
  return formatAssetCompactNumber(numericValue);
}

function formatSignedMoneyWithYuan(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '¥0.00';
  const absText = `¥${formatSummaryNumber(Math.abs(numericValue), 2)}`;
  if (numericValue > 0) return `+${absText}`;
  if (numericValue < 0) return `-${absText}`;
  return absText;
}

function formatSignedPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0.00%';
  const absText = `${formatSummaryNumber(Math.abs(numericValue), 2)}%`;
  if (numericValue > 0) return `+${absText}`;
  if (numericValue < 0) return `-${absText}`;
  return absText;
}

// 数字滚动组件（初始化时无动画，后续变更再动画）
function CountUp({ value, prefix = '', suffix = '', decimals = 2, className = '', style = {} }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const isFirstChange = useRef(true);
  const rafIdRef = useRef(null);
  const displayValueRef = useRef(value);

  useEffect(() => {
    if (previousValue.current === value) return;

    if (isFirstChange.current) {
      isFirstChange.current = false;
      previousValue.current = value;
      displayValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const start = displayValueRef.current;
    const end = value;
    const duration = 300;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * ease;
      displayValueRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [value]);

  return (
    <span className={className} style={style}>
      {prefix}
      {formatSummaryNumber(displayValue, decimals)}
      {suffix}
    </span>
  );
}

function AutoFitCountUp({ value, prefix = '', suffix = '', decimals = 2, maxFontSize, minFontSize, className = '', style = {}, fitPadding }) {
  return (
    <FitText
      as="div"
      className={className}
      maxFontSize={maxFontSize}
      minFontSize={minFontSize}
      fitPadding={fitPadding}
      style={{
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        width: '100%',
        maxWidth: '100%',
        ...style,
      }}
    >
      {prefix}
      {formatSummaryNumber(value, decimals)}
      {suffix}
    </FitText>
  );
}

export default function GroupSummary({
  funds,
  holdings,
  groupName,
  getProfit,
  stickyTop,
  isSticky = false,
  onToggleSticky,
  masked,
  onToggleMasked,
  marketIndexAccordionHeight,
  navbarHeight,
  isMobile = false,
  mobileInline = false,
  onHeightChange,
}) {
  const [showPercent, setShowPercent] = useState(true);
  const [showTodayPercent, setShowTodayPercent] = useState(false);
  const [isMasked, setIsMasked] = useState(masked ?? false);
  const rowRef = useRef(null);
  const rootRef = useRef(null);
  const [assetSize, setAssetSize] = useState(24);
  const [metricSize, setMetricSize] = useState(18);
  const [winW, setWinW] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWinW(window.innerWidth);
      const onR = () => setWinW(window.innerWidth);
      window.addEventListener('resize', onR);
      return () => window.removeEventListener('resize', onR);
    }
  }, []);

  // 根据窗口宽度设置基础字号，保证小屏数字不会撑破布局
  useEffect(() => {
    if (!winW) return;

    if (winW <= 360) {
      setAssetSize(18);
      setMetricSize(14);
    } else if (winW <= 414) {
      setAssetSize(22);
      setMetricSize(16);
    } else if (winW <= 768) {
      setAssetSize(24);
      setMetricSize(18);
    } else {
      setAssetSize(26);
      setMetricSize(20);
    }
  }, [winW]);

  useEffect(() => {
    if (typeof masked === 'boolean') {
      setIsMasked(masked);
    }
  }, [masked]);

  const summary = useMemo(() => {
    let totalAsset = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let hasHolding = false;
    let hasAnyTodayData = false;

    funds.forEach((fund) => {
      const holding = holdings[fund.code];
      const profit = getProfit(fund, holding);

      if (profit) {
        hasHolding = true;
        totalAsset += Math.round(profit.amount * 100) / 100;
        if (profit.profitToday != null) {
          // 先累加原始当日收益，最后统一做一次四舍五入，避免逐笔四舍五入造成的总计误差
          totalProfitToday += profit.profitToday;
          hasAnyTodayData = true;
        }
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (holding && typeof holding.cost === 'number' && typeof holding.share === 'number') {
            totalCost += holding.cost * holding.share;
          }
        }
      }
    });

    // 将当日收益总和四舍五入到两位小数，和卡片展示保持一致
    const roundedTotalProfitToday = Math.round(totalProfitToday * 100) / 100;

    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
    const todayReturnRate = totalCost > 0 ? (roundedTotalProfitToday / totalCost) * 100 : 0;

    return {
      totalAsset,
      totalProfitToday: roundedTotalProfitToday,
      totalHoldingReturn,
      hasHolding,
      returnRate,
      todayReturnRate,
      hasAnyTodayData,
    };
  }, [funds, holdings, getProfit]);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const metricSignature = `${winW}-${summary.totalAsset}-${summary.totalProfitToday}-${summary.totalHoldingReturn}`;
    if (!metricSignature) return;
    if (assetSize <= 16 && metricSize <= 12) return;
    const height = el.clientHeight;
    const tooTall = height > 80;
    if (tooTall) {
      setAssetSize((s) => Math.max(16, s - 1));
      setMetricSize((s) => Math.max(12, s - 1));
    }
  }, [
    winW,
    summary.totalAsset,
    summary.totalProfitToday,
    summary.totalHoldingReturn,
    assetSize,
    metricSize,
  ]);

  const style = useMemo(()=>{
    const style = {};
    if (mobileInline) {
      return style;
    }
    if (isMobile) {
      style.top = stickyTop + 6;
      style.marginBottom = 10;
    } else if (isSticky) {
      style.top = stickyTop + 14;
    }else if(!marketIndexAccordionHeight) {
      style.marginTop = navbarHeight;
    }
    return style;
  },[isMobile, mobileInline, isSticky, stickyTop, marketIndexAccordionHeight, navbarHeight])

  useEffect(() => {
    if (!mobileInline || typeof onHeightChange !== 'function') return;
    const el = rootRef.current;
    if (!el) return;

    const updateHeight = () => onHeightChange(el.getBoundingClientRect().height);
    updateHeight();

    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(el);

    return () => {
      ro.disconnect();
      onHeightChange(0);
    };
  }, [mobileInline, onHeightChange]);

  const isAssetCompacted = useMemo(() => shouldCompactAssetNumber(summary.totalAsset), [summary.totalAsset]);
  const isTodayProfitCompacted = useMemo(
    () => shouldCompactMetricNumber(summary.totalProfitToday, 7, 2),
    [summary.totalProfitToday]
  );
  const isHoldingProfitCompacted = useMemo(
    () => shouldCompactMetricNumber(summary.totalHoldingReturn, 7, 2),
    [summary.totalHoldingReturn]
  );
  const hasAnySummaryCompacted = isAssetCompacted || isTodayProfitCompacted || isHoldingProfitCompacted;
  const canOpenDetailModal = hasAnySummaryCompacted && !isMasked;

  const compactAssetText = useMemo(() => {
    if (!isAssetCompacted) {
      return `¥${formatSummaryNumber(summary.totalAsset, 2)}`;
    }
    return `¥${formatAssetCompactNumber(summary.totalAsset)}`;
  }, [summary.totalAsset, isAssetCompacted]);

  const compactTodayProfitText = useMemo(
    () => formatSignedCompactMoney(summary.totalProfitToday, isTodayProfitCompacted),
    [summary.totalProfitToday, isTodayProfitCompacted]
  );

  const compactHoldingProfitText = useMemo(
    () => formatSignedCompactMoney(summary.totalHoldingReturn, isHoldingProfitCompacted),
    [summary.totalHoldingReturn, isHoldingProfitCompacted]
  );

  const groupAssetLabel = useMemo(() => {
    const normalizedName = String(groupName || '').trim();
    if (!normalizedName) return '分组资产';
    return normalizedName.endsWith('资产') ? normalizedName : `${normalizedName}资产`;
  }, [groupName]);

  if (!summary.hasHolding) return null;

  if (isMobile) {
    return (
      <div
        ref={rootRef}
        className={mobileInline ? 'group-summary-mobile-inline' : 'group-summary-sticky group-summary-mobile-sticky'}
        style={style}
      >
        <div className={mobileInline ? 'group-summary-mobile-strip group-summary-mobile-strip-inline' : 'group-summary-card group-summary-mobile-strip'}>
          <div className="group-summary-mobile-head">
            <div className="group-summary-mobile-title">
              <span className="muted">{groupName}</span>
              <button
                type="button"
                className="fav-button"
                onClick={() => {
                  if (onToggleMasked) {
                    onToggleMasked();
                  } else {
                    setIsMasked((value) => !value);
                  }
                }}
                aria-label={isMasked ? '显示资产' : '隐藏资产'}
                style={{ margin: 0, padding: 2, display: 'inline-flex', alignItems: 'center' }}
              >
                {isMasked ? (
                  <EyeOffIcon width="16" height="16" />
                ) : (
                  <EyeIcon width="16" height="16" />
                )}
              </button>
            </div>
          </div>

          <div className="group-summary-mobile-grid">
            <div
              className="group-summary-mobile-metric group-summary-mobile-metric-main"
              style={{ alignItems: 'flex-start', textAlign: 'left' }}
            >
              <div className="group-summary-mobile-label" style={{ justifyContent: 'flex-start' }}>全部资产</div>
              <div className="group-summary-mobile-value group-summary-mobile-asset" style={{ justifyContent: 'flex-start' }}>
                {isMasked ? (
                  <span className="mask-text">******</span>
                ) : (
                  <button
                    type="button"
                    className="group-summary-mobile-asset-static"
                    onClick={() => canOpenDetailModal && setShowDetailModal(true)}
                    title={canOpenDetailModal ? '点击查看完整金额' : undefined}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: canOpenDetailModal ? 'pointer' : 'default',
                      padding: 0,
                      font: 'inherit',
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    {compactAssetText}
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              className="group-summary-mobile-metric group-summary-mobile-switcher"
              onClick={() => summary.hasAnyTodayData && setShowTodayPercent(!showTodayPercent)}
              title={summary.hasAnyTodayData ? '点击切换金额/百分比' : undefined}
            >
              <div className="group-summary-mobile-label">
                当日收益{showTodayPercent ? '(%)' : ''}
                {summary.hasAnyTodayData && <SwitchIcon style={{ opacity: 0.4 }} />}
              </div>
              <div
                className={
                  summary.hasAnyTodayData
                    ? summary.totalProfitToday > 0
                      ? 'up group-summary-mobile-value'
                      : summary.totalProfitToday < 0
                        ? 'down group-summary-mobile-value'
                        : 'group-summary-mobile-value'
                    : 'muted group-summary-mobile-value'
                }
              >
                {isMasked ? (
                  <span className="mask-text">******</span>
                ) : summary.hasAnyTodayData ? (
                  showTodayPercent ? (
                    <AutoFitCountUp
                      value={Math.abs(summary.todayReturnRate)}
                      prefix={
                        summary.totalProfitToday > 0
                          ? '+'
                          : summary.totalProfitToday < 0
                            ? '-'
                            : ''
                      }
                      suffix="%"
                      maxFontSize={mobileInline ? Math.min(metricSize, 14) : metricSize}
                      minFontSize={mobileInline ? 4 : 6}
                    />
                  ) : isTodayProfitCompacted ? (
                    <span>{compactTodayProfitText}</span>
                  ) : (
                    <AutoFitCountUp
                      value={Math.abs(summary.totalProfitToday)}
                      prefix={
                        summary.totalProfitToday > 0
                          ? '+'
                          : summary.totalProfitToday < 0
                            ? '-'
                            : ''
                      }
                      maxFontSize={mobileInline ? Math.min(metricSize, 14) : metricSize}
                      minFontSize={mobileInline ? 4 : 6}
                    />
                  )
                ) : (
                  '--'
                )}
              </div>
            </button>

            <button
              type="button"
              className="group-summary-mobile-metric group-summary-mobile-switcher"
              onClick={() => setShowPercent(!showPercent)}
              title="点击切换金额/百分比"
            >
              <div className="group-summary-mobile-label">
                持有收益{showPercent ? '(%)' : ''}
                <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <div
                className={
                  summary.totalHoldingReturn > 0
                    ? 'up group-summary-mobile-value'
                    : summary.totalHoldingReturn < 0
                      ? 'down group-summary-mobile-value'
                      : 'group-summary-mobile-value'
                }
              >
                {isMasked ? (
                  <span className="mask-text">******</span>
                ) : (
                  showPercent ? (
                    <AutoFitCountUp
                      value={Math.abs(summary.returnRate)}
                      prefix={
                        summary.totalHoldingReturn > 0
                          ? '+'
                          : summary.totalHoldingReturn < 0
                            ? '-'
                            : ''
                      }
                      suffix="%"
                      maxFontSize={mobileInline ? Math.min(metricSize, 14) : metricSize}
                      minFontSize={mobileInline ? 4 : 6}
                    />
                  ) : isHoldingProfitCompacted ? (
                    <span>{compactHoldingProfitText}</span>
                  ) : (
                    <AutoFitCountUp
                      value={Math.abs(summary.totalHoldingReturn)}
                      prefix={
                        summary.totalHoldingReturn > 0
                          ? '+'
                          : summary.totalHoldingReturn < 0
                            ? '-'
                            : ''
                      }
                      maxFontSize={mobileInline ? Math.min(metricSize, 14) : metricSize}
                      minFontSize={mobileInline ? 4 : 6}
                    />
                  )
                )}
              </div>
            </button>
          </div>
        </div>
        {showDetailModal && (
          <Dialog open onOpenChange={(open) => !open && setShowDetailModal(false)}>
            <DialogContent
              showCloseButton={false}
              className="glass card modal !z-[12010]"
              overlayClassName="!z-[12000]"
              style={{ maxWidth: '320px' }}
            >
              <DialogTitle className="sr-only">全部资产</DialogTitle>
              <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SettingsIcon width="20" height="20" />
                  <span>全部资产</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowDetailModal(false)}
                  style={{ border: 'none', background: 'transparent' }}
                >
                  <CloseIcon width="20" height="20" />
                </button>
              </div>

              <div className="grid" style={{ gap: 12 }}>
                <div
                  className="button col-12"
                  style={{
                    cursor: 'default',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '14px 16px',
                    height: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <span className="muted" style={{ fontSize: 13, textAlign: 'left' }}>{groupAssetLabel}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255,255,255,0.04)',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      lineHeight: 1.35,
                    }}
                  >
                    ¥{formatSummaryNumber(summary.totalAsset, 2)}
                  </span>
                </div>
                <div
                  className="button col-12"
                  style={{
                    cursor: 'default',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '14px 16px',
                    height: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="muted" style={{ fontSize: 13, textAlign: 'left' }}>当日收益</span>
                    <span
                      className={
                        summary.todayReturnRate > 0
                          ? 'up'
                          : summary.todayReturnRate < 0
                            ? 'down'
                            : 'muted'
                      }
                      style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                    >
                      {formatSignedPercent(summary.todayReturnRate)}
                    </span>
                  </div>
                  <span
                    className={
                      summary.totalProfitToday > 0
                        ? 'up'
                        : summary.totalProfitToday < 0
                          ? 'down'
                          : ''
                    }
                    style={{
                      display: 'inline-flex',
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255,255,255,0.04)',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      lineHeight: 1.35,
                    }}
                  >
                    {formatSignedMoneyWithYuan(summary.totalProfitToday)}
                  </span>
                </div>
                <div
                  className="button col-12"
                  style={{
                    cursor: 'default',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '14px 16px',
                    height: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="muted" style={{ fontSize: 13, textAlign: 'left' }}>持有收益</span>
                    <span
                      className={
                        summary.returnRate > 0
                          ? 'up'
                          : summary.returnRate < 0
                            ? 'down'
                            : 'muted'
                      }
                      style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                    >
                      {formatSignedPercent(summary.returnRate)}
                    </span>
                  </div>
                  <span
                    className={
                      summary.totalHoldingReturn > 0
                        ? 'up'
                        : summary.totalHoldingReturn < 0
                          ? 'down'
                          : ''
                    }
                    style={{
                      display: 'inline-flex',
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255,255,255,0.04)',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      lineHeight: 1.35,
                    }}
                  >
                    {formatSignedMoneyWithYuan(summary.totalHoldingReturn)}
                  </span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div
      className={isSticky ? 'group-summary-sticky' : ''}
      style={style}
    >
      <div
        className="glass card group-summary-card"
        style={{
          marginBottom: 8,
          padding: '16px 20px',
          background: 'rgba(255, 255, 255, 0.03)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="sticky-toggle-btn"
          onClick={() => {
            onToggleSticky?.(!isSticky);
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            padding: 4,
            opacity: 0.6,
            zIndex: 10,
            color: 'var(--muted)',
            border: 'none',
            background: 'transparent',
          }}
        >
          {isSticky ? (
            <PinIcon width="14" height="14" />
          ) : (
            <PinOffIcon width="14" height="14" />
          )}
        </button>
        <div
          ref={rowRef}
          className="row"
          style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
            >
              <div className="muted" style={{ fontSize: '12px' }}>
                {groupName}
              </div>
              <button
                type="button"
                className="fav-button"
                onClick={() => {
                  if (onToggleMasked) {
                    onToggleMasked();
                  } else {
                    setIsMasked((value) => !value);
                  }
                }}
                aria-label={isMasked ? '显示资产' : '隐藏资产'}
                style={{
                  margin: 0,
                  padding: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {isMasked ? (
                  <EyeOffIcon width="16" height="16" />
                ) : (
                  <EyeIcon width="16" height="16" />
                )}
              </button>
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ fontSize: '16px', marginRight: 2 }}>¥</span>
              {isMasked ? (
                <span
                  className="mask-text"
                  style={{ fontSize: assetSize, position: 'relative', top: 4 }}
                >
                  ******
                </span>
              ) : (
                <CountUp value={summary.totalAsset} style={{ fontSize: assetSize }} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ textAlign: 'right' }}>
              <div
                className="muted"
                style={{
                  fontSize: '12px',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                当日收益{showTodayPercent ? '(%)' : ''}{' '}
                <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <button
                type="button"
                className={
                  summary.hasAnyTodayData
                    ? summary.totalProfitToday > 0
                      ? 'up'
                      : summary.totalProfitToday < 0
                        ? 'down'
                        : ''
                    : 'muted'
                }
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: summary.hasAnyTodayData ? 'pointer' : 'default',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'right',
                }}
                onClick={() => summary.hasAnyTodayData && setShowTodayPercent(!showTodayPercent)}
                title="点击切换金额/百分比"
              >
                {isMasked ? (
                  <span className="mask-text" style={{ fontSize: metricSize }}>
                    ******
                  </span>
                ) : summary.hasAnyTodayData ? (
                  <>
                    <span style={{ marginRight: 1 }}>
                      {summary.totalProfitToday > 0
                        ? '+'
                        : summary.totalProfitToday < 0
                          ? '-'
                          : ''}
                    </span>
                    {showTodayPercent ? (
                      <CountUp
                        value={Math.abs(summary.todayReturnRate)}
                        suffix="%"
                        style={{ fontSize: metricSize }}
                      />
                    ) : (
                      <CountUp
                        value={Math.abs(summary.totalProfitToday)}
                        style={{ fontSize: metricSize }}
                      />
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: metricSize }}>--</span>
                )}
              </button>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="muted"
                style={{
                  fontSize: '12px',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                持有收益{showPercent ? '(%)' : ''}{' '}
                <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <button
                type="button"
                className={
                  summary.totalHoldingReturn > 0
                    ? 'up'
                    : summary.totalHoldingReturn < 0
                      ? 'down'
                      : ''
                }
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'right',
                }}
                onClick={() => setShowPercent(!showPercent)}
                title="点击切换金额/百分比"
              >
                {isMasked ? (
                  <span className="mask-text" style={{ fontSize: metricSize }}>
                    ******
                  </span>
                ) : (
                  <>
                    <span style={{ marginRight: 1 }}>
                      {summary.totalHoldingReturn > 0
                        ? '+'
                        : summary.totalHoldingReturn < 0
                          ? '-'
                          : ''}
                    </span>
                    {showPercent ? (
                      <CountUp
                        value={Math.abs(summary.returnRate)}
                        suffix="%"
                        style={{ fontSize: metricSize }}
                      />
                    ) : (
                      <CountUp
                        value={Math.abs(summary.totalHoldingReturn)}
                        style={{ fontSize: metricSize }}
                      />
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
