import { useMemo } from 'react';
import { CONFIG } from '../../config';
import type {
  ActiveRandomEvent,
  GovernmentState,
  PendingPolicyChange,
  PolicyTimelineEntry,
  SectorType,
  TurnSnapshot,
} from '../../types';
import { Tooltip } from '../Tooltip/Tooltip';
import { POLICY_TOOLTIPS } from '../../data/tooltipContent';
import { buildPolicyExperimentCards } from '../../engine/modules/policyExperimentModule';
import {
  buildPolicyRecommendation,
  type PolicyRecommendationAction,
} from '../../engine/modules/policyRecommendationModule';
import styles from './PolicyPanel.module.css';

interface Props {
  turn: number;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  onSetTaxRate: (rate: number) => void;
  onSetSubsidy: (sector: SectorType, amount: number) => void;
  onSetWelfare: (enabled: boolean) => void;
  onSetPublicWorks: (active: boolean) => void;
  onSetPolicyRate: (rate: number) => void;
  onSetLiquiditySupport: (active: boolean) => void;
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
    case 'policyRate':
      return `政策利率 → ${((policy.value as number) * 100).toFixed(2)}%`;
    case 'liquiditySupport':
      return `流動性支持 → ${(policy.value as boolean) ? '開' : '關'}`;
  }
}

function signed(value: number, digits: number = 1): string {
  const fixed = value.toFixed(digits);
  return value >= 0 ? `+${fixed}` : fixed;
}

function statusLabel(status: 'pending' | 'collecting' | 'complete'): string {
  switch (status) {
    case 'pending':
      return '待生效';
    case 'collecting':
      return '觀察中';
    case 'complete':
      return '已結算';
  }
}

function recommendationActionLabel(action: PolicyRecommendationAction): string {
  switch (action.type) {
    case 'setTaxRate':
      return `稅率 ${(action.value * 100).toFixed(0)}%`;
    case 'setSubsidy':
      return `${SECTOR_LABELS[action.sector]} ${action.value.toFixed(0)}%`;
    case 'setWelfare':
      return `福利 ${action.value ? '啟用' : '停用'}`;
    case 'setPublicWorks':
      return `公共建設 ${action.value ? '啟用' : '停用'}`;
  }
}

interface EffectivePolicyState {
  taxRate: number;
  subsidies: Record<SectorType, number>;
  welfareEnabled: boolean;
  publicWorksActive: boolean;
}

function isRecommendationRedundant(
  action: PolicyRecommendationAction,
  effective: EffectivePolicyState,
): boolean {
  const eps = 1e-6;
  switch (action.type) {
    case 'setTaxRate':
      return Math.abs(action.value - effective.taxRate) <= eps;
    case 'setSubsidy':
      return Math.abs(action.value - effective.subsidies[action.sector]) <= eps;
    case 'setWelfare':
      return action.value === effective.welfareEnabled;
    case 'setPublicWorks':
      return action.value === effective.publicWorksActive;
  }
}

function topDrivers(drivers: { id: string; label: string; value: number }[]) {
  return [...drivers]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);
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
  const pendingPolicyRate = pendingPolicies.find(p => p.type === 'policyRate');
  const pendingWelfare = pendingPolicies.find(p => p.type === 'welfare');
  const pendingPublicWorks = pendingPolicies.find(p => p.type === 'publicWorks');
  const pendingLiquidity = pendingPolicies.find(p => p.type === 'liquiditySupport');
  const effectiveTaxRate = pendingTax ? (pendingTax.value as number) : government.taxRate;
  const effectivePolicyRate = pendingPolicyRate
    ? (pendingPolicyRate.value as number)
    : government.policyRate;
  const welfareEnabled = pendingWelfare
    ? (pendingWelfare.value as boolean)
    : government.welfareEnabled;
  const publicWorksEnabled = pendingPublicWorks
    ? (pendingPublicWorks.value as boolean)
    : government.publicWorksActive;

  // Estimate taxable income: rough approximation from GDP
  const estimatedTaxableIncome = latest.gdp * 0.4;
  const estimatedTaxRevenue = estimatedTaxableIncome * effectiveTaxRate;

  // Welfare cost
  const welfareRecipients = welfareEnabled ? Math.floor(latest.population * 0.25) : 0;
  const welfareCost = welfareRecipients * 5; // CONFIG.WELFARE_AMOUNT

  // Public works cost
  const pwCost = publicWorksEnabled ? 50 : 0; // CONFIG.PUBLIC_WORKS_COST_PER_TURN
  const liquidityEnabled = pendingLiquidity
    ? (pendingLiquidity.value as boolean)
    : government.liquiditySupportActive;
  const liquidityRecipients = liquidityEnabled
    ? Math.floor(latest.population * CONFIG.MONETARY_LIQUIDITY_TARGET_PERCENTILE)
    : 0;
  const liquidityCost = liquidityRecipients * CONFIG.MONETARY_LIQUIDITY_TRANSFER_PER_AGENT;

  const netTreasury = estimatedTaxRevenue - welfareCost - pwCost - liquidityCost;

  return {
    taxRevenue: estimatedTaxRevenue,
    welfareCost,
    pwCost,
    liquidityCost,
    effectivePolicyRate,
    netTreasury,
    effectiveTaxRate,
  };
}

export function PolicyPanel({
  turn,
  government,
  statistics,
  activeRandomEvents,
  pendingPolicies,
  policyTimeline,
  onSetTaxRate,
  onSetSubsidy,
  onSetWelfare,
  onSetPublicWorks,
  onSetPolicyRate,
  onSetLiquiditySupport,
}: Props) {
  const pendingTax = pendingPolicies.find(p => p.type === 'tax');
  const pendingPolicyRate = pendingPolicies.find(p => p.type === 'policyRate');
  const pendingWelfare = pendingPolicies.find(p => p.type === 'welfare');
  const pendingPublicWorks = pendingPolicies.find(p => p.type === 'publicWorks');
  const pendingLiquiditySupport = pendingPolicies.find(p => p.type === 'liquiditySupport');
  const getSubsidyDisplay = (sector: SectorType): number => (
    (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === sector)?.value as number | undefined)
    ?? government.subsidies[sector]
  );

  const taxDisplay = (pendingTax ? pendingTax.value as number : government.taxRate) * 100;
  const policyRateDisplay = (pendingPolicyRate ? pendingPolicyRate.value as number : government.policyRate) * 100;
  const welfareDisplay = pendingWelfare ? pendingWelfare.value as boolean : government.welfareEnabled;
  const publicWorksDisplay = pendingPublicWorks ? pendingPublicWorks.value as boolean : government.publicWorksActive;
  const liquiditySupportDisplay = pendingLiquiditySupport
    ? pendingLiquiditySupport.value as boolean
    : government.liquiditySupportActive;
  const latest = statistics.length > 0 ? statistics[statistics.length - 1] : null;
  const activeEventCount = activeRandomEvents.length;

  const forecast = useMemo(
    () => computeForecast(government, statistics, pendingPolicies),
    [government, statistics, pendingPolicies],
  );
  const experimentCards = useMemo(
    () => buildPolicyExperimentCards(policyTimeline, statistics, { maxCards: 4, observationTurns: 3 }),
    [policyTimeline, statistics],
  );
  const effectivePolicyState = useMemo<EffectivePolicyState>(() => ({
    taxRate: pendingTax ? pendingTax.value as number : government.taxRate,
    subsidies: {
      food: (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === 'food')?.value as number | undefined)
        ?? government.subsidies.food,
      goods: (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === 'goods')?.value as number | undefined)
        ?? government.subsidies.goods,
      services: (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === 'services')?.value as number | undefined)
        ?? government.subsidies.services,
    },
    welfareEnabled: pendingWelfare ? pendingWelfare.value as boolean : government.welfareEnabled,
    publicWorksActive: pendingPublicWorks ? pendingPublicWorks.value as boolean : government.publicWorksActive,
  }), [government, pendingTax, pendingWelfare, pendingPublicWorks, pendingPolicies]);
  const recommendationByCardId = useMemo(
    () => new Map(experimentCards.map(card => {
      const recommendation = buildPolicyRecommendation(card, government);
      if (!recommendation) return [card.id, null] as const;
      if (isRecommendationRedundant(recommendation.action, effectivePolicyState)) {
        return [card.id, null] as const;
      }
      return [card.id, recommendation] as const;
    })),
    [experimentCards, government, effectivePolicyState],
  );

  const applyRecommendation = (action: PolicyRecommendationAction) => {
    switch (action.type) {
      case 'setTaxRate':
        onSetTaxRate(action.value);
        return;
      case 'setSubsidy':
        onSetSubsidy(action.sector, action.value);
        return;
      case 'setWelfare':
        onSetWelfare(action.value);
        return;
      case 'setPublicWorks':
        onSetPublicWorks(action.value);
        return;
    }
  };

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

      <div className={styles.sectionTitle}>貨幣政策 Monetary</div>
      <div className={styles.control}>
        <div className={styles.controlLabel}>
          <Tooltip content={POLICY_TOOLTIPS.policyRate.content} detail={POLICY_TOOLTIPS.policyRate.detail}>
            <span>政策利率 Policy Rate</span>
          </Tooltip>
          <span className={styles.controlValue}>{policyRateDisplay.toFixed(2)}%</span>
        </div>
        <input
          type="range"
          className={styles.slider}
          min="0"
          max="8"
          step="0.25"
          value={policyRateDisplay}
          onChange={e => onSetPolicyRate(Number(e.target.value) / 100)}
        />
      </div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={liquiditySupportDisplay}
          onChange={e => onSetLiquiditySupport(e.target.checked)}
        />
        <Tooltip content={POLICY_TOOLTIPS.liquiditySupport.content} detail={POLICY_TOOLTIPS.liquiditySupport.detail}>
          <span className={styles.toggleLabel}>流動性支持 Liquidity Support</span>
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
          {forecast.liquidityCost > 0 && (
            <div className={styles.forecastRow}>
              <span>流動性注入 Liquidity</span>
              <span className={styles.forecastNegative}>-${forecast.liquidityCost.toFixed(0)}</span>
            </div>
          )}
          <div className={styles.forecastRow}>
            <span>政策利率 Policy Rate</span>
            <span>{(forecast.effectivePolicyRate * 100).toFixed(2)}%</span>
          </div>
          <div className={`${styles.forecastRow} ${styles.forecastTotal}`}>
            <span>淨國庫變化 Net Treasury</span>
            <span className={forecast.netTreasury >= 0 ? styles.forecastPositive : styles.forecastNegative}>
              {forecast.netTreasury >= 0 ? '+' : ''}${forecast.netTreasury.toFixed(0)}
            </span>
          </div>
          {activeEventCount > 0 && (
            <div className={styles.forecastRow}>
              <span>進行中事件 Active Events</span>
              <span>{activeEventCount}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.sectionTitle}>政策效果拆解 Policy Impact</div>
      {latest ? (
        <div className={styles.impactCard}>
          <div className={styles.impactHeadline}>
            本回合滿意度 ΔSat:
            <span className={latest.causalReplay.satisfaction.net >= 0 ? styles.impactUp : styles.impactDown}>
              {signed(latest.causalReplay.satisfaction.net, 2)}%
            </span>
          </div>
          {topDrivers(latest.causalReplay.satisfaction.drivers).map(driver => (
            <div key={driver.id} className={styles.impactLine}>
              <span>{driver.label}</span>
              <span className={driver.value >= 0 ? styles.impactUp : styles.impactDown}>{signed(driver.value)}</span>
            </div>
          ))}
          <div className={styles.impactLine}>
            <span>稅收實績</span>
            <span className={styles.impactUp}>+${latest.causalReplay.policy.taxCollected.toFixed(0)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>福利發放（{latest.causalReplay.policy.welfareRecipients} 人）</span>
            <span className={styles.impactDown}>-${latest.causalReplay.policy.welfarePaid.toFixed(0)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>公共建設支出</span>
            <span className={styles.impactDown}>-${latest.causalReplay.policy.publicWorksCost.toFixed(0)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>流動性注入</span>
            <span className={styles.impactDown}>-${latest.causalReplay.policy.liquidityInjected.toFixed(0)}</span>
          </div>
          <div className={styles.impactLine}>
            <span>政策利率</span>
            <span>{(latest.causalReplay.policy.policyRate * 100).toFixed(2)}%</span>
          </div>
          <div className={styles.impactLine}>
            <span>人均可支配現金 Δ</span>
            <span className={latest.causalReplay.policy.perCapitaCashDelta >= 0 ? styles.impactUp : styles.impactDown}>
              {signed(latest.causalReplay.policy.perCapitaCashDelta, 2)}
            </span>
          </div>
          <div className={styles.impactFoot}>
            本區塊改為「純實際執行追蹤」，不再使用估算模型。
          </div>
        </div>
      ) : (
        <div className={styles.empty}>需要至少 1 回合資料才能拆解效果。</div>
      )}

      <div className={styles.sectionTitle}>政策實驗卡 Prediction → Action → Outcome</div>
      {experimentCards.length === 0 ? (
        <div className={styles.empty}>先下達至少 1 次政策，這裡會自動追蹤預測與實際結果。</div>
      ) : (
        <div className={styles.experimentList}>
          {experimentCards.map(card => {
            const recommendation = recommendationByCardId.get(card.id) ?? null;
            return (
              <div key={card.id} className={styles.experimentCard}>
                <div className={styles.experimentHead}>
                  <span className={styles.experimentTitle}>{card.summary}</span>
                  <span className={`${styles.experimentStatus} ${styles[`experimentStatus${card.status}`]}`}>
                    {statusLabel(card.status)}
                  </span>
                </div>
                <div className={styles.experimentMeta}>
                  行動 T{card.requestedTurn}，生效 T{card.applyTurn}，觀察窗 T{card.applyTurn}~T{card.windowEndTurn}
                </div>
                <div className={styles.experimentBlock}>
                  <div className={styles.experimentBlockTitle}>Prediction</div>
                  <div className={styles.experimentPrediction}>{card.predictions.join(' / ')}</div>
                </div>
                <div className={styles.experimentBlock}>
                  <div className={styles.experimentBlockTitle}>Outcome</div>
                  {!card.metrics ? (
                    <div className={styles.experimentPending}>
                      {card.status === 'pending'
                        ? '尚未進入觀察窗口。'
                        : `資料收集中（目前觀察到 T${card.observedTurn ?? '-'}）。`}
                    </div>
                  ) : (
                    <div className={styles.experimentMetrics}>
                      <div className={styles.experimentMetric}>
                        <span>滿意度 Δ</span>
                        <span className={card.metrics.satisfactionDelta >= 0 ? styles.impactUp : styles.impactDown}>
                          {signed(card.metrics.satisfactionDelta, 2)}
                        </span>
                      </div>
                      <div className={styles.experimentMetric}>
                        <span>國庫 Δ</span>
                        <span className={card.metrics.treasuryDelta >= 0 ? styles.impactUp : styles.impactDown}>
                          {signed(card.metrics.treasuryDelta, 0)}
                        </span>
                      </div>
                      <div className={styles.experimentMetric}>
                        <span>GDP Δ%</span>
                        <span className={card.metrics.gdpDeltaPercent >= 0 ? styles.impactUp : styles.impactDown}>
                          {signed(card.metrics.gdpDeltaPercent, 2)}%
                        </span>
                      </div>
                      <div className={styles.experimentMetric}>
                        <span>人口淨變化</span>
                        <span className={card.metrics.populationDelta >= 0 ? styles.impactUp : styles.impactDown}>
                          {signed(card.metrics.populationDelta, 0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {recommendation ? (
                  <div className={styles.experimentRecommend}>
                    <div className={styles.experimentRecommendText}>{recommendation.reason}</div>
                    <div className={styles.experimentImpactHint}>{recommendation.impactHint}</div>
                    <button
                      className={styles.experimentRecommendBtn}
                      onClick={() => applyRecommendation(recommendation.action)}
                    >
                      採納建議：{recommendationActionLabel(recommendation.action)}
                    </button>
                  </div>
                ) : (
                  <div className={styles.experimentRecommendIdle}>
                    目前訊號偏中性，建議先觀察下一個窗口。
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
