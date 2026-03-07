import type { GameOverState, SectorType } from '../../types';
import { getGrade } from '../../engine/Scoring';
import { useI18n } from '../../i18n/useI18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './GameOver.module.css';

interface Props {
  gameOver: GameOverState;
  onRestart: () => void;
}

const REASON_KEY: Record<string, string> = {
  all_dead: 'gameOver.reason.allDead',
  gdp_victory: 'gameOver.reason.gdpVictory',
  treasury_victory: 'gameOver.reason.treasuryVictory',
  max_turns: 'gameOver.reason.maxTurns',
  player_exit: 'gameOver.reason.playerExit',
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
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { reason, turn, score, finalStats } = gameOver;
  const grade = getGrade(score.totalScore);
  const isVictory = reason === 'gdp_victory' || reason === 'treasury_victory';
  const sectors: SectorType[] = ['food', 'goods', 'services'];

  const reasonKey = REASON_KEY[reason];
  const reasonLabel = reasonKey ? t(reasonKey) : reason;

  return (
    <div className={styles.overlay}>
      <div ref={trapRef} className={styles.modal} role="dialog" aria-modal="true">
        <h2 className={`${styles.title} ${isVictory ? styles.victory : ''}`}>
          {reasonLabel}
        </h2>

        <div className={`${styles.grade} ${styles[`grade${grade}`]}`}>{grade}</div>
        <div className={styles.totalScore}>{t('gameOver.totalScore')}: {score.totalScore} / 1000</div>

        <div className={styles.breakdown}>
          <ScoreRow label={t('gameOver.score.population')} value={score.populationScore} max={200} />
          <ScoreRow label={t('gameOver.score.prosperity')} value={score.prosperityScore} max={250} />
          <ScoreRow label={t('gameOver.score.equality')} value={score.equalityScore} max={150} />
          <ScoreRow label={t('gameOver.score.wellbeing')} value={score.wellbeingScore} max={200} />
          <ScoreRow label={t('gameOver.score.stability')} value={score.stabilityScore} max={100} />
          <ScoreRow label={t('gameOver.score.longevity')} value={score.longevityScore} max={100} />
        </div>

        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.turns')}</span>
            <span className={styles.statValue}>{turn}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.peakPop')}</span>
            <span className={styles.statValue}>{finalStats.peakPopulation}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.births')}</span>
            <span className={styles.statValueGreen}>{finalStats.totalBirths}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.deaths')}</span>
            <span className={styles.statValueRed}>{finalStats.totalDeaths}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.peakGdp')}</span>
            <span className={styles.statValue}>${finalStats.peakGdp.toFixed(0)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('gameOver.stat.avgSat')}</span>
            <span className={styles.statValue}>{finalStats.avgSatisfaction.toFixed(1)}%</span>
          </div>
        </div>

        <div className={styles.sectorSection}>
          <div className={styles.sectionTitle}>{t('gameOver.industry')}</div>
          {sectors.map((sector) => {
            const info = finalStats.sectorDevelopment[sector];
            return (
              <div key={sector} className={styles.sectorRow}>
                <div className={styles.sectorHead}>
                  <span className={styles.sectorName}>{t(`sector.${sector}`)}</span>
                  <span className={styles.sectorShare}>{info.share.toFixed(1)}%</span>
                  <span className={styles.sectorLevel}>{info.level}</span>
                </div>
                <div className={styles.sectorBarBg}>
                  <div className={styles.sectorBarFill} style={{ width: `${Math.max(2, info.share)}%` }} />
                </div>
                <div className={styles.sectorComment}>{info.comment}</div>
              </div>
            );
          })}
        </div>

        <div className={styles.counterfactualSection}>
          <div className={styles.sectionTitle}>{t('gameOver.counterfactual')}</div>
          {finalStats.counterfactualNotes.map((note, idx) => (
            <div key={idx} className={styles.counterfactualNote}>{note}</div>
          ))}
        </div>

        {finalStats.reflectiveQuestions?.length > 0 && (
          <section className={styles.reflectiveSection}>
            <h3 className={styles.sectionTitle}>{t('gameOver.reflections')}</h3>
            {finalStats.reflectiveQuestions.map((q, i) => (
              <div key={i} className={styles.reflectiveCard}>
                <p className={styles.reflectiveQuestion}>{q.question}</p>
                <p className={styles.reflectiveContext}>{q.context}</p>
                {q.realWorldComparison && <p className={styles.reflectiveRef}>📊 {q.realWorldComparison}</p>}
              </div>
            ))}
          </section>
        )}

        {finalStats.agentBiographies?.length > 0 && (
          <section className={styles.biographySection}>
            <h3 className={styles.sectionTitle}>{t('gameOver.agentStories')}</h3>
            {finalStats.agentBiographies.map((bio, i) => (
              <div key={i} className={styles.biographyCard}>
                <div className={styles.biographyHeader}>
                  <span className={styles.biographyTitle}>{bio.title}</span>
                  <span className={styles.biographyName}>{bio.name}</span>
                </div>
                <p className={styles.biographyNarrative}>{bio.narrative}</p>
              </div>
            ))}
          </section>
        )}

        {finalStats.bestOfRankings?.length > 0 && (
          <section className={styles.bestOfSection}>
            <h3 className={styles.sectionTitle}>{t('gameOver.islandBest')}</h3>
            <div className={styles.bestOfGrid}>
              {finalStats.bestOfRankings.map((r, i) => (
                <div key={i} className={styles.bestOfCard}>
                  <div className={styles.bestOfLabel}>{r.label}</div>
                  <div className={styles.bestOfName}>{r.agentName}</div>
                  <div className={styles.bestOfValue}>{r.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <button className={styles.restartBtn} onClick={onRestart}>
          {t('gameOver.restart')}
        </button>
      </div>
    </div>
  );
}
