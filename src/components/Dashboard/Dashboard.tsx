import { memo, useState } from 'react';
import type { EconomyStage, GameState, SectorType, TurnCausalReplay } from '../../types';
import { CONFIG } from '../../config';
import { getEventDemandMultipliers } from '../../engine/phases/productionPhase';
import { Tooltip } from '../Tooltip/Tooltip';
import { DASHBOARD_TOOLTIPS } from '../../data/tooltipContent';
import { useI18n } from '../../i18n/useI18n';
import styles from './Dashboard.module.css';

interface Props {
  state: GameState;
}

type AlertLevel = 'watch' | 'warning' | 'critical';

interface SentimentAlert {
  level: AlertLevel;
  title: string;
  message: string;
  actions: string[];
}

interface GovernorObjective {
  id: string;
  horizon: string;
  title: string;
  progress: number; // 0-100
  hint: string;
  done: boolean;
}

function getUnlockedSectors(stage: EconomyStage): SectorType[] {
  switch (stage) {
    case 'agriculture':
      return ['food'];
    case 'industrial':
      return ['food', 'goods'];
    case 'service':
      return ['food', 'goods', 'services'];
  }
}

function buildSentimentAlert(state: GameState, t: (key: string) => string): SentimentAlert | null {
  const alive = state.agents.filter(a => a.alive);
  if (alive.length === 0) return null;

  const stats = state.statistics;
  const latest = stats.length > 0 ? stats[stats.length - 1] : null;
  const prev = stats.length > 1 ? stats[stats.length - 2] : null;
  if (!latest) return null;

  const avgSat = latest.avgSatisfaction;
  const satDelta = prev ? avgSat - prev.avgSatisfaction : 0;
  const gini = latest.giniCoefficient;
  const lowSatCount = alive.filter(a => a.satisfaction < 35).length;
  const nearLeaveCount = alive.filter(a => a.satisfaction <= 12 && a.turnsInSector > 5).length;
  const lowSatRate = lowSatCount / alive.length;
  const nearLeaveRate = nearLeaveCount / alive.length;

  const unlockedSectors = getUnlockedSectors(state.economyStage);
  // Deflate demand by event-driven multipliers so temporary demand spikes
  // (e.g. festival servicesDemandBoost 1.3×) don't trigger false shortage alerts.
  const eventMults = getEventDemandMultipliers(state.activeRandomEvents);
  const shortages = unlockedSectors.filter(sector => {
    const demand = state.market.demand[sector];
    const supply = state.market.supply[sector];
    if (demand <= 0.01) return false;
    const baseDemand = demand / (eventMults[sector] ?? 1);
    return supply < baseDemand * CONFIG.SHORTAGE_THRESHOLD;
  });

  const actions: string[] = [];
  if (shortages.includes('food')) actions.push(t('alert.action.foodSubsidy'));
  if (shortages.includes('goods')) actions.push(t('alert.action.goodsSubsidy'));
  if (shortages.includes('services')) actions.push(t('alert.action.servicesSubsidy'));
  if (gini > 0.45) actions.push(t('alert.action.welfare'));
  if (state.government.taxRate > 0.2) actions.push(t('alert.action.lowerTax'));
  if (actions.length === 0) actions.push(t('alert.action.default'));

  const shortageLabel = shortages.map(s => t(`sector.${s}`)).join(t('common.listSeparator'));
  if (avgSat < 34 || nearLeaveRate > 0.12 || (satDelta < -4 && avgSat < 45)) {
    return {
      level: 'critical',
      title: t('alert.critical.title'),
      message: shortageLabel
        ? t('alert.critical.withShortage').replace('{sectors}', shortageLabel)
        : t('alert.critical.noShortage'),
      actions: actions.slice(0, 2),
    };
  }

  if (avgSat < 48 || lowSatRate > 0.2 || shortages.length >= 2 || gini > 0.5) {
    return {
      level: 'warning',
      title: t('alert.warning.title'),
      message: shortageLabel
        ? t('alert.warning.withShortage').replace('{sectors}', shortageLabel)
        : t('alert.warning.noShortage'),
      actions: actions.slice(0, 2),
    };
  }

  if (avgSat < 60 || satDelta < -2 || shortages.length === 1 || gini > 0.42) {
    return {
      level: 'watch',
      title: t('alert.watch.title'),
      message: shortageLabel
        ? t('alert.watch.withShortage').replace('{sectors}', shortageLabel)
        : t('alert.watch.noShortage'),
      actions: actions.slice(0, 1),
    };
  }

  return null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function signed(value: number, digits: number = 2): string {
  const text = value.toFixed(digits);
  return value >= 0 ? `+${text}` : text;
}

function topDrivers(metric: TurnCausalReplay['satisfaction']) {
  return [...metric.drivers]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);
}

function leadDriverLabel(metric: TurnCausalReplay['satisfaction'], fallback: string): string {
  const first = topDrivers(metric)[0];
  return first ? first.label : fallback;
}

function buildObjectives(state: GameState, t: (key: string) => string): GovernorObjective[] {
  const latest = state.statistics[state.statistics.length - 1];
  const alive = state.agents.filter(a => a.alive);
  const pop = alive.length;

  const foodDemand = latest?.market.demand.food ?? state.market.demand.food;
  const foodSupply = latest?.market.supply.food ?? state.market.supply.food;
  const foodCoverage = foodDemand > 0.01 ? clamp01(foodSupply / foodDemand) : 1;

  const avgSat = latest?.avgSatisfaction ?? 55;
  const satProgress = clamp01(avgSat / 62);

  const gini = latest?.giniCoefficient ?? 0.5;
  const giniProgress = clamp01((0.62 - gini) / 0.2);

  const targetPop = Math.max(70, Math.floor(CONFIG.INITIAL_POPULATION * 0.95));
  const popProgress = clamp01(pop / targetPop);

  return [
    {
      id: 'food_stability',
      horizon: t('horizon.short'),
      title: t('objective.food'),
      progress: foodCoverage * 100,
      hint: foodCoverage >= 1
        ? t('objective.food.done')
        : t('objective.food.hint'),
      done: foodCoverage >= 1,
    },
    {
      id: 'sentiment_recovery',
      horizon: t('horizon.short'),
      title: t('objective.sentiment'),
      progress: satProgress * 100,
      hint: avgSat >= 62
        ? t('objective.sentiment.done')
        : t('objective.sentiment.hint'),
      done: avgSat >= 62,
    },
    {
      id: 'equity_guardrail',
      horizon: t('horizon.mid'),
      title: t('objective.equity'),
      progress: giniProgress * 100,
      hint: gini <= 0.42
        ? t('objective.equity.done')
        : t('objective.equity.hint'),
      done: gini <= 0.42,
    },
    {
      id: 'population_retention',
      horizon: t('horizon.mid'),
      title: t('objective.population').replace('{target}', String(targetPop)),
      progress: popProgress * 100,
      hint: pop >= targetPop
        ? t('objective.population.done')
        : t('objective.population.hint'),
      done: pop >= targetPop,
    },
  ];
}

export const Dashboard = memo(function Dashboard({ state }: Props) {
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const alive = state.agents.filter(a => a.alive);
  const pop = alive.length;
  const stats = state.statistics;
  const latest = stats.length > 0 ? stats[stats.length - 1] : null;
  const prev = stats.length > 1 ? stats[stats.length - 2] : null;

  const gdp = latest?.gdp ?? 0;
  const avgSat = latest?.avgSatisfaction ?? 100;
  const avgHp = latest?.avgHealth ?? 100;
  const gini = latest?.giniCoefficient ?? 0;
  const treasury = state.government.treasury;
  const totalSavings = alive.reduce((sum, agent) => sum + agent.savings, 0);
  const births = latest?.births ?? 0;
  const deaths = latest?.deaths ?? 0;
  const avgAge = latest?.avgAge ?? 0;
  const employmentRate = latest?.employmentRate ?? 0;
  const unemploymentRate = latest?.unemploymentRate ?? 0;
  const laborParticipationRate = latest?.laborParticipationRate ?? 0;
  const crudeBirthRate = latest?.crudeBirthRate ?? 0;
  const fertilityRate = latest?.fertilityRate ?? 0;
  const laborProductivity = latest?.laborProductivity ?? 0;
  const dependencyRatio = latest?.dependencyRatio ?? 0;
  const causal = latest?.causalReplay ?? null;
  const alert = buildSentimentAlert(state, t);
  const objectives = buildObjectives(state, t);
  const ageLayers = alive.reduce(
    (acc, a) => {
      acc[a.ageGroup]++;
      return acc;
    },
    { youth: 0, adult: 0, senior: 0 },
  );

  const trend = (current: number, previous: number | undefined) => {
    if (previous === undefined) return <span className={`${styles.trend} ${styles.neutral}`}>--</span>;
    const diff = current - previous;
    if (Math.abs(diff) < 0.1) return <span className={`${styles.trend} ${styles.neutral}`}>→</span>;
    if (diff > 0) return <span className={`${styles.trend} ${styles.up}`}>▲</span>;
    return <span className={`${styles.trend} ${styles.down}`}>▼</span>;
  };

  return (
    <div className={styles.dashboard}>
      {alert && (
        <div className={`${styles.alert} ${styles[`alert${alert.level}`]}`}>
          <div className={styles.alertTitle}>{alert.title}</div>
          <div className={styles.alertMessage}>{alert.message}</div>
          <div className={styles.alertActions}>{alert.actions.join(' ')}</div>
        </div>
      )}

      {(() => {
        const sectors = getUnlockedSectors(state.economyStage);
        const hasData = sectors.some(s => state.market.supply[s] > 0 || state.market.demand[s] > 0);
        if (!hasData) return null;
        const sdEventMults = getEventDemandMultipliers(state.activeRandomEvents);
        return (
          <div className={styles.sdBalance}>
            <div className={styles.sdTitle}>{t('dashboard.sdBalance')}</div>
            <div className={styles.sdGrid}>
              {sectors.map(sector => {
                const supply = state.market.supply[sector];
                const demand = state.market.demand[sector];
                const eventMult = sdEventMults[sector] ?? 1;
                // Use base demand (excluding event-driven inflation) for status judgment
                const baseDemand = demand / eventMult;
                const baseRatio = baseDemand > 0.01 ? supply / baseDemand : supply > 0 ? 2 : 1;
                // Display the raw ratio so players see what's actually happening in the market
                const displayRatio = demand > 0.01 ? supply / demand : supply > 0 ? 2 : 1;
                const isBalanced = baseRatio >= 0.8 && baseRatio <= 1.2;
                const isWarn = !isBalanced && baseRatio >= 0.5 && baseRatio <= 2.0;
                const label = baseRatio < 0.8
                  ? t('dashboard.sdShortage')
                  : baseRatio > 1.2
                    ? t('dashboard.sdSurplus')
                    : t('dashboard.sdBalanced');
                const colorClass = isBalanced ? styles.sdGreen : isWarn ? styles.sdYellow : styles.sdRed;
                const barPct = Math.max(4, Math.min(100, displayRatio * 50));
                const boostTag = eventMult > 1.01 ? ` ${t('dashboard.sdEventBoost')}` : '';
                return (
                  <div key={sector} className={styles.sdItem}>
                    <div className={styles.sdLabel}>
                      <span>{t(`sector.${sector}`)}</span>
                      <span className={colorClass}>{displayRatio.toFixed(2)} {label}{boostTag}</span>
                    </div>
                    <div className={styles.sdBar}>
                      <span className={colorClass} style={{ width: `${barPct}%` }} />
                      <span className={styles.sdBarMid} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className={styles.objectives}>
        <div className={styles.objectivesTitle}>{t('dashboard.objectives')}</div>
        <div className={styles.objectiveList}>
          {objectives.map(objective => (
            <div
              key={objective.id}
              className={`${styles.objectiveItem} ${objective.done ? styles.objectiveDone : ''}`}
            >
              <div className={styles.objectiveHead}>
                <span className={styles.objectiveHorizon}>{objective.horizon}</span>
                <span className={styles.objectiveName}>{objective.title}</span>
                <span className={styles.objectivePct}>{objective.progress.toFixed(0)}%</span>
              </div>
              <div className={styles.objectiveBar}>
                <span style={{ width: `${Math.max(4, objective.progress)}%` }} />
              </div>
              <div className={styles.objectiveHint}>{objective.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {causal && (
        <div className={styles.causal}>
          <div className={styles.causalTitle}>{t('dashboard.causal')}</div>
          <div className={styles.causalGrid}>
            <div className={styles.causalMetric}>
              <div className={styles.causalHead}>
                <span>{t('dashboard.causal.satisfaction')}</span>
                <span className={causal.satisfaction.net >= 0 ? styles.causalUp : styles.causalDown}>
                  {signed(causal.satisfaction.net)} pt
                </span>
              </div>
              {topDrivers(causal.satisfaction).map(driver => (
                <div key={driver.id} className={styles.causalDriver}>
                  <span>{driver.label}</span>
                  <span className={driver.value >= 0 ? styles.causalUp : styles.causalDown}>
                    {signed(driver.value)}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.causalMetric}>
              <div className={styles.causalHead}>
                <span>{t('dashboard.causal.health')}</span>
                <span className={causal.health.net >= 0 ? styles.causalUp : styles.causalDown}>
                  {signed(causal.health.net)} pt
                </span>
              </div>
              {topDrivers(causal.health).map(driver => (
                <div key={driver.id} className={styles.causalDriver}>
                  <span>{driver.label}</span>
                  <span className={driver.value >= 0 ? styles.causalUp : styles.causalDown}>
                    {signed(driver.value)}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.causalMetric}>
              <div className={styles.causalHead}>
                <span>{t('dashboard.causal.departures')}</span>
                <span className={causal.departures.net > 0 ? styles.causalDown : styles.causalUp}>
                  {causal.departures.net > 0 ? '+' : ''}{causal.departures.net}
                </span>
              </div>
              {topDrivers(causal.departures).map(driver => (
                <div key={driver.id} className={styles.causalDriver}>
                  <span>{driver.label}</span>
                  <span className={driver.value > 0 ? styles.causalDown : styles.causalUp}>
                    {driver.value > 0 ? '+' : ''}{driver.value.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.causalMetric}>
              <div className={styles.causalHead}>
                <span>{t('dashboard.causal.policy')}</span>
                <span className={causal.policy.treasuryDelta >= 0 ? styles.causalUp : styles.causalDown}>
                  {t('dashboard.causal.treasury')} {signed(causal.policy.treasuryDelta)}
                </span>
              </div>
              <div className={styles.causalDriver}>
                <span>{t('dashboard.causal.tax')}</span>
                <span className={styles.causalUp}>+${causal.policy.taxCollected.toFixed(0)}</span>
              </div>
              <div className={styles.causalDriver}>
                <span>{t('dashboard.causal.welfare')} ({causal.policy.welfareRecipients} {t('dashboard.causal.persons')})</span>
                <span className={styles.causalDown}>-${causal.policy.welfarePaid.toFixed(0)}</span>
              </div>
              <div className={styles.causalDriver}>
                <span>{t('dashboard.causal.publicWorks')}</span>
                <span className={styles.causalDown}>-${causal.policy.publicWorksCost.toFixed(0)}</span>
              </div>
              {causal.policy.liquidityInjected > 0 && (
                <div className={styles.causalDriver}>
                  <span>{t('dashboard.causal.liquidity')}</span>
                  <span className={styles.causalDown}>-${causal.policy.liquidityInjected.toFixed(0)}</span>
                </div>
              )}
              {causal.policy.autoStabilizerSpent > 0 && (
                <div className={styles.causalDriver}>
                  <span>{t('dashboard.causal.autoStabilizer')}</span>
                  <span className={styles.causalDown}>-${causal.policy.autoStabilizerSpent.toFixed(0)}</span>
                </div>
              )}
              {causal.policy.stockpileBuySpent > 0 && (
                <div className={styles.causalDriver}>
                  <span>{t('dashboard.causal.stockpileBuy')}</span>
                  <span className={styles.causalDown}>-${causal.policy.stockpileBuySpent.toFixed(0)}</span>
                </div>
              )}
              {causal.policy.stockpileSellRevenue > 0 && (
                <div className={styles.causalDriver}>
                  <span>{t('dashboard.causal.stockpileSell')}</span>
                  <span className={styles.causalUp}>+${causal.policy.stockpileSellRevenue.toFixed(0)}</span>
                </div>
              )}
              {causal.policy.stockpileMaintenance > 0 && (
                <div className={styles.causalDriver}>
                  <span>{t('dashboard.causal.stockpileMaint')}</span>
                  <span className={styles.causalDown}>-${causal.policy.stockpileMaintenance.toFixed(0)}</span>
                </div>
              )}
              <div className={styles.causalDriver}>
                <span>{t('dashboard.causal.perCapitaCash')}</span>
                <span className={causal.policy.perCapitaCashDelta >= 0 ? styles.causalUp : styles.causalDown}>
                  {signed(causal.policy.perCapitaCashDelta)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.causalTimeline}>
            <div className={styles.causalTimelineTitle}>{t('dashboard.causal.timeline')}</div>
            {stats.slice(-6).reverse().map(s => (
              <details key={s.turn} className={styles.causalTimelineItem}>
                <summary className={styles.causalTimelineRow}>
                  <span>T{s.turn}</span>
                  <span>Sat {signed(s.causalReplay.satisfaction.net, 1)}</span>
                  <span>HP {signed(s.causalReplay.health.net, 1)}</span>
                  <span>{t('dashboard.causal.departures.label')} {s.causalReplay.departures.net > 0 ? '+' : ''}{s.causalReplay.departures.net}</span>
                </summary>
                <div className={styles.causalTimelineDetail}>
                  <div>{t('dashboard.causal.satDriver')}: {leadDriverLabel(s.causalReplay.satisfaction, t('dashboard.causal.noChange'))}</div>
                  <div>{t('dashboard.causal.healthDriver')}: {leadDriverLabel(s.causalReplay.health, t('dashboard.causal.noChange'))}</div>
                  <div>
                    {t('dashboard.causal.policyPerformance')}: {t('dashboard.causal.taxRevenue')} +${s.causalReplay.policy.taxCollected.toFixed(0)}
                    {t('common.listSeparator')}{t('dashboard.causal.welfareSpend')} -${s.causalReplay.policy.welfarePaid.toFixed(0)} ({s.causalReplay.policy.welfareRecipients} {t('dashboard.causal.persons')})
                    {t('common.listSeparator')}{t('dashboard.causal.pwSpend')} -${s.causalReplay.policy.publicWorksCost.toFixed(0)}
                    {s.causalReplay.policy.liquidityInjected > 0 && <>{t('common.listSeparator')}{t('dashboard.causal.liquiditySpend')} -${s.causalReplay.policy.liquidityInjected.toFixed(0)}</>}
                    {s.causalReplay.policy.autoStabilizerSpent > 0 && <>{t('common.listSeparator')}{t('dashboard.causal.stabilizerSpend')} -${s.causalReplay.policy.autoStabilizerSpent.toFixed(0)}</>}
                    {s.causalReplay.policy.stockpileBuySpent > 0 && <>{t('common.listSeparator')}{t('dashboard.causal.stockpileBuySpend')} -${s.causalReplay.policy.stockpileBuySpent.toFixed(0)}</>}
                    {s.causalReplay.policy.stockpileSellRevenue > 0 && <>{t('common.listSeparator')}{t('dashboard.causal.stockpileSellRevenue')} +${s.causalReplay.policy.stockpileSellRevenue.toFixed(0)}</>}
                    {s.causalReplay.policy.stockpileMaintenance > 0 && <>{t('common.listSeparator')}{t('dashboard.causal.stockpileMaintSpend')} -${s.causalReplay.policy.stockpileMaintenance.toFixed(0)}</>}
                    {t('common.listSeparator')}{t('dashboard.causal.cashDelta')} {signed(s.causalReplay.policy.perCapitaCashDelta, 2)}
                    {t('common.listSeparator')}{t('dashboard.causal.treasuryDelta')} {signed(s.causalReplay.policy.treasuryDelta, 1)}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.turn.content} detail={DASHBOARD_TOOLTIPS.turn.detail}>
          <span className={styles.label}>{t('dashboard.turn')}</span>
        </Tooltip>
        <div className={styles.value}>{state.turn}</div>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>{t('dashboard.stage')}</span>
        <div className={styles.value}>{t(`stage.${state.economyStage}`)}</div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.population.content} detail={DASHBOARD_TOOLTIPS.population.detail}>
          <span className={styles.label}>{t('dashboard.population')}</span>
        </Tooltip>
        <div className={styles.value}>
          {pop}
          {trend(pop, prev?.population)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.gdp.content} detail={DASHBOARD_TOOLTIPS.gdp.detail} realWorldRef={DASHBOARD_TOOLTIPS.gdp.realWorldRef} realWorldRefEn={DASHBOARD_TOOLTIPS.gdp.realWorldRefEn}>
          <span className={styles.label}>{t('dashboard.gdp')}</span>
        </Tooltip>
        <div className={styles.value}>
          ${gdp.toFixed(0)}
          {trend(gdp, prev?.gdp)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.satisfaction.content} detail={DASHBOARD_TOOLTIPS.satisfaction.detail}>
          <span className={styles.label}>{t('dashboard.satisfaction')}</span>
        </Tooltip>
        <div className={styles.value}>
          {avgSat.toFixed(0)}%
          {trend(avgSat, prev?.avgSatisfaction)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.health.content} detail={DASHBOARD_TOOLTIPS.health.detail}>
          <span className={styles.label}>{t('dashboard.health')}</span>
        </Tooltip>
        <div className={styles.value}>
          {avgHp.toFixed(0)}%
          {trend(avgHp, prev?.avgHealth)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.gini.content} detail={DASHBOARD_TOOLTIPS.gini.detail} realWorldRef={DASHBOARD_TOOLTIPS.gini.realWorldRef} realWorldRefEn={DASHBOARD_TOOLTIPS.gini.realWorldRefEn}>
          <span className={styles.label}>{t('dashboard.gini')}</span>
        </Tooltip>
        <div className={styles.value}>
          {gini.toFixed(3)}
          {trend(-gini, prev ? -prev.giniCoefficient : undefined)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.treasury.content} detail={DASHBOARD_TOOLTIPS.treasury.detail}>
          <span className={styles.label}>{t('dashboard.treasury')}</span>
        </Tooltip>
        <div className={styles.value}>${treasury.toFixed(0)}</div>
      </div>
      <button
        className={styles.advancedToggle}
        onClick={() => setShowAdvanced(v => !v)}
      >
        {showAdvanced ? `▲ ${t('dashboard.advancedHide')}` : `▼ ${t('dashboard.advancedShow')}`}
      </button>

      {showAdvanced && (
        <>
          <div className={styles.stat}>
            <span className={styles.label}>{t('dashboard.bank')}</span>
            <div className={styles.value}>${totalSavings.toFixed(0)}</div>
          </div>
          <div className={styles.stat}>
            <Tooltip content={DASHBOARD_TOOLTIPS.avgAge.content} detail={DASHBOARD_TOOLTIPS.avgAge.detail}>
              <span className={styles.label}>{t('dashboard.avgAge')}</span>
            </Tooltip>
            <div className={styles.value}>{avgAge.toFixed(1)} {t('dashboard.ageSuffix')}</div>
          </div>
          <div className={styles.stat}>
            <Tooltip content={DASHBOARD_TOOLTIPS.birthDeath.content} detail={DASHBOARD_TOOLTIPS.birthDeath.detail}>
              <span className={styles.label}>{t('dashboard.birthDeath')}</span>
            </Tooltip>
            <div className={styles.value}>
              <span style={{ color: '#4caf50' }}>+{births}</span>
              {' / '}
              <span style={{ color: '#f44336' }}>-{deaths}</span>
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.ageLayers')}</div>
            <div className={styles.value}>
              {ageLayers.youth}/{ageLayers.adult}/{ageLayers.senior}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.employment')}</div>
            <div className={styles.value}>
              {employmentRate.toFixed(1)}%
              {trend(employmentRate, prev?.employmentRate)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.unemployment')}</div>
            <div className={styles.value}>
              {unemploymentRate.toFixed(1)}%
              {trend(-unemploymentRate, prev ? -prev.unemploymentRate : undefined)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.laborForce')}</div>
            <div className={styles.value}>
              {laborParticipationRate.toFixed(1)}%
              {trend(laborParticipationRate, prev?.laborParticipationRate)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.fertility')}</div>
            <div className={styles.value}>
              {fertilityRate.toFixed(2)}
              {trend(fertilityRate, prev?.fertilityRate)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.birthRate')}</div>
            <div className={styles.value}>
              {crudeBirthRate.toFixed(1)}
              {trend(crudeBirthRate, prev?.crudeBirthRate)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.laborProductivity')}</div>
            <div className={styles.value}>
              ${laborProductivity.toFixed(1)}
              {trend(laborProductivity, prev?.laborProductivity)}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.label}>{t('dashboard.dependency')}</div>
            <div className={styles.value}>
              {dependencyRatio.toFixed(2)}
              {trend(-dependencyRatio, prev ? -prev.dependencyRatio : undefined)}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
