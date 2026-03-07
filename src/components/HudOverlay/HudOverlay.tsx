import { memo } from 'react';
import type { GameState } from '../../types';
import { useTurnDiffStore } from '../../stores/turnDiffStore';
import { useStreakStore } from '../../stores/streakStore';
import { useI18n } from '../../i18n/useI18n';
import styles from './HudOverlay.module.css';

interface Props {
  state: GameState;
}

function DeltaBadge({ value, prefix = '', suffix = '', invert = false }: {
  value: number;
  prefix?: string;
  suffix?: string;
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

export const HudOverlay = memo(function HudOverlay({ state }: Props) {
  const { t } = useI18n();
  const diff = useTurnDiffStore(s => s.currentDiff);
  const expanded = useTurnDiffStore(s => s.expanded);
  const setExpanded = useTurnDiffStore(s => s.setExpanded);
  const streakType = useStreakStore(s => s.type);
  const streakCount = useStreakStore(s => s.count);

  const latest = state.statistics.length > 0
    ? state.statistics[state.statistics.length - 1]
    : null;

  const turn = state.turn;
  const pop = latest?.population ?? state.agents.filter(a => a.alive).length;
  const gdp = latest?.gdp ?? 0;
  const sat = latest?.avgSatisfaction ?? 100;
  const treasury = latest?.government.treasury ?? state.government.treasury;

  return (
    <div className={styles.hud}>
      <span className={styles.pill}>
        <span className={styles.pillLabel}>T</span>
        <span className={styles.pillValue}>{turn}</span>
      </span>

      {streakType && streakCount >= 2 && (
        <span className={`${styles.streakBadge} ${streakType === 'positive' ? styles.streakPositive : styles.streakNegative}`}>
          {streakType === 'positive' ? '\u{1F525}' : '\u{2744}\u{FE0F}'}
          {streakType === 'positive' ? '+' : '-'}{streakCount}
        </span>
      )}

      <span className={`${styles.pill} ${diff?.dramaticMetrics.includes('population') ? styles.dramaticPill : ''}`}>
        <span className={styles.pillLabel}>{t('dashboard.population')}</span>
        <span className={styles.pillValue}>{pop}</span>
        {diff && <DeltaBadge value={diff.deltas.population} />}
      </span>

      <span className={`${styles.pill} ${diff?.dramaticMetrics.includes('gdp') ? styles.dramaticPill : ''}`}>
        <span className={styles.pillLabel}>GDP</span>
        <span className={styles.pillValue}>${gdp.toFixed(0)}</span>
        {diff && <DeltaBadge value={diff.deltas.gdp} prefix="$" />}
      </span>

      <span className={`${styles.pill} ${diff?.dramaticMetrics.includes('avgSatisfaction') ? styles.dramaticPill : ''}`}>
        <span className={styles.pillLabel}>{t('dashboard.satisfaction')}</span>
        <span className={styles.pillValue}>{sat.toFixed(0)}%</span>
        {diff && <DeltaBadge value={diff.deltas.avgSatisfaction} suffix="%" />}
      </span>

      <span className={`${styles.pill} ${diff?.dramaticMetrics.includes('treasury') ? styles.dramaticPill : ''}`}>
        <span className={styles.pillLabel}>{t('dashboard.treasury')}</span>
        <span className={styles.pillValue}>${treasury.toFixed(0)}</span>
        {diff && <DeltaBadge value={diff.deltas.treasury} prefix="$" />}
      </span>

      {diff && (diff.events.length > 0 || diff.isDramatic) && (
        <button
          className={styles.toggleSummary}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? `\u25BC ${t('turnSummary.collapse')}`
            : diff.isDramatic
              ? `\u26A1 ${diff.events.length} ${t('turnSummary.events')}`
              : `\u25B2 ${diff.events.length} ${t('turnSummary.events')}`}
        </button>
      )}

      {expanded && diff && diff.events.length > 0 && (
        <div className={styles.summaryRow}>
          {diff.events.map((e, i) => (
            <span key={i} className={styles.summaryEvent}>
              {e.type === 'critical' ? '\u{1F534}' : e.type === 'warning' ? '\u{1F7E1}' : e.type === 'positive' ? '\u{1F7E2}' : '\u{1F535}'}{' '}
              {e.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
