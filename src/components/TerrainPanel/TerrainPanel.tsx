import { useMemo, useState } from 'react';
import type { IslandTerrainState, SectorType } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './TerrainPanel.module.css';

interface Props {
  terrain: IslandTerrainState;
}

export function TerrainPanel({ terrain }: Props) {
  const { t } = useI18n();
  const [active, setActive] = useState<SectorType>('food');

  const ranking = useMemo(() => {
    return (['food', 'goods', 'services'] as const)
      .map(sector => ({ sector, value: terrain.sectorSuitability[sector] }))
      .sort((a, b) => b.value - a.value);
  }, [terrain.sectorSuitability]);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('terrain.title')}</div>
      <div className={styles.seed}>Seed #{terrain.seed}</div>

      <div className={styles.rankRow}>
        <span className={styles.rankLabel}>{t('terrain.bestSector')}</span>
        <span className={styles.rankValue}>{t(`sector.${ranking[0].sector}`)}</span>
      </div>
      <div className={styles.rankRow}>
        <span className={styles.rankLabel}>{t('terrain.weakestSector')}</span>
        <span className={styles.rankValue}>{t(`sector.${ranking[ranking.length - 1].sector}`)}</span>
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
                <span>{t(`sector.${sector}`)}</span>
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
        <div className={styles.focusTitle}>{t('terrain.focus')}</div>
        <div className={styles.focusText}>
          {t(`sector.${active}`)}: {terrain.sectorFeatures[active]}, {t('terrain.modifier')}{' '}
          {(terrain.sectorSuitability[active] >= 1 ? '+' : '') + ((terrain.sectorSuitability[active] - 1) * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
