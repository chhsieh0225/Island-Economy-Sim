import type { GovernmentState, PendingPolicyChange, SectorType } from '../../types';
import styles from './PolicyPanel.module.css';

interface Props {
  turn: number;
  government: GovernmentState;
  pendingPolicies: PendingPolicyChange[];
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

function pendingSummary(policy: PendingPolicyChange): string {
  switch (policy.type) {
    case 'tax':
      return `稅率 → ${((policy.value as number) * 100).toFixed(0)}%`;
    case 'subsidy':
      return `${policy.sector} 補貼 → ${(policy.value as number).toFixed(0)}%`;
    case 'welfare':
      return `福利 → ${(policy.value as boolean) ? '開' : '關'}`;
    case 'publicWorks':
      return `公共建設 → ${(policy.value as boolean) ? '開' : '關'}`;
  }
}

export function PolicyPanel({
  turn,
  government,
  pendingPolicies,
  onSetTaxRate,
  onSetSubsidy,
  onSetWelfare,
  onSetPublicWorks,
}: Props) {
  const pendingTax = pendingPolicies.find(p => p.type === 'tax');
  const pendingWelfare = pendingPolicies.find(p => p.type === 'welfare');
  const pendingPublicWorks = pendingPolicies.find(p => p.type === 'publicWorks');

  const taxDisplay = (pendingTax ? pendingTax.value as number : government.taxRate) * 100;
  const welfareDisplay = pendingWelfare ? pendingWelfare.value as boolean : government.welfareEnabled;
  const publicWorksDisplay = pendingPublicWorks ? pendingPublicWorks.value as boolean : government.publicWorksActive;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>政策控制 Policy</div>
      <div className={styles.delayHint}>政策有 1 回合延遲，右下方可查看待生效清單。</div>

      <div className={styles.control}>
        <div className={styles.controlLabel}>
          <span>稅率 Tax Rate</span>
          <span className={styles.controlValue}>{taxDisplay.toFixed(0)}%</span>
        </div>
        <input
          type="range"
          className={styles.slider}
          min="0"
          max="50"
          step="1"
          value={taxDisplay}
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
            value={
              (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === sector)?.value as number | undefined)
              ?? government.subsidies[sector]
            }
            onChange={e => onSetSubsidy(sector, Number(e.target.value))}
          />
        </div>
      ))}

      <div className={styles.sectionTitle}>社會政策 Social</div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={welfareDisplay}
          onChange={e => onSetWelfare(e.target.checked)}
        />
        <span className={styles.toggleLabel}>社會福利 Welfare</span>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={publicWorksDisplay}
          onChange={e => onSetPublicWorks(e.target.checked)}
        />
        <span className={styles.toggleLabel}>公共建設 Public Works</span>
      </label>

      <div className={styles.sectionTitle}>待生效政策 Pending</div>
      {pendingPolicies.length === 0 ? (
        <div className={styles.empty}>目前沒有待生效政策</div>
      ) : (
        <div className={styles.pendingList}>
          {pendingPolicies
            .slice()
            .sort((a, b) => a.applyTurn - b.applyTurn)
            .map(policy => (
              <div key={policy.id} className={styles.pendingItem}>
                <div className={styles.pendingMain}>
                  <span>{pendingSummary(policy)}</span>
                  <span className={styles.pendingTurns}>
                    還有 {Math.max(0, policy.applyTurn - turn)} 回合
                  </span>
                </div>
                <div className={styles.pendingSide}>
                  {policy.sideEffects.join(' / ')}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
