import { useEffect, useMemo, useState } from 'react';
import { SCENARIOS } from '../../data/scenarios';
import type { RunSummary, ScenarioId } from '../../types';
import styles from './SimulationLab.module.css';

interface Props {
  scenarioId: ScenarioId;
  seed: number;
  runHistory: RunSummary[];
  onStartRun: (seed: number, scenarioId: ScenarioId) => void;
}

function fmtDelta(value: number, digits: number = 0): string {
  const fixed = value.toFixed(digits);
  return value >= 0 ? `+${fixed}` : fixed;
}

export function SimulationLab({ scenarioId, seed, runHistory, onStartRun }: Props) {
  const [seedInput, setSeedInput] = useState(String(seed));
  const [scenarioInput, setScenarioInput] = useState<ScenarioId>(scenarioId);

  useEffect(() => {
    setSeedInput(String(seed));
    setScenarioInput(scenarioId);
  }, [seed, scenarioId]);

  const selectedScenario = useMemo(
    () => SCENARIOS.find(s => s.id === scenarioInput) ?? SCENARIOS[0],
    [scenarioInput],
  );

  const latest = runHistory[0];
  const prev = runHistory[1];

  const launch = () => {
    const parsed = Number(seedInput);
    const nextSeed = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : Date.now();
    onStartRun(nextSeed, scenarioInput);
  };

  const randomizeSeed = () => {
    setSeedInput(String(Date.now()));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>模擬實驗室 Simulation Lab</div>

      <div className={styles.controlRow}>
        <label className={styles.label}>劇本 Scenario</label>
        <select
          className={styles.select}
          value={scenarioInput}
          onChange={e => setScenarioInput(e.target.value as ScenarioId)}
        >
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.desc}>{selectedScenario.description}</div>

      <div className={styles.controlRow}>
        <label className={styles.label}>Seed</label>
        <input
          className={styles.input}
          value={seedInput}
          onChange={e => setSeedInput(e.target.value)}
          inputMode="numeric"
          placeholder="輸入整數 seed"
        />
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryBtn} onClick={randomizeSeed}>隨機 Seed</button>
        <button className={styles.primaryBtn} onClick={launch}>套用並重開</button>
      </div>

      <div className={styles.sectionTitle}>最近兩局比較 Recent Compare</div>
      {!latest || !prev ? (
        <div className={styles.empty}>完成至少兩局後會顯示對比。</div>
      ) : (
        <div className={styles.compare}>
          <div className={styles.compareRow}>
            <span>分數</span>
            <span className={styles.delta}>{fmtDelta(latest.score - prev.score)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>最終人口</span>
            <span className={styles.delta}>{fmtDelta(latest.finalPopulation - prev.finalPopulation)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>最終 GDP</span>
            <span className={styles.delta}>{fmtDelta(latest.finalGdp - prev.finalGdp, 0)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>最終基尼</span>
            <span className={styles.delta}>{fmtDelta(latest.finalGini - prev.finalGini, 3)}</span>
          </div>
        </div>
      )}

      {runHistory.length > 0 && (
        <>
          <div className={styles.sectionTitle}>最近紀錄</div>
          <div className={styles.history}>
            {runHistory.slice(0, 5).map(run => (
              <div key={run.id} className={styles.historyItem}>
                <span className={styles.historyName}>{run.scenarioName}</span>
                <span className={styles.historyMeta}>Seed {run.seed}</span>
                <span className={styles.historyMeta}>Score {run.score}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
