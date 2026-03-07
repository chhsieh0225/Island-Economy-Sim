import { useRef, useEffect } from 'react';
import type { GameEvent, ActiveRandomEvent } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './EventLog.module.css';

interface Props {
  events: GameEvent[];
  activeRandomEvents: ActiveRandomEvent[];
  onAgentClick?: (name: string) => void;
}

export function EventLog({ events, activeRandomEvents }: Props) {
  const { t } = useI18n();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [events.length]);

  // Show events newest first
  const reversed = [...events].reverse();

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('eventLog.title')}</div>

      {activeRandomEvents.length > 0 && (
        <div className={styles.activeEvents}>
          {activeRandomEvents.map((e, i) => (
            <div key={i} className={styles.activeEventItem}>
              {e.def.name} — {t('eventLog.turnsRemaining').replace('{n}', String(e.turnsRemaining))}
            </div>
          ))}
        </div>
      )}

      <div className={styles.log} ref={logRef}>
        {reversed.length === 0 ? (
          <div className={styles.empty}>{t('eventLog.empty')}</div>
        ) : (
          reversed.map((event, i) => (
            <div key={i} className={styles.entry}>
              <span className={styles.turn}>[{event.turn}]</span>
              <span className={styles[event.type]}>{event.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
