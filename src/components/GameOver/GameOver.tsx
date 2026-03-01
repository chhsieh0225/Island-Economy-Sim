import type { GameOverState } from '../../types';
import { getGrade } from '../../engine/Scoring';
import styles from './GameOver.module.css';

interface Props {
  gameOver: GameOverState;
  onRestart: () => void;
}

const REASON_LABELS: Record<string, string> = {
  all_dead: '島嶼荒廢 Island Abandoned',
  gdp_victory: '經濟勝利 Economic Victory!',
  treasury_victory: '財政勝利 Treasury Victory!',
  max_turns: '時光流逝 Time\'s Up',
  player_exit: '市長離任 Mayor Resigned',
};

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={styles.scoreRow}>
      <span className={styles.scoreLabel}>{label}</span>
      <div className={styles.scoreBarBg}>
        <div className={styles.scoreBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.scoreValue}>{value}/{max}</span>
    </div>
  );
}

export function GameOver({ gameOver, onRestart }: Props) {
  const { reason, turn, score, finalStats } = gameOver;
  const grade = getGrade(score.totalScore);
  const isVictory = reason === 'gdp_victory' || reason === 'treasury_victory';

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={`${styles.title} ${isVictory ? styles.victory : ''}`}>
          {REASON_LABELS[reason] ?? reason}
        </h2>

        <div className={`${styles.grade} ${styles[`grade${grade}`]}`}>{grade}</div>
        <div className={styles.totalScore}>總分 Total: {score.totalScore} / 1000</div>

        <div className={styles.breakdown}>
          <ScoreRow label="人口 Population" value={score.populationScore} max={200} />
          <ScoreRow label="繁榮 Prosperity" value={score.prosperityScore} max={250} />
          <ScoreRow label="平等 Equality" value={score.equalityScore} max={150} />
          <ScoreRow label="福祉 Wellbeing" value={score.wellbeingScore} max={200} />
          <ScoreRow label="穩定 Stability" value={score.stabilityScore} max={100} />
          <ScoreRow label="存續 Longevity" value={score.longevityScore} max={100} />
        </div>

        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>經過回合 Turns</span>
            <span className={styles.statValue}>{turn}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>最高人口 Peak Pop</span>
            <span className={styles.statValue}>{finalStats.peakPopulation}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>出生 Births</span>
            <span className={styles.statValueGreen}>{finalStats.totalBirths}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>死亡 Deaths</span>
            <span className={styles.statValueRed}>{finalStats.totalDeaths}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>最高 GDP</span>
            <span className={styles.statValue}>${finalStats.peakGdp.toFixed(0)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>平均滿意 Avg Sat</span>
            <span className={styles.statValue}>{finalStats.avgSatisfaction.toFixed(1)}%</span>
          </div>
        </div>

        <button className={styles.restartBtn} onClick={onRestart}>
          重新開始 Restart
        </button>
      </div>
    </div>
  );
}
