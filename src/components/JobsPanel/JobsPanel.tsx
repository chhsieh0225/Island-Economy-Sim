import { memo } from 'react';
import type { GameState, SectorType } from '../../types';
import styles from './JobsPanel.module.css';

interface Props {
  state: GameState;
}

const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物',
  goods: '商品',
  services: '服務',
};

export const JobsPanel = memo(function JobsPanel({ state }: Props) {
  const alive = state.agents.filter(a => a.alive);
  const total = alive.length || 1;
  const dist: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  for (const a of alive) {
    dist[a.sector]++;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>職業分布 Jobs</div>
      {(['food', 'goods', 'services'] as const).map(sector => (
        <div key={sector} className={styles.bar}>
          <span className={styles.barLabel}>{SECTOR_LABELS[sector]}</span>
          <div className={styles.barTrack}>
            <div
              className={`${styles.barFill} ${styles[sector]}`}
              style={{ width: `${(dist[sector] / total) * 100}%` }}
            >
              {dist[sector]}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
