import {
  ECONOMIC_CALIBRATION_REFERENCES,
  getEconomicCalibrationProfile,
  getEconomicCalibrationProfiles,
} from '../../engine/economicCalibration';
import type { EconomicCalibrationProfileId } from '../../engine/economicCalibration';
import styles from './EconomyCalibrationPanel.module.css';

interface Props {
  mode: EconomicCalibrationProfileId;
  onChangeMode: (mode: EconomicCalibrationProfileId) => void;
}

function fmt(value: number, digits: number = 2): string {
  return value.toFixed(digits);
}

export function EconomyCalibrationPanel({ mode, onChangeMode }: Props) {
  const current = getEconomicCalibrationProfile(mode);
  const profiles = getEconomicCalibrationProfiles();

  return (
    <div className={styles.panel}>
      <div className={styles.title}>經濟校準 Economic Calibration</div>

      <div className={styles.modeRow}>
        {profiles.map(profile => (
          <button
            key={profile.id}
            className={`${styles.modeBtn} ${profile.id === mode ? styles.modeBtnActive : ''}`}
            onClick={() => onChangeMode(profile.id)}
          >
            {profile.label}
          </button>
        ))}
      </div>

      <div className={styles.desc}>{current.description}</div>
      <div className={styles.sourceSummary}>參數來源：{current.sourceSummary}</div>

      <div className={styles.table}>
        <div className={styles.row}>
          <span className={styles.key}>α_food</span>
          <span className={styles.value}>{fmt(current.productionLaborElasticity.food)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>α_goods</span>
          <span className={styles.value}>{fmt(current.productionLaborElasticity.goods)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>α_services</span>
          <span className={styles.value}>{fmt(current.productionLaborElasticity.services)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>k (tatonnement)</span>
          <span className={styles.value}>{fmt(current.tatonnementGain, 3)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>λ (價格平滑)</span>
          <span className={styles.value}>{fmt(current.priceSmoothing, 2)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>LES 最低需求</span>
          <span className={styles.value}>{fmt(current.lesSubsistenceMultiplier, 2)}</span>
        </div>
      </div>

      <div className={styles.refTitle}>文獻常見區間</div>
      <div className={styles.refs}>
        {ECONOMIC_CALIBRATION_REFERENCES.map(ref => (
          <div key={ref.key} className={styles.refItem}>
            <div className={styles.refHead}>
              <span>{ref.label}</span>
              <span className={styles.refRange}>{ref.range}</span>
            </div>
            <div className={styles.refSource}>{ref.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
