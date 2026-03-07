import { memo, useMemo } from 'react';
import { useCounterfactualStore } from '../../stores/counterfactualStore';
import type { DivergencePoint } from '../../engine/modules/counterfactualModule';
import type { TurnSnapshot } from '../../types';
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

const METRICS: MetricDef[] = [
  { label: 'GDP', key: 'gdp', extract: s => s.gdp, format: v => `$${v.toFixed(0)}` },
  { label: '滿意度 Satisfaction', key: 'sat', extract: s => s.avgSatisfaction, format: v => `${v.toFixed(1)}%` },
  { label: '人口 Population', key: 'pop', extract: s => s.population, format: v => `${v}` },
  { label: '基尼 Gini', key: 'gini', extract: s => s.giniCoefficient, format: v => v.toFixed(3) },
];

/* ── Interpretive analysis ──────────────────────────────────────────────── */

interface Interpretation {
  verdict: string;       // One-line verdict (e.g., "利大於弊")
  verdictClass: string;  // CSS class: positive/negative/neutral
  bullets: string[];     // 2-4 explanatory bullets
  lesson: string;        // Economic concept takeaway
}

function generateInterpretation(d: DivergencePoint, policySummary: string | null): Interpretation {
  const bullets: string[] = [];
  const gdpUp = d.gdpDelta > 0;
  const satUp = d.satisfactionDelta > 0;
  const popUp = d.populationDelta > 0;
  const giniUp = d.giniDelta > 0; // higher gini = worse inequality
  const treasuryUp = d.treasuryDelta > 0;

  // GDP explanation
  if (Math.abs(d.gdpDelta) > 1) {
    bullets.push(
      gdpUp
        ? `這項政策使 GDP 增加 ${d.gdpDelta.toFixed(0)}，刺激了產出。`
        : `這項政策使 GDP 減少 ${Math.abs(d.gdpDelta).toFixed(0)}，可能抑制了生產意願。`
    );
  }

  // Satisfaction vs GDP trade-off
  if (gdpUp && !satUp && Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push('GDP 上升但滿意度下降：經濟成長的好處未均勻分配，部分居民感受不到改善。');
  } else if (!gdpUp && satUp && Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push('GDP 下降但滿意度上升：福利或補貼讓居民感覺更好，但總產出降低。');
  } else if (Math.abs(d.satisfactionDelta) > 0.5) {
    bullets.push(
      satUp
        ? `居民滿意度改善 ${d.satisfactionDelta.toFixed(1)} 點，生活品質有感提升。`
        : `居民滿意度下降 ${Math.abs(d.satisfactionDelta).toFixed(1)} 點，政策可能造成民怨。`
    );
  }

  // Inequality
  if (Math.abs(d.giniDelta) > 0.005) {
    bullets.push(
      giniUp
        ? `基尼係數上升 ${d.giniDelta.toFixed(3)}，貧富差距擴大 — 經濟成長可能集中在特定群體。`
        : `基尼係數下降 ${Math.abs(d.giniDelta).toFixed(3)}，所得分配更平均。`
    );
  }

  // Treasury
  if (Math.abs(d.treasuryDelta) > 5) {
    bullets.push(
      treasuryUp
        ? `國庫增加 ${d.treasuryDelta.toFixed(0)}，財政空間更充裕。`
        : `國庫減少 ${Math.abs(d.treasuryDelta).toFixed(0)}，長期可能面臨財政壓力。`
    );
  }

  // Population
  if (Math.abs(d.populationDelta) >= 2) {
    bullets.push(
      popUp
        ? `人口增加 ${d.populationDelta} 人，良好的環境吸引新居民。`
        : `人口減少 ${Math.abs(d.populationDelta)} 人，居民因不滿或貧窮而離開。`
    );
  }

  // Fallback if nothing significant
  if (bullets.length === 0) {
    bullets.push('這項政策的短期影響微乎其微，可能需要更長的觀察窗口才能看出差異。');
  }

  // Determine verdict
  let verdict: string;
  let verdictClass: string;
  const score = (gdpUp ? 1 : -1) + (satUp ? 1 : -1) + (popUp ? 0.5 : -0.5) + (giniUp ? -0.5 : 0.5) + (treasuryUp ? 0.5 : -0.5);
  if (Math.abs(d.gdpDelta) < 1 && Math.abs(d.satisfactionDelta) < 0.5) {
    verdict = '影響不大 Negligible Impact';
    verdictClass = 'neutral';
  } else if (score >= 1.5) {
    verdict = '利大於弊 Net Positive';
    verdictClass = 'positive';
  } else if (score <= -1.5) {
    verdict = '弊大於利 Net Negative';
    verdictClass = 'negative';
  } else {
    verdict = '利弊互見 Mixed Impact';
    verdictClass = 'neutral';
  }

  // Economic lesson
  const lessons: string[] = [];
  if (gdpUp && !satUp) {
    lessons.push('💡 經濟學概念：「效率 vs. 公平」取捨 — 促進總產出的政策不一定提升所有人的幸福。');
  } else if (!gdpUp && treasuryUp) {
    lessons.push('💡 經濟學概念：「稅收與產出的兩難」— 增加稅收可能抑制經濟活動（拉弗曲線）。');
  } else if (giniUp && gdpUp) {
    lessons.push('💡 經濟學概念：「庫茲涅茲曲線」— 經濟成長初期往往伴隨不平等加劇。');
  } else if (!giniUp && satUp) {
    lessons.push('💡 經濟學概念：「再分配效果」— 縮小貧富差距通常能提升整體社會滿意度。');
  } else if (popUp && satUp) {
    lessons.push('💡 經濟學概念：「用腳投票」— 好的生活環境自然吸引人口流入。');
  } else {
    lessons.push('💡 經濟學概念：政策效果往往有延遲，一項政策的完整影響可能需要數回合才能顯現。');
  }

  return { verdict, verdictClass, bullets: bullets.slice(0, 4), lesson: lessons[0] };
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

  const interpretation = useMemo(() => {
    if (!result || result.divergence.length === 0) return null;
    return generateInterpretation(result.divergence[result.divergence.length - 1], policySummary);
  }, [result, policySummary]);

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
          <div className={styles.lesson}>{interpretation.lesson}</div>
        </div>
      )}
    </div>
  );
});
