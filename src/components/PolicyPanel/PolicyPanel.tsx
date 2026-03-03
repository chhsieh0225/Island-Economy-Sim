import { useMemo } from 'react';
import type {
  ActiveRandomEvent,
  GovernmentState,
  MarketState,
  PendingPolicyChange,
  PolicyTimelineEntry,
  SectorType,
  TurnSnapshot,
} from '../../types';
import { Tooltip } from '../Tooltip/Tooltip';
import { POLICY_TOOLTIPS } from '../../data/tooltipContent';
import styles from './PolicyPanel.module.css';

interface Props {
  turn: number;
  government: GovernmentState;
  market: MarketState;
  statistics: TurnSnapshot[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
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

const SUBSIDY_TOOLTIP_KEY: Record<SectorType, keyof typeof POLICY_TOOLTIPS> = {
  food: 'subsidyFood',
  goods: 'subsidyGoods',
  services: 'subsidyServices',
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

function signed(value: number, digits: number = 1): string {
  const fixed = value.toFixed(digits);
  return value >= 0 ? `+${fixed}` : fixed;
}

function computeForecast(
  government: GovernmentState,
  stats: TurnSnapshot[],
  pendingPolicies: PendingPolicyChange[],
) {
  const latest = stats[stats.length - 1];
  if (!latest || latest.population === 0) return null;

  // Effective tax rate (check if pending tax change)
  const pendingTax = pendingPolicies.find(p => p.type === 'tax');
  const effectiveTaxRate = pendingTax ? (pendingTax.value as number) : government.taxRate;

  // Estimate taxable income: rough approximation from GDP
  const estimatedTaxableIncome = latest.gdp * 0.4;
  const estimatedTaxRevenue = estimatedTaxableIncome * effectiveTaxRate;

  // Welfare cost
  const welfareRecipients = government.welfareEnabled ? Math.floor(latest.population * 0.25) : 0;
  const welfareCost = welfareRecipients * 5; // CONFIG.WELFARE_AMOUNT

  // Public works cost
  const pwCost = government.publicWorksActive ? 50 : 0; // CONFIG.PUBLIC_WORKS_COST_PER_TURN

  const netTreasury = estimatedTaxRevenue - welfareCost - pwCost;

  return {
    taxRevenue: estimatedTaxRevenue,
    welfareCost,
    pwCost,
    netTreasury,
    effectiveTaxRate,
  };
}

export function PolicyPanel({
  turn,
  government,
  market,
  statistics,
  activeRandomEvents,
  pendingPolicies,
  policyTimeline,
  onSetTaxRate,
  onSetSubsidy,
  onSetWelfare,
  onSetPublicWorks,
}: Props) {
  const pendingTax = pendingPolicies.find(p => p.type === 'tax');
  const pendingWelfare = pendingPolicies.find(p => p.type === 'welfare');
  const pendingPublicWorks = pendingPolicies.find(p => p.type === 'publicWorks');
  const getSubsidyDisplay = (sector: SectorType): number => (
    (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === sector)?.value as number | undefined)
    ?? government.subsidies[sector]
  );

  const taxDisplay = (pendingTax ? pendingTax.value as number : government.taxRate) * 100;
  const welfareDisplay = pendingWelfare ? pendingWelfare.value as boolean : government.welfareEnabled;
  const publicWorksDisplay = pendingPublicWorks ? pendingPublicWorks.value as boolean : government.publicWorksActive;
  const latest = statistics.length > 0 ? statistics[statistics.length - 1] : null;
  const prev = statistics.length > 1 ? statistics[statistics.length - 2] : null;

  const forecast = useMemo(
    () => computeForecast(government, statistics, pendingPolicies),
    [government, statistics, pendingPolicies],
  );

  const shortageRatios = (['food', 'goods', 'services'] as const).map(sector => {
    const demand = market.demand[sector];
    if (demand <= 0.001) return 0;
    return Math.max(0, (demand - market.supply[sector]) / demand);
  });
  const shortagePressure = shortageRatios.reduce((s, v) => s + v, 0) / shortageRatios.length;
  const shortagePenalty = -Math.min(7, shortagePressure * 8.5);
  const taxPenalty = -Math.max(0, (government.taxRate - 0.1) * 24);
  const welfareBoost = government.welfareEnabled ? 1.4 : 0;
  const publicWorksBoost = government.publicWorksActive ? 0.9 : 0;
  const eventBoost = activeRandomEvents.reduce((sum, event) => (
    sum + (event.def.effects.satisfactionBoost ?? 0) - (event.def.effects.healthDamage ?? 0) * 0.28
  ), 0);
  const modelDelta = shortagePenalty + taxPenalty + welfareBoost + publicWorksBoost + eventBoost;
  const actualSatDelta = latest && prev ? latest.avgSatisfaction - prev.avgSatisfaction : null;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>政策控制 Policy</div>
      <div className={styles.delayHint}>政策有 1 回合延遲，右下方可查看待生效清單。</div>

      <div className={styles.control}>
        <div className={styles.controlLabel}>
          <Tooltip content={POLICY_TOOLTIPS.taxRate.content} detail={POLICY_TOOLTIPS.taxRate.detail}>
            <span>稅率 Tax Rate</span>
          </Tooltip>
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

      {(['food', 'goods', 'services'] as const).map(sector => {
        const subsidyDisplay = getSubsidyDisplay(sector);
        const tooltipKey = SUBSIDY_TOOLTIP_KEY[sector];
        const tip = POLICY_TOOLTIPS[tooltipKey];
        return (
          <div key={sector} className={styles.control}>
            <div className={styles.controlLabel}>
              <Tooltip content={tip.content} detail={tip.detail}>
                <span>{SECTOR_LABELS[sector]}</span>
              </Tooltip>
              <span className={styles.controlValue}>{subsidyDisplay.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="100"
              step="5"
              value={subsidyDisplay}
              onChange={e => onSetSubsidy(sector, Number(e.target.value))}
            />
          </div>
        );
      })}

      <div className={styles.sectionTitle}>社會政策 Social</div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={welfareDisplay}
          onChange={e => onSetWelfare(e.target.checked)}
        />
        <Tooltip content={POLICY_TOOLTIPS.welfare.content} detail={POLICY_TOOLTIPS.welfare.detail}>
          <span className={styles.toggleLabel}>社會福利 Welfare</span>
        </Tooltip>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={publicWorksDisplay}
          onChange={e => onSetPublicWorks(e.target.checked)}
        />
        <Tooltip content={POLICY_TOOLTIPS.publicWorks.content} detail={POLICY_TOOLTIPS.publicWorks.detail}>
          <span className={styles.toggleLabel}>公共建設 Public Works</span>
        </Tooltip>
      </label>

      {forecast && (
        <div className={styles.forecastCard}>
          <div className={styles.forecastTitle}>📊 下回合預測 Next-Turn Forecast</div>
          <div className={styles.forecastRow}>
            <span>稅收 Tax Revenue</span>
            <span className={styles.forecastPositive}>+${forecast.taxRevenue.toFixed(0)}</span>
          </div>
          {forecast.welfareCost > 0 && (
            <div className={styles.forecastRow}>
              <span>福利支出 Welfare</span>
              <span className={styles.forecastNegative}>-${forecast.welfareCost.toFixed(0)}</span>
            </div>
          )}
          {forecast.pwCost > 0 && (
            <div className={styles.forecastRow}>
              <span>公共建設 Public Works</span>
              <span className={styles.forecastNegative}>-${forecast.pwCost.toFixed(0)}</span>
            </div>
          )}
          <div className={`${styles.forecastRow} ${styles.forecastTotal}`}>
            <span>淨國庫變化 Net Treasury</span>
            <span className={forecast.netTreasury >= 0 ? styles.forecastPositive : styles.forecastNegative}>
              {forecast.netTreasury >= 0 ? '+' : ''}${forecast.netTreasury.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      <div className={styles.sectionTitle}>政策效果拆解 Policy Impact</div>
      {latest && prev ? (
        <div className={styles.impactCard}>
          <div className={styles.impactHeadline}>
            本回合滿意度 ΔSat:
            <span className={actualSatDelta! >= 0 ? styles.impactUp : styles.impactDown}>
              {signed(actualSatDelta!, 2)}%
            </span>
          </div>
          <div className={styles.impactLine}>
            <span>需求短缺壓力</span>
            <span className={shortagePenalty >= 0 ? styles.impactUp : styles.impactDown}>{signed(shortagePenalty)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>稅率負擔（{(government.taxRate * 100).toFixed(0)}%）</span>
            <span className={taxPenalty >= 0 ? styles.impactUp : styles.impactDown}>{signed(taxPenalty)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>福利/公共建設加成</span>
            <span className={(welfareBoost + publicWorksBoost) >= 0 ? styles.impactUp : styles.impactDown}>
              {signed(welfareBoost + publicWorksBoost)}
            </span>
          </div>
          <div className={styles.impactLine}>
            <span>事件影響</span>
            <span className={eventBoost >= 0 ? styles.impactUp : styles.impactDown}>{signed(eventBoost)}</span>
          </div>
          <div className={styles.impactFoot}>
            模型估計合計 {signed(modelDelta)}，可與實際 ΔSat 對照理解政策延遲與市場波動。
          </div>
        </div>
      ) : (
        <div className={styles.empty}>需要至少 2 回合資料才能拆解效果。</div>
      )}

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

      <div className={styles.sectionTitle}>政策因果時間線 Causal Timeline</div>
      {policyTimeline.length === 0 ? (
        <div className={styles.empty}>尚無政策紀錄。</div>
      ) : (
        <div className={styles.timelineList}>
          {policyTimeline.slice(0, 8).map(item => (
            <div key={item.id} className={styles.timelineItem}>
              <div className={styles.timelineMain}>
                <span>{item.summary}</span>
                <span className={item.status === 'pending' ? styles.pendingTurns : styles.timelineApplied}>
                  {item.status === 'pending'
                    ? `T${item.requestedTurn} → T${item.applyTurn}（待生效）`
                    : `T${item.requestedTurn} → T${item.resolvedTurn ?? item.applyTurn}（已生效）`}
                </span>
              </div>
              <div className={styles.pendingSide}>{item.sideEffects.join(' / ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
