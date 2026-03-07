import { memo, useEffect, useRef, useCallback } from 'react';
import type { AutoPlaySpeed } from '../../stores/gameStore';
import { useGameStore } from '../../stores/gameStore';
import { useTurnDiffStore } from '../../stores/turnDiffStore';
import { useStreakStore } from '../../stores/streakStore';
import { useAudioStore } from '../../audio/audioManager';
import { useI18n } from '../../i18n/useI18n';
import type { GameState } from '../../types';
import styles from './StickyControlBar.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * StickyControlBar — always-visible bottom bar with:
 *   1. Expandable Turn Summary (events from current turn)
 *   2. KPI stat pills with turn-over-turn deltas
 *   3. Full control row (Next Turn, auto-play, etc.)
 * ──────────────────────────────────────────────────────────────────────────── */

interface Props {
  gameState: GameState;
  autoPlaySpeed: AutoPlaySpeed;
  isGameOver: boolean;
  hasPendingDecision: boolean;
  onAdvanceTurn: () => void;
  onStartAutoPlay: (speed: 'slow' | 'medium' | 'fast') => void;
  onStopAutoPlay: () => void;
  onReset: () => void;
  onEndGame: () => void;
  /** When the inline ControlBar is visible, we hide this bar */
  inlineControlBarVisible: boolean;
}

/* ─── Delta badge helper ─────────────────────────────────────────────── */
function DeltaBadge({ value, prefix = '', suffix = '', invert = false }: {
  value: number;
  prefix?: string;
  suffix?: string;
  /** If true, positive = bad (red), negative = good (green). Used for Gini. */
  invert?: boolean;
}) {
  if (Math.abs(value) < 0.01) return null;

  const isPositive = value > 0;
  let cls: string;
  if (invert) {
    cls = isPositive ? styles.deltaGiniUp : styles.deltaGiniDown;
  } else {
    cls = isPositive ? styles.deltaUp : styles.deltaDown;
  }

  const formatted = `${isPositive ? '+' : ''}${prefix}${Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value)}${suffix}`;
  return <span className={`${styles.delta} ${cls}`}>{formatted}</span>;
}

/* ─── Save / Load sub-component ──────────────────────────────────────── */
function SaveLoadControls() {
  const { t } = useI18n();
  const hasSavedGame = useGameStore(s => s.hasSavedGame);
  const save = useGameStore(s => s.saveCurrentGame);
  const load = useGameStore(s => s.loadSavedGame);

  return (
    <div className={styles.saveLoadGroup}>
      <button className={styles.saveBtn} onClick={save} title={t('controlBar.save')}>{t('controlBar.save')}</button>
      <button className={styles.loadBtn} onClick={load} disabled={!hasSavedGame} title={t('controlBar.load')}>{t('controlBar.load')}</button>
    </div>
  );
}

/* ─── Audio sub-component ────────────────────────────────────────────── */
function AudioControls() {
  const { t } = useI18n();
  const muted = useAudioStore(s => s.muted);
  const volume = useAudioStore(s => s.volume);
  const toggleMute = useAudioStore(s => s.toggleMute);
  const setVolume = useAudioStore(s => s.setVolume);

  return (
    <div className={styles.audioControls}>
      <button className={styles.muteBtn} onClick={toggleMute} title={muted ? t('controlBar.unmute') : t('controlBar.mute')}>
        {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
      </button>
      <input
        type="range"
        min="0" max="1" step="0.05"
        value={muted ? 0 : volume}
        onChange={e => setVolume(parseFloat(e.target.value))}
        className={styles.volumeSlider}
        title={`${t('controlBar.volumeLabel')} ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */
export const StickyControlBar = memo(function StickyControlBar({
  gameState,
  autoPlaySpeed,
  isGameOver,
  hasPendingDecision,
  onAdvanceTurn,
  onStartAutoPlay,
  onStopAutoPlay,
  onReset,
  onEndGame,
  inlineControlBarVisible,
}: Props) {
  const { t } = useI18n();
  const diff = useTurnDiffStore(s => s.currentDiff);
  const expanded = useTurnDiffStore(s => s.expanded);
  const setExpanded = useTurnDiffStore(s => s.setExpanded);
  const dismiss = useTurnDiffStore(s => s.dismiss);
  const streakType = useStreakStore(s => s.type);
  const streakCount = useStreakStore(s => s.count);

  // Auto-dismiss summary — longer delay for dramatic turns
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (expanded) {
      const delay = diff?.isDramatic ? 8000 : 5000;
      timerRef.current = window.setTimeout(() => dismiss(), delay);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [expanded, diff?.timestamp, diff?.isDramatic, dismiss]);

  const handleSpeedClick = useCallback((speed: 'slow' | 'medium' | 'fast') => {
    if (autoPlaySpeed === speed) {
      onStopAutoPlay();
    } else {
      onStartAutoPlay(speed);
    }
  }, [autoPlaySpeed, onStartAutoPlay, onStopAutoPlay]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Get current stats from latest snapshot
  const latest = gameState.statistics.length > 0
    ? gameState.statistics[gameState.statistics.length - 1]
    : null;

  const turn = gameState.turn;
  const gdp = latest?.gdp ?? 0;
  const pop = latest?.population ?? gameState.agents.filter(a => a.alive).length;
  const sat = latest?.avgSatisfaction ?? 100;
  const treasury = latest?.government.treasury ?? 0;

  const speedLabels: Record<string, string> = {
    slow: t('controlBar.autoSlow'),
    medium: t('controlBar.autoMed'),
    fast: t('controlBar.autoFast'),
  };

  return (
    <div className={`${styles.stickyBar} ${inlineControlBarVisible ? styles.hidden : ''}`}>
    <div className={styles.stickyBarInner}>
      {/* ─── Expandable Turn Summary ───────────────────────────────────── */}
      {expanded && diff && diff.events.length > 0 && (
        <div className={styles.summaryPanel}>
          <div className={styles.summaryRow}>
            {diff.events.map((e, i) => (
              <span key={i} className={`${styles.summaryEvent} ${styles[e.type]}`}>
                {e.type === 'critical' ? '🔴' : e.type === 'warning' ? '🟡' : e.type === 'positive' ? '🟢' : '🔵'}{' '}
                {e.message}
              </span>
            ))}
            {(diff.births > 0 || diff.deaths > 0) && (
              <span className={styles.summaryBirthDeath}>
                {diff.births > 0 && <span className={styles.summaryBirth}>+{diff.births} {t('turnSummary.births')}</span>}
                {diff.births > 0 && diff.deaths > 0 && ' / '}
                {diff.deaths > 0 && <span className={styles.summaryDeath}>-{diff.deaths} {t('turnSummary.deaths')}</span>}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Stat Delta Row ────────────────────────────────────────────── */}
      <div className={styles.statRow}>
        <span className={styles.statPill} onClick={() => scrollTo('dashboard-anchor')} title={t('dashboard.turn')}>
          <span className={styles.statLabel}>T</span>
          <span className={styles.statValue}>{turn}</span>
        </span>

        {streakType && streakCount >= 2 && (
          <span className={`${styles.streakBadge} ${streakType === 'positive' ? styles.streakPositive : styles.streakNegative}`}>
            {streakType === 'positive' ? '🔥' : '❄️'}
            {streakType === 'positive' ? '+' : '-'}{streakCount}
          </span>
        )}

        <span className={`${styles.statPill} ${diff?.dramaticMetrics.includes('gdp') ? styles.dramaticPill : ''}`} onClick={() => scrollTo('dashboard-anchor')} title="GDP">
          <span className={styles.statLabel}>GDP</span>
          <span className={styles.statValue}>${gdp.toFixed(0)}</span>
          {diff && <DeltaBadge value={diff.deltas.gdp} prefix="$" />}
        </span>

        <span className={`${styles.statPill} ${diff?.dramaticMetrics.includes('population') ? styles.dramaticPill : ''}`} onClick={() => scrollTo('dashboard-anchor')} title={t('dashboard.population')}>
          <span className={styles.statLabel}>POP</span>
          <span className={styles.statValue}>{pop}</span>
          {diff && <DeltaBadge value={diff.deltas.population} />}
        </span>

        <span className={`${styles.statPill} ${diff?.dramaticMetrics.includes('avgSatisfaction') ? styles.dramaticPill : ''}`} onClick={() => scrollTo('dashboard-anchor')} title={t('dashboard.satisfaction')}>
          <span className={styles.statLabel}>SAT</span>
          <span className={styles.statValue}>{sat.toFixed(0)}%</span>
          {diff && <DeltaBadge value={diff.deltas.avgSatisfaction} suffix="%" />}
        </span>

        <span className={`${styles.statPill} ${diff?.dramaticMetrics.includes('treasury') ? styles.dramaticPill : ''}`} onClick={() => scrollTo('dashboard-anchor')} title={t('dashboard.treasury')}>
          <span className={styles.statLabel}>$$$</span>
          <span className={styles.statValue}>${treasury.toFixed(0)}</span>
          {diff && <DeltaBadge value={diff.deltas.treasury} prefix="$" />}
        </span>

        {/* Toggle summary button */}
        {diff && (diff.events.length > 0 || diff.isDramatic) && (
          <button
            className={`${styles.toggleSummary} ${diff.isDramatic ? styles.dramaticToggle : ''}`}
            onClick={() => setExpanded(!expanded)}
            title={expanded ? t('turnSummary.collapse') : t('turnSummary.expand')}
          >
            {expanded
              ? `▼ ${t('turnSummary.collapse')}`
              : diff.isDramatic
                ? `⚡ ${diff.events.length} ${t('turnSummary.events')}`
                : `▲ ${diff.events.length} ${t('turnSummary.events')}`}
          </button>
        )}
      </div>

      {/* ─── Control Row ───────────────────────────────────────────────── */}
      <div className={styles.controlRow}>
        {autoPlaySpeed === null ? (
          <button
            className={styles.nextTurnBtn}
            onClick={onAdvanceTurn}
            disabled={isGameOver || hasPendingDecision}
          >
            ▶ {t('controlBar.advance')}
          </button>
        ) : (
          <button className={styles.pauseBtn} onClick={onStopAutoPlay}>
            ⏸ {t('controlBar.pause')}
          </button>
        )}

        <span className={styles.autoLabel}>{t('controlBar.auto')}:</span>
        <div className={styles.autoGroup}>
          {(['slow', 'medium', 'fast'] as const).map(speed => (
            <button
              key={speed}
              className={`${styles.speedBtn} ${autoPlaySpeed === speed ? styles.speedBtnActive : ''}`}
              onClick={() => handleSpeedClick(speed)}
              disabled={isGameOver || hasPendingDecision}
            >
              {speedLabels[speed]}
            </button>
          ))}
        </div>

        {hasPendingDecision && (
          <span className={styles.pendingFlag}>{t('controlBar.pendingDecision')}</span>
        )}

        <div className={styles.secondaryGroup}>
          <button className={styles.endGameBtn} onClick={onEndGame} disabled={isGameOver}>
            {t('controlBar.endGame')}
          </button>
          <button className={styles.resetBtn} onClick={onReset}>{t('controlBar.reset')}</button>
          <SaveLoadControls />
          <AudioControls />
        </div>
      </div>
    </div>
    </div>
  );
});
