import { useEffect, useRef } from "react";

// 全局状态：支持多个弹框“引用计数”式地共用一个滚动锁
let scrollLockCount = 0;
let originalHtmlOverflow = "";
let originalBodyOverflow = "";
let originalBodyTouchAction = "";
let originalBodyOverscrollBehavior = "";

function lockBodyScroll() {
  scrollLockCount += 1;

  // 只有第一个锁才真正修改页面样式，避免多弹框互相干扰
  if (scrollLockCount === 1) {
    originalHtmlOverflow = document.documentElement.style.overflow || "";
    originalBodyOverflow = document.body.style.overflow || "";
    originalBodyTouchAction = document.body.style.touchAction || "";
    originalBodyOverscrollBehavior = document.body.style.overscrollBehavior || "";

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "contain";
  }
}

function unlockBodyScroll() {
  if (scrollLockCount === 0) return;

  scrollLockCount -= 1;

  // 只有全部弹框都关闭时才恢复页面样式
  if (scrollLockCount === 0) {
    document.documentElement.style.overflow = originalHtmlOverflow;
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.touchAction = originalBodyTouchAction;
    document.body.style.overscrollBehavior = originalBodyOverscrollBehavior;
  }
}

export function useBodyScrollLock(open) {
  const isLockedRef = useRef(false);

  useEffect(() => {
    if (open && !isLockedRef.current) {
      lockBodyScroll();
      isLockedRef.current = true;
    } else if (!open && isLockedRef.current) {
      unlockBodyScroll();
      isLockedRef.current = false;
    }

    // 组件卸载或依赖变化时兜底释放锁
    return () => {
      if (isLockedRef.current) {
        unlockBodyScroll();
        isLockedRef.current = false;
      }
    };
  }, [open]);
}
