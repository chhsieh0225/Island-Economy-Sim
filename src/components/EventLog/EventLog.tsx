import { useRef, useEffect } from 'react';
import type { GameEvent, ActiveRandomEvent } from '../../types';
import styles from './EventLog.module.css';

interface Props {
  events: GameEvent[];
  activeRandomEvents: ActiveRandomEvent[];
  onAgentClick?: (name: string) => void;
}

export function EventLog({ events, activeRandomEvents, onAgentClick }: Props) {
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
      <div className={styles.title}>事件日誌 Event Log</div>

      {activeRandomEvents.length > 0 && (
        <div className={styles.activeEvents}>
          {activeRandomEvents.map((e, i) => (
            <div key={i} className={styles.activeEventItem}>
              {e.def.name} — 剩餘 {e.turnsRemaining} 回合
            </div>
          ))}
        </div>
      )}

      <div className={styles.log} ref={logRef}>
        {reversed.length === 0 ? (
          <div className={styles.empty}>按下「下一回合」開始模擬...</div>
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
