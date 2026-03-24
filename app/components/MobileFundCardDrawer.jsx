'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import FundCard from './FundCard';
import { CloseIcon } from './Icons';

/**
 * 移动端基金详情弹窗
 *
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {(open: boolean) => void} props.onOpenChange - 打开状态变化回调
 * @param {boolean} [props.blockDrawerClose] - 是否禁止关闭（如上层有弹框时）
 * @param {React.MutableRefObject<boolean>} [props.ignoreNextDrawerCloseRef] - 忽略下一次关闭（用于点击到内部 dialog 时）
 * @param {Object|null} props.cardSheetRow - 当前选中的行数据，用于 getFundCardProps
 * @param {(row: any) => Object} [props.getFundCardProps] - 根据行数据返回 FundCard 的 props
 */
export default function MobileFundCardDrawer({
  open,
  onOpenChange,
  blockDrawerClose = false,
  ignoreNextDrawerCloseRef,
  cardSheetRow,
  getFundCardProps,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (ignoreNextDrawerCloseRef?.current) {
            ignoreNextDrawerCloseRef.current = false;
            return;
          }
          if (!blockDrawerClose) onOpenChange(false);
        }
      }}
    >
      <DialogContent
        overlayClassName="modal-overlay z-[9999]"
        className="mobile-fund-detail-dialog glass z-[10000]"
        showCloseButton={false}
        onPointerDownOutside={(e) => {
          if (blockDrawerClose) return;
          if (e?.target?.closest?.('[data-slot="dialog-content"], [role="dialog"]')) {
            if (ignoreNextDrawerCloseRef) ignoreNextDrawerCloseRef.current = true;
            return;
          }
          onOpenChange(false);
        }}
        style={{
          width: 'min(92vw, 880px)',
          maxWidth: '880px',
          maxHeight: 'min(85vh, 920px)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="flex-shrink-0 flex flex-row items-center justify-between gap-2 px-3 pb-3 pt-3 text-left">
          <DialogTitle className="text-[15px] font-semibold text-[var(--text)]">
            基金详情
          </DialogTitle>
          <button
            type="button"
            className="icon-button border-none bg-transparent p-1"
            onClick={() => onOpenChange(false)}
            title="关闭"
            style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
          >
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div
          className="mobile-fund-detail-scroll flex-1 min-h-0 overflow-y-auto px-3 pb-6 pt-0"
          style={{
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {cardSheetRow && getFundCardProps ? (
            <FundCard {...getFundCardProps(cardSheetRow)} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
