import { memo } from 'react';
import type { GameState, SectorType } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './JobsPanel.module.css';

interface Props {
  state: GameState;
}

export const JobsPanel = memo(function JobsPanel({ state }: Props) {
  const { t } = useI18n();

  const sectorLabel = (sector: SectorType) => t(`sector.${sector}`);
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
          <span className={styles.barLabel}>{sectorLabel(sector)}</span>
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
