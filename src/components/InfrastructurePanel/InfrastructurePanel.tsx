import { memo, useState } from 'react';
import type { Infrastructure, InfrastructureType } from '../../types';
import {
  INFRASTRUCTURE_DEFS,
  canBuild,
} from '../../engine/modules/infrastructureModule';
import { useGameStore } from '../../stores/gameStore';
import { useI18n } from '../../i18n/useI18n';
import styles from './InfrastructurePanel.module.css';

interface Props {
  treasury: number;
  infrastructure: Infrastructure[];
}

export const InfrastructurePanel = memo(function InfrastructurePanel({
  treasury,
  infrastructure,
}: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const build = useGameStore(s => s.buildInfrastructure);

  const activeCount = (type: InfrastructureType) =>
    infrastructure.filter(i => i.type === type).length;

  const operationalCount = (type: InfrastructureType) =>
    infrastructure.filter(i => i.type === type && i.buildTurnsLeft === 0).length;

  const buildingCount = (type: InfrastructureType) =>
    infrastructure.filter(i => i.type === type && i.buildTurnsLeft > 0).length;

  return (
    <div className={styles.panel}>
      <button className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <span className={styles.headerTitle}>{t('infra.title')}</span>
        <span className={styles.headerCount}>
          {infrastructure.length > 0 && `${infrastructure.filter(i => i.buildTurnsLeft === 0).length}/${infrastructure.length}`}
        </span>
        <span className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}>▾</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          <div className={styles.hint}>
            {t('infra.hint')}
          </div>

          {INFRASTRUCTURE_DEFS.map(def => {
            const check = canBuild(def.type, infrastructure, treasury);
            const active = activeCount(def.type);
            const operational = operationalCount(def.type);
            const building = buildingCount(def.type);

            return (
              <div key={def.type} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemName}>{t(`infra.${def.type}`)}</span>
                  <span className={styles.itemCount}>
                    {active > 0 && (
                      <>
                        {operational > 0 && <span className={styles.opBadge}>{operational} {t('infra.operational')}</span>}
                        {building > 0 && <span className={styles.buildBadge}>{building} {t('infra.building')}</span>}
                      </>
                    )}
                    <span className={styles.maxLabel}>{active}/{def.maxCount}</span>
                  </span>
                </div>
                <div className={styles.itemDesc}>{t(`infra.${def.type}.desc`)}</div>
                <div className={styles.itemFooter}>
                  <span className={styles.cost}>$ {def.cost}</span>
                  <span className={styles.buildTime}>{t('infra.turns').replace('{n}', String(def.buildTurns))}</span>
                  <button
                    className={styles.buildBtn}
                    disabled={!check.ok}
                    onClick={() => build(def.type)}
                    title={check.reason ?? t('infra.build')}
                  >
                    {t('infra.build')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
