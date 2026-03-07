import { useMemo, memo, useCallback } from 'react';
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
import { buildPolicyExperimentCards, type PolicyExperimentCard } from '../../engine/modules/policyExperimentModule';
import {
  buildPolicyRecommendation,
  type PolicyRecommendationAction,
} from '../../engine/modules/policyRecommendationModule';
import { useGameStore } from '../../stores/gameStore';
import { useCounterfactualStore } from '../../stores/counterfactualStore';
import type { PolicyAction } from '../../engine/modules/saveLoadModule';
import type { CounterfactualRequest } from '../../engine/modules/counterfactualModule';
import { CounterfactualPanel } from '../CounterfactualPanel/CounterfactualPanel';
import { useI18n } from '../../i18n/useI18n';
import styles from './PolicyPanel.module.css';

interface Props {
  turn: number;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  onSetTaxRate: (rate: number) => void;
  onSetTaxMode: (mode: 'flat' | 'progressive') => void;
  onSetSubsidy: (sector: SectorType, amount: number) => void;
  onSetWelfare: (enabled: boolean) => void;
  onSetPublicWorks: (active: boolean) => void;
  onSetPolicyRate: (rate: number) => void;
  onSetLiquiditySupport: (active: boolean) => void;
  /** When set, only show the specified policy sections (tutorial mode) */
  enabledSections?: Set<string>;
}

const SUBSIDY_TOOLTIP_KEY: Record<SectorType, keyof typeof POLICY_TOOLTIPS> = {
  food: 'subsidyFood',
  goods: 'subsidyGoods',
  services: 'subsidyServices',
};

function pendingSummary(policy: PendingPolicyChange, t: (key: string) => string): string {
  const on = t('policy.on');
  const off = t('policy.off');
  switch (policy.type) {
    case 'tax':
      return `${t('policy.taxRate')} → ${((policy.value as number) * 100).toFixed(0)}%`;
    case 'taxMode':
      return `${t('policy.taxMode')} → ${(policy.value as string) === 'progressive' ? t('policy.taxMode.progressive') : t('policy.taxMode.flat')}`;
    case 'subsidy':
      return `${t(`policy.subsidy.${policy.sector}`)} → ${(policy.value as number).toFixed(0)}%`;
    case 'welfare':
      return `${t('policy.welfare')} → ${(policy.value as boolean) ? on : off}`;
    case 'publicWorks':
      return `${t('policy.publicWorks')} → ${(policy.value as boolean) ? on : off}`;
    case 'policyRate':
      return `${t('policy.policyRate')} → ${((policy.value as number) * 100).toFixed(2)}%`;
    case 'liquiditySupport':
      return `${t('policy.liquiditySupport')} → ${(policy.value as boolean) ? on : off}`;
  }
}

function signed(value: number, digits: number = 1): string {
  const fixed = value.toFixed(digits);
  return value >= 0 ? `+${fixed}` : fixed;
}

function statusLabel(status: 'pending' | 'collecting' | 'complete', t: (key: string) => string): string {
  switch (status) {
    case 'pending':
      return t('policy.experiment.pending');
    case 'collecting':
      return t('policy.experiment.collecting');
    case 'complete':
      return t('policy.experiment.complete');
  }
}

function recommendationActionLabel(action: PolicyRecommendationAction, t: (key: string) => string): string {
  const on = t('policy.enabled');
  const off = t('policy.disabled');
  switch (action.type) {
    case 'setTaxRate':
      return `${t('policy.taxRate')} ${(action.value * 100).toFixed(0)}%`;
    case 'setSubsidy':
      return `${t(`policy.subsidy.${action.sector}`)} ${action.value.toFixed(0)}%`;
    case 'setWelfare':
      return `${t('policy.welfare')} ${action.value ? on : off}`;
    case 'setPublicWorks':
      return `${t('policy.publicWorks')} ${action.value ? on : off}`;
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

  const estimatedTaxableIncome = latest.gdp * 0.4;
  const estimatedTaxRevenue = estimatedTaxableIncome * effectiveTaxRate;

  const welfareRecipients = welfareEnabled ? Math.floor(latest.population * 0.25) : 0;
  const welfareCost = welfareRecipients * 5;

  const pwCost = publicWorksEnabled ? 50 : 0;
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

export const PolicyPanel = memo(function PolicyPanel({
  turn,
  government,
  statistics,
  activeRandomEvents,
  pendingPolicies,
  policyTimeline,
  onSetTaxRate,
  onSetTaxMode,
  onSetSubsidy,
  onSetWelfare,
  onSetPublicWorks,
  onSetPolicyRate,
  onSetLiquiditySupport,
  enabledSections,
}: Props) {
  const { t } = useI18n();
  const isTutorial = enabledSections !== undefined;
  const showSection = (section: string): boolean =>
    !isTutorial || enabledSections.has(section);
  const pendingTax = pendingPolicies.find(p => p.type === 'tax');
  const pendingTaxMode = pendingPolicies.find(p => p.type === 'taxMode');
  const pendingPolicyRate = pendingPolicies.find(p => p.type === 'policyRate');
  const pendingWelfare = pendingPolicies.find(p => p.type === 'welfare');
  const pendingPublicWorks = pendingPolicies.find(p => p.type === 'publicWorks');
  const pendingLiquiditySupport = pendingPolicies.find(p => p.type === 'liquiditySupport');
  const getSubsidyDisplay = (sector: SectorType): number => (
    (pendingPolicies.find(p => p.type === 'subsidy' && p.sector === sector)?.value as number | undefined)
    ?? government.subsidies[sector]
  );

  const taxModeDisplay = pendingTaxMode
    ? pendingTaxMode.value as string
    : government.taxMode;
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

  const gameSeed = useGameStore(s => s.gameState.seed);
  const gameScenarioId = useGameStore(s => s.gameState.scenarioId);
  const calibrationMode = useGameStore(s => s.economicCalibrationMode);
  const getPolicyLog = useGameStore(s => s.getPolicyLog);
  const runComparison = useCounterfactualStore(s => s.runComparison);
  const cfResult = useCounterfactualStore(s => s.result);
  const cfLoading = useCounterfactualStore(s => s.loading);

  const handleWhatIf = useCallback((card: PolicyExperimentCard) => {
    const policyLog = getPolicyLog();
    let omittedAction: PolicyAction;
    switch (card.type) {
      case 'tax':
        omittedAction = { type: 'taxRate', value: card.value as number };
        break;
      case 'subsidy':
        omittedAction = { type: 'subsidy', sector: card.sector!, value: card.value as number };
        break;
      case 'welfare':
        omittedAction = { type: 'welfare', enabled: card.value as boolean };
        break;
      case 'publicWorks':
        omittedAction = { type: 'publicWorks', active: card.value as boolean };
        break;
      case 'policyRate':
        omittedAction = { type: 'policyRate', value: card.value as number };
        break;
      case 'liquiditySupport':
        omittedAction = { type: 'liquiditySupport', active: card.value as boolean };
        break;
      case 'taxMode':
        omittedAction = { type: 'taxMode', mode: card.value as 'flat' | 'progressive' };
        break;
      default:
        return;
    }

    const request: CounterfactualRequest = {
      seed: gameSeed,
      scenarioId: gameScenarioId,
      calibrationProfileId: calibrationMode,
      policyLog,
      requestTurn: card.requestedTurn,
      applyTurn: card.applyTurn,
      omittedAction,
      forecastTurns: 5,
    };
    runComparison(request, card.summary);
  }, [gameSeed, gameScenarioId, calibrationMode, getPolicyLog, runComparison]);

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('policy.title')}</div>
      {!isTutorial && (
        <div className={styles.delayHint}>{t('policy.delayHint')}</div>
      )}
      {isTutorial && (
        <div className={styles.delayHint}>{t('policy.delayHintTutorial')}</div>
      )}

      {showSection('taxRate') && (
        <div className={styles.control}>
          <div className={styles.controlLabel}>
            <Tooltip content={POLICY_TOOLTIPS.taxRate.content} detail={POLICY_TOOLTIPS.taxRate.detail}>
              <span>{t('policy.taxRate')}</span>
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
          <div className={styles.taxModeRow}>
            <Tooltip content={POLICY_TOOLTIPS.taxMode.content} detail={POLICY_TOOLTIPS.taxMode.detail}>
              <span className={styles.taxModeLabel}>{t('policy.taxMode')}</span>
            </Tooltip>
            <div className={styles.taxModeSwitch}>
              <button
                className={`${styles.taxModeBtn} ${taxModeDisplay === 'flat' ? styles.taxModeBtnActive : ''}`}
                onClick={() => onSetTaxMode('flat')}
              >
                {t('policy.taxMode.flat')}
              </button>
              <button
                className={`${styles.taxModeBtn} ${taxModeDisplay === 'progressive' ? styles.taxModeBtnActive : ''}`}
                onClick={() => onSetTaxMode('progressive')}
              >
                {t('policy.taxMode.progressive')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSection('subsidy') && (
        <>
          <div className={styles.sectionTitle}>{t('policy.subsidies')}</div>

          {(['food', 'goods', 'services'] as const).map(sector => {
            const subsidyDisplay = getSubsidyDisplay(sector);
            const tooltipKey = SUBSIDY_TOOLTIP_KEY[sector];
            const tip = POLICY_TOOLTIPS[tooltipKey];
            return (
              <div key={sector} className={styles.control}>
                <div className={styles.controlLabel}>
                  <Tooltip content={tip.content} detail={tip.detail}>
                    <span>{t(`policy.subsidy.${sector}`)}</span>
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
        </>
      )}

      {(showSection('welfare') || showSection('publicWorks')) && (
        <div className={styles.sectionTitle}>{t('policy.social')}</div>
      )}

      {showSection('welfare') && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={welfareDisplay}
            onChange={e => onSetWelfare(e.target.checked)}
          />
          <Tooltip content={POLICY_TOOLTIPS.welfare.content} detail={POLICY_TOOLTIPS.welfare.detail}>
            <span className={styles.toggleLabel}>{t('policy.welfare')}</span>
          </Tooltip>
        </label>
      )}

      {showSection('publicWorks') && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={publicWorksDisplay}
            onChange={e => onSetPublicWorks(e.target.checked)}
          />
          <Tooltip content={POLICY_TOOLTIPS.publicWorks.content} detail={POLICY_TOOLTIPS.publicWorks.detail}>
            <span className={styles.toggleLabel}>{t('policy.publicWorks')}</span>
          </Tooltip>
        </label>
      )}

      {(showSection('policyRate') || showSection('liquiditySupport')) && (
        <div className={styles.sectionTitle}>{t('policy.monetary')}</div>
      )}

      {showSection('policyRate') && (
        <div className={styles.control}>
          <div className={styles.controlLabel}>
            <Tooltip content={POLICY_TOOLTIPS.policyRate.content} detail={POLICY_TOOLTIPS.policyRate.detail}>
              <span>{t('policy.policyRate')}</span>
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
      )}

      {showSection('liquiditySupport') && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={liquiditySupportDisplay}
            onChange={e => onSetLiquiditySupport(e.target.checked)}
          />
          <Tooltip content={POLICY_TOOLTIPS.liquiditySupport.content} detail={POLICY_TOOLTIPS.liquiditySupport.detail}>
            <span className={styles.toggleLabel}>{t('policy.liquiditySupport')}</span>
          </Tooltip>
        </label>
      )}

      {!isTutorial && forecast && (
        <div className={styles.forecastCard}>
          <div className={styles.forecastTitle}>📊 {t('policy.forecast')}</div>
          <div className={styles.forecastRow}>
            <span>{t('policy.forecast.taxRevenue')}</span>
            <span className={styles.forecastPositive}>+${forecast.taxRevenue.toFixed(0)}</span>
          </div>
          {forecast.welfareCost > 0 && (
            <div className={styles.forecastRow}>
              <span>{t('policy.forecast.welfare')}</span>
              <span className={styles.forecastNegative}>-${forecast.welfareCost.toFixed(0)}</span>
            </div>
          )}
          {forecast.pwCost > 0 && (
            <div className={styles.forecastRow}>
              <span>{t('policy.forecast.publicWorks')}</span>
              <span className={styles.forecastNegative}>-${forecast.pwCost.toFixed(0)}</span>
            </div>
          )}
          {forecast.liquidityCost > 0 && (
            <div className={styles.forecastRow}>
              <span>{t('policy.forecast.liquidity')}</span>
              <span className={styles.forecastNegative}>-${forecast.liquidityCost.toFixed(0)}</span>
            </div>
          )}
          <div className={styles.forecastRow}>
            <span>{t('policy.forecast.policyRate')}</span>
            <span>{(forecast.effectivePolicyRate * 100).toFixed(2)}%</span>
          </div>
          <div className={`${styles.forecastRow} ${styles.forecastTotal}`}>
            <span>{t('policy.forecast.netTreasury')}</span>
            <span className={forecast.netTreasury >= 0 ? styles.forecastPositive : styles.forecastNegative}>
              {forecast.netTreasury >= 0 ? '+' : ''}${forecast.netTreasury.toFixed(0)}
            </span>
          </div>
          {activeEventCount > 0 && (
            <div className={styles.forecastRow}>
              <span>{t('policy.activeEvents')}</span>
              <span>{activeEventCount}</span>
            </div>
          )}
        </div>
      )}

      {!isTutorial && (
        <>
          <div className={styles.sectionTitle}>{t('policy.impact')}</div>
          {latest ? (
            <div className={styles.impactCard}>
              <div className={styles.impactHeadline}>
                {t('policy.impact.satDelta')}:
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
                <span>{t('policy.impact.taxActual')}</span>
                <span className={styles.impactUp}>+${latest.causalReplay.policy.taxCollected.toFixed(0)}</span>
              </div>
              <div className={styles.impactLine}>
                <span>{t('policy.impact.welfareWithRecipients').replace('{n}', String(latest.causalReplay.policy.welfareRecipients))}</span>
                <span className={styles.impactDown}>-${latest.causalReplay.policy.welfarePaid.toFixed(0)}</span>
              </div>
              <div className={styles.impactLine}>
                <span>{t('policy.impact.pwActual')}</span>
                <span className={styles.impactDown}>-${latest.causalReplay.policy.publicWorksCost.toFixed(0)}</span>
              </div>
              <div className={styles.impactLine}>
                <span>{t('policy.impact.liquidityActual')}</span>
                <span className={styles.impactDown}>-${latest.causalReplay.policy.liquidityInjected.toFixed(0)}</span>
              </div>
              <div className={styles.impactLine}>
                <span>{t('policy.impact.rateActual')}</span>
                <span>{(latest.causalReplay.policy.policyRate * 100).toFixed(2)}%</span>
              </div>
              <div className={styles.impactLine}>
                <span>{t('policy.impact.cashDelta')}</span>
                <span className={latest.causalReplay.policy.perCapitaCashDelta >= 0 ? styles.impactUp : styles.impactDown}>
                  {signed(latest.causalReplay.policy.perCapitaCashDelta, 2)}
                </span>
              </div>
              <div className={styles.impactFoot}>
                {t('policy.impact.note')}
              </div>
            </div>
          ) : (
            <div className={styles.empty}>{t('policy.impact.noData')}</div>
          )}

          <div className={styles.sectionTitle}>{t('policy.experiment')}</div>
          {experimentCards.length === 0 ? (
            <div className={styles.empty}>{t('policy.experiment.noData')}</div>
          ) : (
            <div className={styles.experimentList}>
              {experimentCards.map(card => {
                const recommendation = recommendationByCardId.get(card.id) ?? null;
                return (
                  <div key={card.id} className={styles.experimentCard}>
                    <div className={styles.experimentHead}>
                      <span className={styles.experimentTitle}>{card.summary}</span>
                      <span className={`${styles.experimentStatus} ${styles[`experimentStatus${card.status}`]}`}>
                        {statusLabel(card.status, t)}
                      </span>
                    </div>
                    <div className={styles.experimentMeta}>
                      {t('policy.experiment.actionMeta')
                        .replace('{t1}', String(card.requestedTurn))
                        .replace('{t2}', String(card.applyTurn))
                        .replace('{t3}', String(card.windowEndTurn))
                        .replace('{t2}', String(card.applyTurn))}
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
                            ? t('policy.experiment.notInWindow')
                            : t('policy.experiment.collectingMsg').replace('{t}', String(card.observedTurn ?? '-'))}
                        </div>
                      ) : (
                        <div className={styles.experimentMetrics}>
                          <div className={styles.experimentMetric}>
                            <span>{t('dashboard.causal.satisfaction')}</span>
                            <span className={card.metrics.satisfactionDelta >= 0 ? styles.impactUp : styles.impactDown}>
                              {signed(card.metrics.satisfactionDelta, 2)}
                            </span>
                          </div>
                          <div className={styles.experimentMetric}>
                            <span>{t('dashboard.causal.treasuryDelta')}</span>
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
                            <span>{t('policy.experiment.popDelta')}</span>
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
                          {t('policy.experiment.adoptRecommend').replace('{action}', recommendationActionLabel(recommendation.action, t))}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.experimentRecommendIdle}>
                        {t('policy.experiment.neutral')}
                      </div>
                    )}
                    {card.status === 'complete' && (
                      <button
                        className={styles.whatIfBtn}
                        onClick={() => handleWhatIf(card)}
                        disabled={cfLoading}
                      >
                        {cfLoading ? t('policy.experiment.simulating') : t('policy.experiment.whatIf')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {cfResult && <CounterfactualPanel />}

          <div className={styles.sectionTitle}>{t('policy.pending')}</div>
          {pendingPolicies.length === 0 ? (
            <div className={styles.empty}>{t('policy.pending.empty')}</div>
          ) : (
            <div className={styles.pendingList}>
              {pendingPolicies
                .slice()
                .sort((a, b) => a.applyTurn - b.applyTurn)
                .map(policy => (
                  <div key={policy.id} className={styles.pendingItem}>
                    <div className={styles.pendingMain}>
                      <span>{pendingSummary(policy, t)}</span>
                      <span className={styles.pendingTurns}>
                        {t('policy.pending.turnsLeft').replace('{n}', String(Math.max(0, policy.applyTurn - turn)))}
                      </span>
                    </div>
                    <div className={styles.pendingSide}>
                      {policy.sideEffects.join(' / ')}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className={styles.sectionTitle}>{t('policy.timeline')}</div>
          {policyTimeline.length === 0 ? (
            <div className={styles.empty}>{t('policy.timeline.empty')}</div>
          ) : (
            <div className={styles.timelineList}>
              {policyTimeline.slice(0, 8).map(item => (
                <div key={item.id} className={styles.timelineItem}>
                  <div className={styles.timelineMain}>
                    <span>{item.summary}</span>
                    <span className={item.status === 'pending' ? styles.pendingTurns : styles.timelineApplied}>
                      {item.status === 'pending'
                        ? `T${item.requestedTurn} → T${item.applyTurn} ${t('policy.timeline.pendingLabel')}`
                        : `T${item.requestedTurn} → T${item.resolvedTurn ?? item.applyTurn} ${t('policy.timeline.appliedLabel')}`}
                    </span>
                  </div>
                  <div className={styles.pendingSide}>{item.sideEffects.join(' / ')}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});
