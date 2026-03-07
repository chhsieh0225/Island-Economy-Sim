import { memo, useMemo } from 'react';
import { useCounterfactualStore } from '../../stores/counterfactualStore';
import type { DivergencePoint } from '../../engine/modules/counterfactualModule';
import type { TurnSnapshot } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './CounterfactualPanel.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * CounterfactualPanel — "What If?" comparison view
 *
 * Shows side-by-side mini bar charts (actual vs baseline) for key metrics,
 * plus a summary table of net divergence at the final simulated turn,
 * plus an AI-generated interpretive explanation of WHY the divergence happened.
 * ──────────────────────────────────────────────────────────────────────────── */

interface MetricDef {
  label: string;
  key: string;
  extract: (snap: TurnSnapshot) => number;
  format: (v: number) => string;
}

function getMetrics(t: (key: string) => string): MetricDef[] {
  return [
    { label: 'GDP', key: 'gdp', extract: s => s.gdp, format: v => `$${v.toFixed(0)}` },
    { label: t('dashboard.satisfaction'), key: 'sat', extract: s => s.avgSatisfaction, format: v => `${v.toFixed(1)}%` },
    { label: t('dashboard.population'), key: 'pop', extract: s => s.population, format: v => `${v}` },
    { label: t('dashboard.gini'), key: 'gini', extract: s => s.giniCoefficient, format: v => v.toFixed(3) },
  ];
}

/* ── Interpretive analysis ──────────────────────────────────────────────── */

interface Interpretation {
  verdict: string;
  verdictClass: string;
  bullets: string[];
  lesson: string;
}

function generateInterpretation(d: DivergencePoint, _policySummary: string | null, t: (key: string) => string): Interpretation {
  const bullets: string[] = [];
  const gdpUp = d.gdpDelta > 0;
  const satUp = d.satisfactionDelta > 0;
  const popUp = d.populationDelta > 0;
  const giniUp = d.giniDelta > 0;
  const treasuryUp = d.treasuryDelta > 0;

  if (Math.abs(d.gdpDelta) > 1) {
    bullets.push(
      gdpUp
        ? `GDP +${d.gdpDelta.toFixed(0)}`
        : `GDP ${d.gdpDelta.toFixed(0)}`
    );
  }

  if (gdpUp && !satUp && Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push(`GDP↑ ${t('dashboard.satisfaction')}↓`);
  } else if (!gdpUp && satUp && Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push(`GDP↓ ${t('dashboard.satisfaction')}↑`);
  } else if (Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push(
      satUp
        ? `${t('dashboard.satisfaction')} +${d.satisfactionDelta.toFixed(1)}`
        : `${t('dashboard.satisfaction')} ${d.satisfactionDelta.toFixed(1)}`
    );
  }

  if (Math.abs(d.giniDelta) > 0.005) {
    bullets.push(
      giniUp
        ? `${t('dashboard.gini')} +${d.giniDelta.toFixed(3)}`
        : `${t('dashboard.gini')} ${d.giniDelta.toFixed(3)}`
    );
  }

  if (Math.abs(d.treasuryDelta) > 5) {
    bullets.push(
      treasuryUp
        ? `${t('dashboard.treasury')} +${d.treasuryDelta.toFixed(0)}`
        : `${t('dashboard.treasury')} ${d.treasuryDelta.toFixed(0)}`
    );
  }

  if (Math.abs(d.populationDelta) >= 2) {
    bullets.push(
      popUp
        ? `${t('dashboard.population')} +${d.populationDelta}`
        : `${t('dashboard.population')} ${d.populationDelta}`
    );
  }

  if (bullets.length === 0) {
    bullets.push(t('dashboard.causal.noChange'));
  }

  let verdict: string;
  let verdictClass: string;
  const score = (gdpUp ? 1 : -1) + (satUp ? 1 : -1) + (popUp ? 0.5 : -0.5) + (giniUp ? -0.5 : 0.5) + (treasuryUp ? 0.5 : -0.5);
  if (Math.abs(d.gdpDelta) < 1 && Math.abs(d.satisfactionDelta) < 0.5) {
    verdict = t('counterfactual.verdict.negligible');
    verdictClass = 'neutral';
  } else if (score >= 1.5) {
    verdict = t('counterfactual.verdict.positive');
    verdictClass = 'positive';
  } else if (score <= -1.5) {
    verdict = t('counterfactual.verdict.negative');
    verdictClass = 'negative';
  } else {
    verdict = t('counterfactual.verdict.mixed');
    verdictClass = 'neutral';
  }

  const lesson = '💡';

  return { verdict, verdictClass, bullets: bullets.slice(0, 4), lesson };
}

/* ── Chart components ──────────────────────────────────────────────────── */

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
            <div className={styles.barActual} style={{ height: `${aPct}%` }} title={`T${snap.turn} ${aVal.toFixed(1)}`} />
            <div className={styles.barBaseline} style={{ height: `${bPct}%` }} title={`T${snap.turn} ${bVal.toFixed(1)}`} />
          </div>
        );
      })}
    </div>
  );
}

export const CounterfactualPanel = memo(function CounterfactualPanel() {
  const { t } = useI18n();
  const result = useCounterfactualStore(s => s.result);
  const loading = useCounterfactualStore(s => s.loading);
  const policySummary = useCounterfactualStore(s => s.policySummary);
  const dismiss = useCounterfactualStore(s => s.dismiss);

  const metrics = useMemo(() => getMetrics(t), [t]);

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>{t('counterfactual.loading')}</div>
      </div>
    );
  }

  const interpretation = useMemo(() => {
    if (!result || result.divergence.length === 0) return null;
    return generateInterpretation(result.divergence[result.divergence.length - 1], policySummary, t);
  }, [result, policySummary, t]);

  if (!result || result.actual.length === 0) return null;

  const lastDiv = result.divergence[result.divergence.length - 1];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{t('counterfactual.title')}</div>
          {policySummary && <div className={styles.subtitle}>{policySummary}</div>}
        </div>
        <button className={styles.closeBtn} onClick={dismiss} title={t('counterfactual.close')}>✕</button>
      </div>

      <div className={styles.chartGrid}>
        {metrics.map(metric => (
          <div key={metric.key} className={styles.chartCard}>
            <div className={styles.chartLabel}>{metric.label}</div>
            <MiniBarChart actual={result.actual} baseline={result.baseline} extract={metric.extract} />
            <div className={styles.legend}>
              <span><span className={`${styles.legendDot} ${styles.legendActual}`} /> {t('counterfactual.actual')}</span>
              <span><span className={`${styles.legendDot} ${styles.legendBaseline}`} /> {t('counterfactual.baseline')}</span>
            </div>
          </div>
        ))}
      </div>

      {lastDiv && (
        <div className={styles.summary}>
          <div className={styles.summaryTitle}>{t('counterfactual.netImpact').replace('{turn}', String(lastDiv.turn))}</div>
          <div className={styles.summaryRow}>
            <span>GDP</span>
            <span className={lastDiv.gdpDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.gdpDelta >= 0 ? '+' : ''}{lastDiv.gdpDelta.toFixed(0)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('dashboard.satisfaction')}</span>
            <span className={lastDiv.satisfactionDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.satisfactionDelta >= 0 ? '+' : ''}{lastDiv.satisfactionDelta.toFixed(1)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('dashboard.population')}</span>
            <span className={lastDiv.populationDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.populationDelta >= 0 ? '+' : ''}{lastDiv.populationDelta}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('dashboard.gini')}</span>
            <span className={lastDiv.giniDelta <= 0 ? styles.positive : styles.negative}>
              {lastDiv.giniDelta >= 0 ? '+' : ''}{lastDiv.giniDelta.toFixed(3)}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('dashboard.treasury')}</span>
            <span className={lastDiv.treasuryDelta >= 0 ? styles.positive : styles.negative}>
              {lastDiv.treasuryDelta >= 0 ? '+' : ''}{lastDiv.treasuryDelta.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      {interpretation && (
        <div className={styles.interpretation}>
          <div className={`${styles.verdict} ${styles[interpretation.verdictClass]}`}>
            {interpretation.verdict}
          </div>
          <ul className={styles.bullets}>
            {interpretation.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {interpretation.lesson !== '💡' && (
            <div className={styles.lesson}>{interpretation.lesson}</div>
          )}
        </div>
      )}
    </div>
  );
});
