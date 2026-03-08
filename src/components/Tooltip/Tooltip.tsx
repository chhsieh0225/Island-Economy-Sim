import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/useI18n';
import styles from './Tooltip.module.css';

interface Props {
  /** Chinese content */
  content: string;
  /** English content (shown as primary when locale=en, secondary detail when locale=zh) */
  detail?: string;
  /** Chinese real-world reference */
  realWorldRef?: string;
  /** English real-world reference */
  realWorldRefEn?: string;
  children: React.ReactNode;
}

const SHOW_DELAY = 300;
const TOOLTIP_GAP = 8;

export function Tooltip({ content, detail, realWorldRef, realWorldRefEn, children }: Props) {
  const { locale } = useI18n();
  const zh = locale === 'zh-TW';
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setPosition(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible || !wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();

    // Use requestAnimationFrame so the tooltip DOM is rendered before we measure
    const raf = requestAnimationFrame(() => {
      const tooltipEl = tooltipRef.current;
      const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 60;
      const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 200;

      // Prefer above; fall back to below if not enough space
      const above = rect.top > tooltipHeight + TOOLTIP_GAP;
      const top = above
        ? rect.top - tooltipHeight - TOOLTIP_GAP
        : rect.bottom + TOOLTIP_GAP;

      // Center horizontally on the wrapper, clamp to viewport
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

      setPosition({ top, left, above });
    });

    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <span
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            style={
              position
                ? { top: position.top, left: position.left }
                : { visibility: 'hidden', top: 0, left: 0 }
            }
          >
            <div className={styles.content}>{zh ? content : (detail ?? content)}</div>
            {zh && detail && <div className={styles.detail}>{detail}</div>}
            {(zh ? realWorldRef : realWorldRefEn) && (
              <div className={styles.realWorldRef}>{zh ? realWorldRef : realWorldRefEn}</div>
            )}
            <div
              className={`${styles.arrow} ${position?.above ? styles.arrowDown : styles.arrowUp}`}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
