import type { GameState, SectorType, TurnCausalReplay } from '../../types';
import { CONFIG } from '../../config';
import { Tooltip } from '../Tooltip/Tooltip';
import { DASHBOARD_TOOLTIPS } from '../../data/tooltipContent';
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
  horizon: '短期' | '中期';
  title: string;
  progress: number; // 0-100
  hint: string;
  done: boolean;
}

const SECTORS: SectorType[] = ['food', 'goods', 'services'];
const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物',
  goods: '商品',
  services: '服務',
};
const STAGE_LABELS = {
  agriculture: '農業',
  industrial: '工業',
  service: '服務',
} as const;

function buildSentimentAlert(state: GameState): SentimentAlert | null {
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

  const shortages = SECTORS.filter(sector => {
    const demand = state.market.demand[sector];
    const supply = state.market.supply[sector];
    if (demand <= 0.01) return false;
    return supply < demand * 0.82;
  });

  const actions: string[] = [];
  if (shortages.includes('food')) actions.push('優先補貼食物業並保留低稅率，先穩定基本需求。');
  if (shortages.includes('goods')) actions.push('提高商品補貼，讓中間財供應回升。');
  if (shortages.includes('services')) actions.push('提高服務補貼，避免滿意度持續下滑。');
  if (gini > 0.45) actions.push('啟用或維持福利，緩和底層購買力不足。');
  if (state.government.taxRate > 0.2) actions.push('稅率偏高，可先下調 2%-5% 觀察。');
  if (actions.length === 0) actions.push('保持供需平衡並避免政策一次變動過大。');

  const shortageLabel = shortages.map(s => SECTOR_LABELS[s]).join('、');
  if (avgSat < 34 || nearLeaveRate > 0.12 || (satDelta < -4 && avgSat < 45)) {
    return {
      level: 'critical',
      title: '民心警報：紅色 Red',
      message: shortageLabel
        ? `民心急速惡化，${shortageLabel}供給不足且離島風險上升。`
        : '民心急速惡化，居民離島風險上升。',
      actions: actions.slice(0, 2),
    };
  }

  if (avgSat < 48 || lowSatRate > 0.2 || shortages.length >= 2 || gini > 0.5) {
    return {
      level: 'warning',
      title: '民心警報：橙色 Orange',
      message: shortageLabel
        ? `民生壓力偏高，${shortageLabel}供應偏緊。`
        : '民生壓力偏高，滿意度處於下行區間。',
      actions: actions.slice(0, 2),
    };
  }

  if (avgSat < 60 || satDelta < -2 || shortages.length === 1 || gini > 0.42) {
    return {
      level: 'watch',
      title: '民心警報：黃色 Yellow',
      message: shortageLabel
        ? `民心有轉弱跡象，${shortageLabel}已出現短缺壓力。`
        : '民心有轉弱跡象，建議提前微調政策。',
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

function leadDriverLabel(metric: TurnCausalReplay['satisfaction']): string {
  const first = topDrivers(metric)[0];
  return first ? first.label : '無顯著變化';
}

function buildObjectives(state: GameState): GovernorObjective[] {
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
      horizon: '短期',
      title: '穩定食物供應',
      progress: foodCoverage * 100,
      hint: foodCoverage >= 1
        ? '食物供需已平衡，可維持補貼並觀察 2-3 回合。'
        : '先拉高食物補貼或降稅，優先把基本需求補齊。',
      done: foodCoverage >= 1,
    },
    {
      id: 'sentiment_recovery',
      horizon: '短期',
      title: '回升平均滿意度至 62%',
      progress: satProgress * 100,
      hint: avgSat >= 62
        ? '民心進入穩定區，避免一次調太多政策。'
        : '抑制短缺並維持福利，可更快拉回滿意度。',
      done: avgSat >= 62,
    },
    {
      id: 'equity_guardrail',
      horizon: '中期',
      title: '控制不平等 (Gini <= 0.42)',
      progress: giniProgress * 100,
      hint: gini <= 0.42
        ? '財富分配在可控區間，繼續觀察成長與公平平衡。'
        : '可維持福利並避免同時大幅拉高多產業補貼。',
      done: gini <= 0.42,
    },
    {
      id: 'population_retention',
      horizon: '中期',
      title: `人口維持 ${targetPop}+`,
      progress: popProgress * 100,
      hint: pop >= targetPop
        ? '人口留存達標，可轉向提升長期產業結構。'
        : '降低離島率比拚命拉生育更有效，先救民心。',
      done: pop >= targetPop,
    },
  ];
}

export function Dashboard({ state }: Props) {
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
  const alert = buildSentimentAlert(state);
  const objectives = buildObjectives(state);
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

      <div className={styles.objectives}>
        <div className={styles.objectivesTitle}>短中期任務 Objectives</div>
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
          <div className={styles.causalTitle}>因果回放 Causal Replay</div>
          <div className={styles.causalGrid}>
            <div className={styles.causalMetric}>
              <div className={styles.causalHead}>
                <span>滿意度 Δ</span>
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
                <span>健康 Δ</span>
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
                <span>人口淨流出</span>
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
                <span>政策執行（實績）</span>
                <span className={causal.policy.treasuryDelta >= 0 ? styles.causalUp : styles.causalDown}>
                  國庫 {signed(causal.policy.treasuryDelta)}
                </span>
              </div>
              <div className={styles.causalDriver}>
                <span>稅收</span>
                <span className={styles.causalUp}>+${causal.policy.taxCollected.toFixed(0)}</span>
              </div>
              <div className={styles.causalDriver}>
                <span>福利（{causal.policy.welfareRecipients} 人）</span>
                <span className={styles.causalDown}>-${causal.policy.welfarePaid.toFixed(0)}</span>
              </div>
              <div className={styles.causalDriver}>
                <span>公共建設</span>
                <span className={styles.causalDown}>-${causal.policy.publicWorksCost.toFixed(0)}</span>
              </div>
              <div className={styles.causalDriver}>
                <span>人均可支配現金 Δ</span>
                <span className={causal.policy.perCapitaCashDelta >= 0 ? styles.causalUp : styles.causalDown}>
                  {signed(causal.policy.perCapitaCashDelta)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.causalTimeline}>
            <div className={styles.causalTimelineTitle}>最近 6 回合（點擊展開）</div>
            {stats.slice(-6).reverse().map(s => (
              <details key={s.turn} className={styles.causalTimelineItem}>
                <summary className={styles.causalTimelineRow}>
                  <span>T{s.turn}</span>
                  <span>Sat {signed(s.causalReplay.satisfaction.net, 1)}</span>
                  <span>HP {signed(s.causalReplay.health.net, 1)}</span>
                  <span>流出 {s.causalReplay.departures.net > 0 ? '+' : ''}{s.causalReplay.departures.net}</span>
                </summary>
                <div className={styles.causalTimelineDetail}>
                  <div>滿意度主因：{leadDriverLabel(s.causalReplay.satisfaction)}</div>
                  <div>健康主因：{leadDriverLabel(s.causalReplay.health)}</div>
                  <div>
                    政策實績：稅收 +${s.causalReplay.policy.taxCollected.toFixed(0)}
                    ，福利 -${s.causalReplay.policy.welfarePaid.toFixed(0)}（{s.causalReplay.policy.welfareRecipients} 人）
                    ，公建 -${s.causalReplay.policy.publicWorksCost.toFixed(0)}
                    ，人均現金Δ {signed(s.causalReplay.policy.perCapitaCashDelta, 2)}
                    ，國庫Δ {signed(s.causalReplay.policy.treasuryDelta, 1)}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.turn.content} detail={DASHBOARD_TOOLTIPS.turn.detail}>
          <span className={styles.label}>回合 Turn</span>
        </Tooltip>
        <div className={styles.value}>{state.turn}</div>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>產業階段 Stage</span>
        <div className={styles.value}>{STAGE_LABELS[state.economyStage]}</div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.population.content} detail={DASHBOARD_TOOLTIPS.population.detail}>
          <span className={styles.label}>人口 Pop</span>
        </Tooltip>
        <div className={styles.value}>
          {pop}
          {trend(pop, prev?.population)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.gdp.content} detail={DASHBOARD_TOOLTIPS.gdp.detail} realWorldRef={DASHBOARD_TOOLTIPS.gdp.realWorldRef}>
          <span className={styles.label}>GDP</span>
        </Tooltip>
        <div className={styles.value}>
          ${gdp.toFixed(0)}
          {trend(gdp, prev?.gdp)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.satisfaction.content} detail={DASHBOARD_TOOLTIPS.satisfaction.detail}>
          <span className={styles.label}>滿意度 Sat</span>
        </Tooltip>
        <div className={styles.value}>
          {avgSat.toFixed(0)}%
          {trend(avgSat, prev?.avgSatisfaction)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.health.content} detail={DASHBOARD_TOOLTIPS.health.detail}>
          <span className={styles.label}>健康 HP</span>
        </Tooltip>
        <div className={styles.value}>
          {avgHp.toFixed(0)}%
          {trend(avgHp, prev?.avgHealth)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.gini.content} detail={DASHBOARD_TOOLTIPS.gini.detail} realWorldRef={DASHBOARD_TOOLTIPS.gini.realWorldRef}>
          <span className={styles.label}>基尼係數 Gini</span>
        </Tooltip>
        <div className={styles.value}>
          {gini.toFixed(3)}
          {trend(-gini, prev ? -prev.giniCoefficient : undefined)}
        </div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.treasury.content} detail={DASHBOARD_TOOLTIPS.treasury.detail}>
          <span className={styles.label}>國庫 Treasury</span>
        </Tooltip>
        <div className={styles.value}>${treasury.toFixed(0)}</div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.avgAge.content} detail={DASHBOARD_TOOLTIPS.avgAge.detail}>
          <span className={styles.label}>平均年齡 Avg Age</span>
        </Tooltip>
        <div className={styles.value}>{avgAge.toFixed(1)} 歲</div>
      </div>
      <div className={styles.stat}>
        <Tooltip content={DASHBOARD_TOOLTIPS.birthDeath.content} detail={DASHBOARD_TOOLTIPS.birthDeath.detail}>
          <span className={styles.label}>出生/死亡</span>
        </Tooltip>
        <div className={styles.value}>
          <span style={{ color: '#4caf50' }}>+{births}</span>
          {' / '}
          <span style={{ color: '#f44336' }}>-{deaths}</span>
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>年齡層 Y/A/S</div>
        <div className={styles.value}>
          {ageLayers.youth}/{ageLayers.adult}/{ageLayers.senior}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>就業率 Employment</div>
        <div className={styles.value}>
          {employmentRate.toFixed(1)}%
          {trend(employmentRate, prev?.employmentRate)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>失業率 Unemployment</div>
        <div className={styles.value}>
          {unemploymentRate.toFixed(1)}%
          {trend(-unemploymentRate, prev ? -prev.unemploymentRate : undefined)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>勞參率 Labor Force</div>
        <div className={styles.value}>
          {laborParticipationRate.toFixed(1)}%
          {trend(laborParticipationRate, prev?.laborParticipationRate)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>生育率 Fertility</div>
        <div className={styles.value}>
          {fertilityRate.toFixed(2)}
          {trend(fertilityRate, prev?.fertilityRate)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>出生率 Birth/1k</div>
        <div className={styles.value}>
          {crudeBirthRate.toFixed(1)}
          {trend(crudeBirthRate, prev?.crudeBirthRate)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>勞動生產率 GDP/worker</div>
        <div className={styles.value}>
          ${laborProductivity.toFixed(1)}
          {trend(laborProductivity, prev?.laborProductivity)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>扶養比 Dependency</div>
        <div className={styles.value}>
          {dependencyRatio.toFixed(2)}
          {trend(-dependencyRatio, prev ? -prev.dependencyRatio : undefined)}
        </div>
      </div>
    </div>
  );
}
