'use client';

import { useState, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { fetchFundHistory } from '../api/fund';
import { cachedRequest } from '../lib/cacheRequest';

/**
 * 历史净值表格行：日期、净值、日涨幅（按日期降序，涨红跌绿）
 */
function buildRows(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const reversed = [...history].reverse();
  return reversed.map((item, i) => {
    const prev = reversed[i + 1];
    let dailyChange = null;
    if (prev && Number.isFinite(item.value) && Number.isFinite(prev.value) && prev.value !== 0) {
      dailyChange = ((item.value - prev.value) / prev.value) * 100;
    }
    return {
      date: item.date,
      netValue: item.value,
      dailyChange,
    };
  });
}

const columns = [
  {
    accessorKey: 'date',
    header: '日期',
    cell: (info) => info.getValue(),
    meta: { align: 'left' },
  },
  {
    accessorKey: 'netValue',
    header: '净值',
    cell: (info) => {
      const v = info.getValue();
      return v != null && Number.isFinite(v) ? Number(v).toFixed(4) : '—';
    },
    meta: { align: 'center' },
  },
  {
    accessorKey: 'dailyChange',
    header: '日涨幅',
    cell: (info) => {
      const v = info.getValue();
      if (v == null || !Number.isFinite(v)) return '—';
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
      return <span className={cls}>{sign}{v.toFixed(2)}%</span>;
    },
    meta: { align: 'right' },
  },
];

export default function FundHistoryNetValue({ code, range = '1m', theme }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [allData, setAllData] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  const [allDataError, setAllDataError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    if (!code) {
      setData([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const cacheKey = `fund_history_${code}_${range}`;
    cachedRequest(() => fetchFundHistory(code, range), cacheKey, { cacheTime: 10 * 60 * 1000 })
      .then((res) => {
        if (active) {
          setData(buildRows(res || []));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err);
          setData([]);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [code, range]);

  useEffect(() => {
    setExpanded(false);
    setAllData([]);
    setLoadingAll(false);
    setAllDataLoaded(false);
    setAllDataError(null);
    setVisibleCount(30);
  }, [code, range]);

  const table = useReactTable({
    data: expanded && allDataLoaded ? allData : data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const allRows = table.getRowModel().rows;
  const rows = expanded ? allRows.slice(0, visibleCount) : allRows.slice(0, 5);
  const hasMore = expanded && allRows.length > visibleCount;

  const handleExpandHistory = async () => {
    setExpanded(true);
    setAllDataError(null);
    if (!expanded) setVisibleCount(30);
    if (allDataLoaded || loadingAll || !code) return;

    setLoadingAll(true);
    try {
      const cacheKey = `fund_history_${code}_all_inline`;
      const res = await cachedRequest(() => fetchFundHistory(code, 'all'), cacheKey, { cacheTime: 10 * 60 * 1000 });
      setAllData(buildRows(res || []));
      setAllDataLoaded(true);
    } catch (err) {
      setAllData([]);
      setAllDataLoaded(false);
      setAllDataError(err);
      setExpanded(false);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleExpandedScroll = (e) => {
    if (!hasMore) return;
    const target = e.currentTarget;
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distance < 40) {
      setVisibleCount((prev) => {
        const next = prev + 30;
        return next > allRows.length ? allRows.length : next;
      });
    }
  };

  if (!code) return null;
  if (loading) {
    return (
      <div className="fund-history-net-value" style={{ padding: '12px 0' }}>
        <span className="muted" style={{ fontSize: '13px' }}>加载历史净值...</span>
      </div>
    );
  }
  if (error || data.length === 0) {
    return (
      <div className="fund-history-net-value" style={{ padding: '12px 0' }}>
        <span className="muted" style={{ fontSize: '13px' }}>
          {error ? '加载失败' : '暂无历史净值'}
        </span>
      </div>
    );
  }

  return (
    <div className="fund-history-net-value">
      <div
        className="fund-history-table-wrapper"
        style={{
          marginTop: 8,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          background: 'var(--card)',
        }}
      >
        <div
          className={expanded ? 'fund-history-inline-scroll' : undefined}
          style={{
            maxHeight: expanded ? 240 : undefined,
            overflowY: expanded ? 'auto' : 'visible',
            overscrollBehavior: expanded ? 'contain' : undefined,
          }}
          onScroll={expanded ? handleExpandedScroll : undefined}
        >
          <table
            className="fund-history-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              color: 'var(--text)',
            }}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--table-row-alt-bg)',
                  }}
                >
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{
                        padding: '8px 12px',
                        fontWeight: 600,
                        color: 'var(--muted)',
                        textAlign: h.column.columnDef.meta?.align || 'left',
                        position: expanded ? 'sticky' : 'static',
                        top: 0,
                        zIndex: expanded ? 1 : 'auto',
                        background: 'var(--table-row-alt-bg)',
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        padding: '8px 12px',
                        color: 'var(--text)',
                        textAlign: cell.column.columnDef.meta?.align || 'left',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        {!expanded ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="muted"
              style={{
                fontSize: 12,
                padding: 0,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
              }}
              onClick={handleExpandHistory}
            >
              {loadingAll ? '正在加载更多历史净值...' : (allDataError ? '重试加载更多历史净值' : '加载更多历史净值')}
            </button>
            {allDataError && (
              <span className="muted" style={{ fontSize: 12 }}>加载更多历史净值失败，请重试</span>
            )}
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>向下滚动加载更多</span>
        )}
      </div>
    </div>
  );
}
