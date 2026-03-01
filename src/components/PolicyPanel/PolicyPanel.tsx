import type { GovernmentState, SectorType } from '../../types';
import styles from './PolicyPanel.module.css';

interface Props {
  government: GovernmentState;
  onSetTaxRate: (rate: number) => void;
  onSetSubsidy: (sector: SectorType, amount: number) => void;
  onSetWelfare: (enabled: boolean) => void;
  onSetPublicWorks: (active: boolean) => void;
}

const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物補貼 Food',
  goods: '商品補貼 Goods',
  services: '服務補貼 Services',
};

export function PolicyPanel({ government, onSetTaxRate, onSetSubsidy, onSetWelfare, onSetPublicWorks }: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.title}>政策控制 Policy</div>

      <div className={styles.control}>
        <div className={styles.controlLabel}>
          <span>稅率 Tax Rate</span>
          <span className={styles.controlValue}>{(government.taxRate * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          className={styles.slider}
          min="0"
          max="50"
          step="1"
          value={government.taxRate * 100}
          onChange={e => onSetTaxRate(Number(e.target.value) / 100)}
        />
      </div>

      <div className={styles.sectionTitle}>產業補貼 Subsidies</div>

      {(['food', 'goods', 'services'] as const).map(sector => (
        <div key={sector} className={styles.control}>
          <div className={styles.controlLabel}>
            <span>{SECTOR_LABELS[sector]}</span>
            <span className={styles.controlValue}>{government.subsidies[sector].toFixed(0)}%</span>
          </div>
          <input
            type="range"
            className={styles.slider}
            min="0"
            max="100"
            step="5"
            value={government.subsidies[sector]}
            onChange={e => onSetSubsidy(sector, Number(e.target.value))}
          />
        </div>
      ))}

      <div className={styles.sectionTitle}>社會政策 Social</div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={government.welfareEnabled}
          onChange={e => onSetWelfare(e.target.checked)}
        />
        <span className={styles.toggleLabel}>社會福利 Welfare</span>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={government.publicWorksActive}
          onChange={e => onSetPublicWorks(e.target.checked)}
        />
        <span className={styles.toggleLabel}>公共建設 Public Works</span>
      </label>
    </div>
  );
}
