import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import type { GameState } from '../../types';
import {
  createAIOpponent, advanceAIOpponent, getAILatest,
  type AIOpponent, type AIStrategy,
} from '../../engine/modules/aiOpponentModule';
import { loadLeaderboard, saveToLeaderboard, type LeaderboardEntry } from '../../data/leaderboard';
import { computeScore } from '../../engine/Scoring';
import styles from './CompetitionPanel.module.css';

interface Props {
  state: GameState;
}

const METRICS = [
  { key: 'population', label: '人口 Pop', color: '#64ffda' },
  { key: 'gdp', label: 'GDP', color: '#ffd700' },
  { key: 'satisfaction', label: '滿意度 Sat', color: '#ff6b9d' },
  { key: 'gini', label: 'Gini', color: '#ff9800' },
] as const;

type MetricKey = typeof METRICS[number]['key'];

export const CompetitionPanel = memo(function CompetitionPanel({ state }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [aiStrategy, setAiStrategy] = useState<AIStrategy>('balanced');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('population');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());
  const aiRef = useRef<AIOpponent | null>(null);
  const lastTurnRef = useRef(-1);

  // Reset AI when strategy changes or game resets
  useEffect(() => {
    aiRef.current = createAIOpponent(aiStrategy);
    lastTurnRef.current = 0;
  }, [aiStrategy, state.seed]);

  // Advance AI to match player's turn
  useEffect(() => {
    if (!aiRef.current) return;
    while (aiRef.current.history.length - 1 < state.turn) {
      advanceAIOpponent(aiRef.current);
    }
    lastTurnRef.current = state.turn;
  }, [state.turn]);

  const ai = aiRef.current;
  const aiLatest = ai ? getAILatest(ai) : null;

  // Player score
  const playerScore = useMemo(() => {
    if (state.statistics.length === 0) return 0;
    return computeScore(state.statistics).totalScore;
  }, [state.statistics]);

  // Chart data
  const chartData = useMemo(() => {
    if (!ai) return [];
    return state.statistics.map((snap, i) => {
      const aiSnap = ai.history[i + 1]; // +1 because AI history includes turn 0
      return {
        turn: snap.turn,
        player_population: snap.population,
        ai_population: aiSnap?.population ?? 0,
        player_gdp: snap.gdp,
        ai_gdp: aiSnap?.gdp ?? 0,
        player_satisfaction: snap.avgSatisfaction,
        ai_satisfaction: aiSnap?.satisfaction ?? 0,
        player_gini: snap.giniCoefficient,
        ai_gini: aiSnap?.gini ?? 0,
      };
    });
  }, [state.statistics, ai]);

  const handleSaveScore = useCallback(() => {
    if (state.statistics.length === 0) return;
    const latest = state.statistics[state.statistics.length - 1];
    const entry = saveToLeaderboard({
      scenarioId: state.scenarioId,
      seed: state.seed,
      turns: state.turn,
      score: playerScore,
      finalPopulation: latest.population,
      finalGdp: latest.gdp,
      finalGini: latest.giniCoefficient,
      playerName: 'Player',
    });
    setLeaderboard(loadLeaderboard());
    return entry;
  }, [state, playerScore]);

  const latestStats = state.statistics.length > 0
    ? state.statistics[state.statistics.length - 1]
    : null;

  return (
    <div className={styles.panel}>
      <button className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <span className={styles.headerTitle}>競爭排行 Competition</span>
        <span className={`${styles.chevron} ${collapsed ? '' : styles.chevronOpen}`}>&#x25BE;</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          {/* AI Opponent section */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>AI 對手 Opponent</div>
            <div className={styles.strategyRow}>
              {(['balanced', 'growth', 'welfare'] as AIStrategy[]).map(s => (
                <button
                  key={s}
                  className={`${styles.strategyBtn} ${aiStrategy === s ? styles.strategyBtnActive : ''}`}
                  onClick={() => setAiStrategy(s)}
                >
                  {s === 'balanced' ? '平衡' : s === 'growth' ? '成長' : '福利'}
                </button>
              ))}
            </div>

            {/* Score comparison */}
            {latestStats && aiLatest && (
              <div className={styles.comparison}>
                <div className={styles.scoreCard}>
                  <div className={styles.scoreLabel}>You</div>
                  <div className={styles.scoreValue}>{playerScore}</div>
                  <div className={styles.scoreSub}>
                    Pop {latestStats.population} | Gini {latestStats.giniCoefficient.toFixed(2)}
                  </div>
                </div>
                <div className={styles.vs}>vs</div>
                <div className={styles.scoreCard}>
                  <div className={styles.scoreLabel}>{ai?.name ?? 'AI'}</div>
                  <div className={styles.scoreValue}>
                    {Math.round(aiLatest.satisfaction * aiLatest.population * 0.15)}
                  </div>
                  <div className={styles.scoreSub}>
                    Pop {aiLatest.population} | Gini {aiLatest.gini.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <div className={styles.section}>
              <div className={styles.metricTabs}>
                {METRICS.map(m => (
                  <button
                    key={m.key}
                    className={`${styles.metricTab} ${selectedMetric === m.key ? styles.metricTabActive : ''}`}
                    onClick={() => setSelectedMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="turn" tick={{ fill: '#8892b0', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#8892b0', fontSize: 11 }} width={45} />
                    <Tooltip
                      contentStyle={{ background: '#1a2744', border: '1px solid #233554', borderRadius: 6 }}
                      labelStyle={{ color: '#ccd6f6' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={`player_${selectedMetric}`}
                      stroke={METRICS.find(m => m.key === selectedMetric)?.color ?? '#64ffda'}
                      name="You"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey={`ai_${selectedMetric}`}
                      stroke="#8892b0"
                      name="AI"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              排行榜 Leaderboard
              {state.turn > 0 && (
                <button className={styles.saveBtn} onClick={handleSaveScore}>
                  記錄分數
                </button>
              )}
            </div>
            {leaderboard.length === 0 ? (
              <div className={styles.emptyBoard}>尚無記錄 No entries yet</div>
            ) : (
              <div className={styles.board}>
                {leaderboard.slice(0, 8).map((entry, i) => (
                  <div key={entry.id} className={styles.boardRow}>
                    <span className={styles.rank}>#{i + 1}</span>
                    <span className={styles.boardScore}>{entry.score}</span>
                    <span className={styles.boardMeta}>
                      T{entry.turns} | Pop {entry.finalPopulation}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
