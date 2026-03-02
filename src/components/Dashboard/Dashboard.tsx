import type { GameState } from '../../types';
import styles from './Dashboard.module.css';

interface Props {
  state: GameState;
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
