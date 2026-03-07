import { memo, useEffect, useCallback, type ReactNode } from 'react';
import { useI18n } from '../../i18n/useI18n';
import styles from './DrawerPanel.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export const DrawerPanel = memo(function DrawerPanel({ open, title, onClose, children }: Props) {
  const { t } = useI18n();

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <div className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
        onClick={onClose}
      />
      <div
        className={`${styles.panel} ${open ? styles.panelVisible : ''}`}
        role="dialog"
        aria-modal={open}
        aria-label={title}
      >
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </div>
  );
});
