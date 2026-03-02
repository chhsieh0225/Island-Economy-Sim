import type { GameState, SectorType } from '../../types';
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

const SECTORS: SectorType[] = ['food', 'goods', 'services'];
const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物',
  goods: '商品',
  services: '服務',
};

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

      <div className={styles.stat}>
        <div className={styles.label}>回合 Turn</div>
        <div className={styles.value}>{state.turn}</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>人口 Pop</div>
        <div className={styles.value}>
          {pop}
          {trend(pop, prev?.population)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>GDP</div>
        <div className={styles.value}>
          ${gdp.toFixed(0)}
          {trend(gdp, prev?.gdp)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>滿意度 Sat</div>
        <div className={styles.value}>
          {avgSat.toFixed(0)}%
          {trend(avgSat, prev?.avgSatisfaction)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>健康 HP</div>
        <div className={styles.value}>
          {avgHp.toFixed(0)}%
          {trend(avgHp, prev?.avgHealth)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>基尼係數 Gini</div>
        <div className={styles.value}>
          {gini.toFixed(3)}
          {trend(-gini, prev ? -prev.giniCoefficient : undefined)}
        </div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>國庫 Treasury</div>
        <div className={styles.value}>${treasury.toFixed(0)}</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>平均年齡 Avg Age</div>
        <div className={styles.value}>{avgAge.toFixed(1)} 歲</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>出生/死亡</div>
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
