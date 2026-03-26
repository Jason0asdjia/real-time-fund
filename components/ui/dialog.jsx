"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import {CloseIcon} from "@/app/components/Icons";

let inertLockCount = 0
let originalAppRootPointerEvents = ""
let scrollBlockLockCount = 0
let removeScrollBlockListeners = null

function isScrollableElement(node) {
  if (!(node instanceof HTMLElement)) return false
  const style = window.getComputedStyle(node)
  const overflowY = style.overflowY
  const canScrollY =
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    node.scrollHeight > node.clientHeight
  return canScrollY
}

function canScrollWithinContent(target, deltaY) {
  if (!(target instanceof HTMLElement)) return false
  const contentEl = target.closest('[data-slot="dialog-content"]')
  if (!(contentEl instanceof HTMLElement)) return false

  let el = target
  while (el instanceof HTMLElement) {
    if (isScrollableElement(el)) {
      if (deltaY < 0 && el.scrollTop > 0) return true
      if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight) return true
      if (deltaY === 0 && el.scrollHeight > el.clientHeight) return true
    }
    if (el === contentEl) break
    el = el.parentElement
  }
  return false
}

function installScrollBlockListeners() {
  if (typeof document === "undefined") return () => {}

  const handleWheel = (e) => {
    if (canScrollWithinContent(e.target, e.deltaY || 0)) return
    e.preventDefault()
  }

  let lastTouchY = null
  const handleTouchStart = (e) => {
    const touch = e.touches?.[0]
    lastTouchY = touch ? touch.clientY : null
  }

  const handleTouchMove = (e) => {
    const touch = e.touches?.[0]
    const currentY = touch ? touch.clientY : null
    const deltaY = lastTouchY == null || currentY == null ? 0 : lastTouchY - currentY
    if (canScrollWithinContent(e.target, deltaY)) {
      lastTouchY = currentY
      return
    }
    e.preventDefault()
  }

  document.addEventListener("wheel", handleWheel, { passive: false, capture: true })
  document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true })
  document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true })

  return () => {
    document.removeEventListener("wheel", handleWheel, true)
    document.removeEventListener("touchstart", handleTouchStart, true)
    document.removeEventListener("touchmove", handleTouchMove, true)
  }
}

function setDocumentScrollBlocked(active) {
  if (active) {
    scrollBlockLockCount += 1
    if (scrollBlockLockCount === 1) {
      removeScrollBlockListeners = installScrollBlockListeners()
    }
    return
  }

  if (scrollBlockLockCount === 0) return
  scrollBlockLockCount -= 1
  if (scrollBlockLockCount === 0) {
    removeScrollBlockListeners?.()
    removeScrollBlockListeners = null
  }
}

function setAppRootInert(active) {
  if (typeof document === "undefined") return
  const appRoot = document.getElementById("app-root")
  if (!appRoot) return

  if (active) {
    inertLockCount += 1
    if (inertLockCount === 1) {
      originalAppRootPointerEvents = appRoot.style.pointerEvents || ""
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      appRoot.setAttribute("inert", "")
      appRoot.style.pointerEvents = "none"
    }
    return
  }

  if (inertLockCount === 0) return
  inertLockCount -= 1
  if (inertLockCount === 0) {
    appRoot.removeAttribute("inert")
    appRoot.style.pointerEvents = originalAppRootPointerEvents
  }
}

function Dialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  modal = false,
  blockAppInteraction = true,
  ...props
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const currentOpen = isControlled ? openProp : uncontrolledOpen;

  React.useEffect(() => {
    if (!blockAppInteraction || !currentOpen) return undefined
    setAppRootInert(true)
    setDocumentScrollBlocked(true)
    return () => {
      setAppRootInert(false)
      setDocumentScrollBlocked(false)
    }
  }, [blockAppInteraction, currentOpen])

  const handleOpenChange = React.useCallback(
    (next) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      modal={modal}
      open={isControlled ? openProp : undefined}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  );
}

function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Close asChild>
      <div
        data-slot="dialog-overlay"
        role="button"
        tabIndex={-1}
        aria-label="关闭"
        className={cn(
          "fixed inset-0 z-50 cursor-default bg-[var(--dialog-overlay)] backdrop-blur-[4px] animate-in fade-in-0",
          className
        )}
        {...props}
      />
    </DialogPrimitive.Close>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  overlayStyle,
  ...props
}) {
  const describedBy = props["aria-describedby"]
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} style={overlayStyle} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-modal="true"
        aria-describedby={describedBy ?? undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-[16px] border border-[var(--border)] text-[var(--foreground)] p-6 dialog-content-shadow outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          "mobile-dialog-glass",
          className
        )}
        {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-md p-1.5 text-[var(--muted-foreground)] opacity-70 transition-colors duration-200 hover:opacity-100 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] disabled:pointer-events-none cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <CloseIcon width="20" height="20" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <button type="button" className="button secondary px-4 h-11 rounded-xl cursor-pointer">
            Close
          </button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold text-[var(--foreground)]", className)}
      {...props} />
  );
}

function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
      {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
