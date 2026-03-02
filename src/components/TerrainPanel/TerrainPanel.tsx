import { useMemo, useState } from 'react';
import type { IslandTerrainState, SectorType } from '../../types';
import styles from './TerrainPanel.module.css';

interface Props {
  terrain: IslandTerrainState;
}

const LABELS: Record<SectorType, string> = {
  food: '食物 Food',
  goods: '商品 Goods',
  services: '服務 Services',
};

export function TerrainPanel({ terrain }: Props) {
  const [active, setActive] = useState<SectorType>('food');

  const ranking = useMemo(() => {
    return (['food', 'goods', 'services'] as const)
      .map(sector => ({ sector, value: terrain.sectorSuitability[sector] }))
      .sort((a, b) => b.value - a.value);
  }, [terrain.sectorSuitability]);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>地貌剖面 Terrain</div>
      <div className={styles.seed}>Seed #{terrain.seed}</div>

      <div className={styles.rankRow}>
        <span className={styles.rankLabel}>最適產業</span>
        <span className={styles.rankValue}>{LABELS[ranking[0].sector]}</span>
      </div>
      <div className={styles.rankRow}>
        <span className={styles.rankLabel}>最弱產業</span>
        <span className={styles.rankValue}>{LABELS[ranking[ranking.length - 1].sector]}</span>
      </div>

      <div className={styles.cards}>
        {(['food', 'goods', 'services'] as const).map(sector => {
          const delta = (terrain.sectorSuitability[sector] - 1) * 100;
          const width = Math.max(4, Math.min(100, 50 + delta * 2));
          return (
            <button
              key={sector}
              className={`${styles.card} ${active === sector ? styles.cardActive : ''}`}
              onClick={() => setActive(sector)}
            >
              <div className={styles.cardHead}>
                <span>{LABELS[sector]}</span>
                <span className={delta >= 0 ? styles.up : styles.down}>
                  {(delta >= 0 ? '+' : '') + delta.toFixed(0)}%
                </span>
              </div>
              <div className={styles.feature}>{terrain.sectorFeatures[sector]}</div>
              <div className={styles.barBg}>
                <div className={styles.barFill} style={{ width: `${width}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.focus}>
        <div className={styles.focusTitle}>目前聚焦 Focus</div>
        <div className={styles.focusText}>
          {LABELS[active]}：{terrain.sectorFeatures[active]}，地貌修正{' '}
          {(terrain.sectorSuitability[active] >= 1 ? '+' : '') + ((terrain.sectorSuitability[active] - 1) * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
