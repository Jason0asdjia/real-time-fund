'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { CloseIcon, PlusIcon } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AddFundToGroupModal({ allFunds, currentGroupCodes, holdings = {}, onClose, onAdd }) {
  const [selected, setSelected] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const availableFunds = useMemo(() => {
    const base = (allFunds || []).filter(f => !(currentGroupCodes || []).includes(f.code));
    if (!searchQuery.trim()) return base;
    const query = searchQuery.trim().toLowerCase();
    return base.filter(f =>
      (f.name && f.name.toLowerCase().includes(query)) ||
      (f.code && f.code.includes(query))
    );
  }, [allFunds, currentGroupCodes, searchQuery]);

  const getHoldingAmount = (fund) => {
    const holding = holdings[fund?.code];
    if (!holding || !holding.share || holding.share <= 0) return null;
    const nav = Number(fund?.dwjz) || Number(fund?.gsz) || Number(fund?.estGsz) || 0;
    if (!nav) return null;
    return holding.share * nav;
  };

  const toggleSelect = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleOpenChange = (open) => {
    if (!open) {
      onClose?.();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal z-[10000]"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '500px', width: '90vw', zIndex: 99 }}
      >
        <style>{`
          .add-fund-to-group-list-container::-webkit-scrollbar {
            width: 6px;
          }
          .add-fund-to-group-list-container::-webkit-scrollbar-track {
            background: transparent;
          }
          .add-fund-to-group-list-container::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 3px;
            box-shadow: none;
          }
          .add-fund-to-group-list-container::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted);
          }
        `}</style>
        <DialogTitle className="sr-only">添加基金到分组</DialogTitle>
        <div className="title add-fund-to-group-modal__header" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <div className="add-fund-to-group-modal__title">
            <PlusIcon width="20" height="20" />
            <span>添加基金到分组</span>
          </div>
          <button
            className="icon-button add-fund-to-group-modal__close"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent' }}
            type="button"
          >
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="add-fund-to-group-modal__search">
          <Search width="18" height="18" className="muted add-fund-to-group-modal__search-icon" />
          <input
            type="text"
            className="input no-zoom add-fund-to-group-modal__search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索基金名称或编号"
          />
        </div>

        <div className="add-fund-to-group-list-container">
          {availableFunds.length === 0 ? (
            <div className="empty-state muted add-fund-to-group-modal__empty">
              <p>{searchQuery.trim() ? '未找到匹配的基金' : '所有基金已在该分组中'}</p>
            </div>
          ) : (
            <div className="group-manage-list add-fund-to-group-modal__list">
              {availableFunds.map((fund) => (
                <div
                  key={fund.code}
                  className={`group-manage-item glass add-fund-to-group-modal__item ${selected.has(fund.code) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(fund.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSelect(fund.code);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="checkbox add-fund-to-group-modal__checkbox">
                    {selected.has(fund.code) && <div className="checked-mark" />}
                  </div>
                  <div className="fund-info add-fund-to-group-modal__fund-info">
                    <div className="add-fund-to-group-modal__fund-name">{fund.name}</div>
                    <div className="muted add-fund-to-group-modal__fund-code">#{fund.code}</div>
                    {getHoldingAmount(fund) != null && (
                      <div className="muted add-fund-to-group-modal__fund-amount">
                        持仓金额：<span className="add-fund-to-group-modal__fund-amount-value">¥{getHoldingAmount(fund).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row add-fund-to-group-modal__footer" style={{ marginTop: 20 }}>
          <button className="button secondary add-fund-to-group-modal__action" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="button add-fund-to-group-modal__action"
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            type="button"
          >
            确定（{selected.size}）
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
