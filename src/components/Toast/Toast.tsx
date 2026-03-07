import { useEffect, useRef, useState, memo } from 'react';
import type { ToastNotification } from '../../types';
import styles from './Toast.module.css';

interface Props {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

const MAX_VISIBLE = 3;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const remaining = toast.duration - (Date.now() - toast.createdAt);
    if (remaining <= 0) {
      onDismiss(toast.id);
      return;
    }
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, remaining);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, toast.createdAt, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const typeClass = styles[toast.type] ?? '';

  return (
    <div
      className={`${styles.toast} ${typeClass} ${exiting ? styles.exiting : ''}`}
      onClick={handleDismiss}
    >
      <div className={styles.header}>
        <span className={styles.title}>{toast.title}</span>
        <button
          className={styles.dismiss}
          onClick={e => {
            e.stopPropagation();
            handleDismiss();
          }}
          aria-label="Dismiss"
        >
          x
        </button>
      </div>
      <div className={styles.message}>{toast.message}</div>
    </div>
  );
}

export const Toast = memo(function Toast({ toasts, onDismiss }: Props) {
  const visible = toasts.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className={styles.container} aria-live="polite" role="status">
      {visible.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
});
