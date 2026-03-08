import { useMemo, useState, memo } from 'react';
import { SCENARIOS } from '../../data/scenarios';
import type { RunSummary, ScenarioId } from '../../types';
import { useI18n } from '../../i18n/useI18n';
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

export const SimulationLab = memo(function SimulationLab({ scenarioId, seed, runHistory, onStartRun }: Props) {
  const { t, locale } = useI18n();
  const en = locale === 'en';
  const [seedInput, setSeedInput] = useState(String(seed));
  const [scenarioInput, setScenarioInput] = useState<ScenarioId>(scenarioId);
  const [seedDirty, setSeedDirty] = useState(false);
  const [scenarioDirty, setScenarioDirty] = useState(false);

  const displayedSeed = seedDirty ? seedInput : String(seed);
  const displayedScenario = scenarioDirty ? scenarioInput : scenarioId;

  const selectedScenario = useMemo(
    () => SCENARIOS.find(s => s.id === displayedScenario) ?? SCENARIOS[0],
    [displayedScenario],
  );

  const latest = runHistory[0];
  const prev = runHistory[1];

  const launch = () => {
    const parsed = Number(displayedSeed);
    const nextSeed = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : Date.now();
    onStartRun(nextSeed, displayedScenario);
    setSeedInput(String(nextSeed));
    setScenarioInput(displayedScenario);
    setSeedDirty(false);
    setScenarioDirty(false);
  };

  const randomizeSeed = () => {
    setSeedDirty(true);
    setSeedInput(String(Date.now()));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{t('simLab.title')}</div>

      <div className={styles.controlRow}>
        <label className={styles.label}>{t('simLab.scenario')}</label>
        <select
          className={styles.select}
          value={displayedScenario}
          onChange={e => {
            setScenarioDirty(true);
            setScenarioInput(e.target.value as ScenarioId);
          }}
        >
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>{en ? s.nameEn : s.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.desc}>{en ? selectedScenario.descriptionEn : selectedScenario.description}</div>

      <div className={styles.controlRow}>
        <label className={styles.label}>Seed</label>
        <input
          className={styles.input}
          value={displayedSeed}
          onChange={e => {
            setSeedDirty(true);
            setSeedInput(e.target.value);
          }}
          inputMode="numeric"
          placeholder={t('simLab.seedPlaceholder')}
        />
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryBtn} onClick={randomizeSeed}>{t('simLab.randomSeed')}</button>
        <button className={styles.primaryBtn} onClick={launch}>{t('simLab.applyRestart')}</button>
      </div>

      <div className={styles.sectionTitle}>{t('simLab.recentCompare')}</div>
      {!latest || !prev ? (
        <div className={styles.empty}>{t('simLab.compareEmpty')}</div>
      ) : (
        <div className={styles.compare}>
          <div className={styles.compareRow}>
            <span>{t('simLab.score')}</span>
            <span className={styles.delta}>{fmtDelta(latest.score - prev.score)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>{t('simLab.finalPop')}</span>
            <span className={styles.delta}>{fmtDelta(latest.finalPopulation - prev.finalPopulation)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>{t('simLab.finalGdp')}</span>
            <span className={styles.delta}>{fmtDelta(latest.finalGdp - prev.finalGdp, 0)}</span>
          </div>
          <div className={styles.compareRow}>
            <span>{t('simLab.finalGini')}</span>
            <span className={styles.delta}>{fmtDelta(latest.finalGini - prev.finalGini, 3)}</span>
          </div>
        </div>
      )}

      {runHistory.length > 0 && (
        <>
          <div className={styles.sectionTitle}>{t('simLab.recentHistory')}</div>
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
});
