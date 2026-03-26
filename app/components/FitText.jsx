'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * 根据容器宽度动态缩小字体，使内容不溢出。
 * 使用 ResizeObserver 监听容器宽度，内容超出时按比例缩小 fontSize，不低于 minFontSize。
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - 要显示的文本（会单行、不换行）
 * @param {number} [props.maxFontSize=14] - 最大字号（px）
 * @param {number} [props.minFontSize=10] - 最小字号（px），再窄也不低于此值
 * @param {string} [props.className] - 外层容器 className
 * @param {Object} [props.style] - 外层容器 style（宽度由父级决定，建议父级有明确宽度）
 * @param {string} [props.as='span'] - 外层容器标签 'span' | 'div'
 * @param {number} [props.fitPadding=6] - 缩放时预留的安全宽度（px）
 */
export default function FitText({
  children,
  maxFontSize = 14,
  minFontSize = 10,
  className,
  style = {},
  as: Tag = 'span',
  fitPadding = 6,
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  const adjust = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return;
    const safeWidth = Math.max(containerWidth - fitPadding, 0);

    const measureNode = content.cloneNode(true);
    measureNode.style.position = 'absolute';
    measureNode.style.visibility = 'hidden';
    measureNode.style.pointerEvents = 'none';
    measureNode.style.left = '-99999px';
    measureNode.style.top = '0';
    measureNode.style.width = 'max-content';
    measureNode.style.maxWidth = 'none';
    measureNode.style.paddingRight = '0';
    measureNode.style.fontSize = `${maxFontSize}px`;
    document.body.appendChild(measureNode);
    const contentWidth = measureNode.getBoundingClientRect().width;
    document.body.removeChild(measureNode);
    if (contentWidth <= 0) return;

    let size = maxFontSize;
    if (contentWidth > safeWidth) {
      size = (safeWidth / contentWidth) * maxFontSize;
      size = Math.max(minFontSize, Math.min(maxFontSize, size));
    }

    const normalizedSize = Math.round(size * 100) / 100;
    const currentSize = Number.parseFloat(content.style.fontSize);
    if (Number.isFinite(currentSize) && Math.abs(currentSize - normalizedSize) < 0.01) return;

    content.style.fontSize = `${normalizedSize}px`;
  }, [fitPadding, maxFontSize, minFontSize]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    adjust();
    const ro = new ResizeObserver(adjust);
    ro.observe(container);
    return () => ro.disconnect();
  }, [adjust]);

  return (
    <Tag
      ref={containerRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        ref={contentRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          fontWeight: 'inherit',
          fontSize: `${maxFontSize}px`,
          maxWidth: '100%',
        }}
      >
        {children}
      </span>
    </Tag>
  );
}
