import type { GameState, SectorType } from '../../types';
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
    </div>
  );
}
