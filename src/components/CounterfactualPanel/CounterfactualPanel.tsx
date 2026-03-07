import { memo } from 'react';
import { useCounterfactualStore } from '../../stores/counterfactualStore';
import type { TurnSnapshot } from '../../types';
import styles from './CounterfactualPanel.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * CounterfactualPanel — "What If?" comparison view
 *
 * Shows side-by-side mini bar charts (actual vs baseline) for key metrics,
 * plus a summary table of net divergence at the final simulated turn.
 * ──────────────────────────────────────────────────────────────────────────── */

interface MetricDef {
  label: string;
  key: string;
  extract: (snap: TurnSnapshot) => number;
  format: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { label: 'GDP', key: 'gdp', extract: s => s.gdp, format: v => `$${v.toFixed(0)}` },
  { label: '滿意度 Satisfaction', key: 'sat', extract: s => s.avgSatisfaction, format: v => `${v.toFixed(1)}%` },
  { label: '人口 Population', key: 'pop', extract: s => s.population, format: v => `${v}` },
  { label: '基尼 Gini', key: 'gini', extract: s => s.giniCoefficient, format: v => v.toFixed(3) },
];

function MiniBarChart({ actual, baseline, extract }: {
  actual: TurnSnapshot[];
  baseline: TurnSnapshot[];
  extract: (s: TurnSnapshot) => number;
}) {
  const allValues = [...actual.map(extract), ...baseline.map(extract)];
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className={styles.miniChart}>
      {actual.map((snap, i) => {
        const aVal = extract(snap);
        const bVal = baseline[i] ? extract(baseline[i]) : 0;
        const aPct = Math.max(3, (aVal / maxVal) * 100);
        const bPct = Math.max(3, (bVal / maxVal) * 100);
        return (
          <div key={snap.turn} className={styles.barGroup}>
            <div className={styles.barActual} style={{ height: `${aPct}%` }} title={`T${snap.turn} Actual: ${aVal.toFixed(1)}`} />
            <div className={styles.barBaseline} style={{ height: `${bPct}%` }} title={`T${snap.turn} Baseline: ${bVal.toFixed(1)}`} />
          </div>
        );
      })}
    </div>
  );
}

export const CounterfactualPanel = memo(function CounterfactualPanel() {
  const result = useCounterfactualStore(s => s.result);
  const loading = useCounterfactualStore(s => s.loading);
  const policySummary = useCounterfactualStore(s => s.policySummary);
  const dismiss = useCounterfactualStore(s => s.dismiss);

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>計算中...</div>
      </div>
    );
  }

  if (!result || result.actual.length === 0) return null;

  const lastDiv = result.divergence[result.divergence.length - 1];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>假如不做？What If?</div>
          {policySummary && <div className={styles.subtitle}>{policySummary}</div>}
        </div>
        <button className={styles.closeBtn} onClick={dismiss} title="關閉">✕</button>
      </div>

      <div className={styles.chartGrid}>
        {METRICS.map(metric => (
          <div key={metric.key} className={styles.chartCard}>
            <div className={styles.chartLabel}>{metric.label}</div>
            <MiniBarChart actual={result.actual} baseline={result.baseline} extract={metric.extract} />
            <div className={styles.legend}>
              <span><span className={`${styles.legendDot} ${styles.legendActual}`} /> 實際</span>
              <span><span className={`${styles.legendDot} ${styles.legendBaseline}`} /> 假如不做</span>
            </div>
          </div>
        ))}
      </div>

      {lastDiv && (
        <div className={styles.summary}>
          <div className={styles.summaryTitle}>淨影響（最終回合 T{lastDiv.turn}）</div>
          <div className={styles.summaryRow}>
            <span>GDP</span>
            <span className={lastDiv.gdpDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.gdpDelta >= 0 ? '+' : ''}{lastDiv.gdpDelta.toFixed(0)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>滿意度</span>
            <span className={lastDiv.satisfactionDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.satisfactionDelta >= 0 ? '+' : ''}{lastDiv.satisfactionDelta.toFixed(1)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>人口</span>
            <span className={lastDiv.populationDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.populationDelta >= 0 ? '+' : ''}{lastDiv.populationDelta}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>基尼係數</span>
            <span className={lastDiv.giniDelta <= 0 ? styles.positive : styles.negative}>
              {lastDiv.giniDelta >= 0 ? '+' : ''}{lastDiv.giniDelta.toFixed(3)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>國庫</span>
            <span className={lastDiv.treasuryDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.treasuryDelta >= 0 ? '+' : ''}{lastDiv.treasuryDelta.toFixed(0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
