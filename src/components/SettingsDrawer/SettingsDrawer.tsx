import { memo, useMemo, useState } from 'react';
import { SCENARIOS } from '../../data/scenarios';
import { useAudioStore } from '../../audio/audioManager';
import { getEconomicCalibrationProfiles } from '../../engine/economicCalibration';
import type { EconomicCalibrationProfileId } from '../../engine/economicCalibration';
import type { Locale } from '../../i18n/useI18n';
import type { ScenarioId, RunSummary } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './SettingsDrawer.module.css';

interface Props {
  locale: Locale;
  onSetLocale: (locale: Locale) => void;
  /* Sim Lab */
  scenarioId: ScenarioId;
  seed: number;
  runHistory: RunSummary[];
  onStartRun: (seed: number, scenarioId: ScenarioId) => void;
  /* Economy calibration */
  economicCalibrationMode: EconomicCalibrationProfileId;
  onChangeCalibrationMode: (mode: EconomicCalibrationProfileId) => void;
  /* Navigation */
  onBackToMenu: () => void;
}

export const SettingsDrawer = memo(function SettingsDrawer({
  locale,
  onSetLocale,
  scenarioId,
  seed,
  runHistory: _runHistory,
  onStartRun,
  economicCalibrationMode,
  onChangeCalibrationMode,
  onBackToMenu,
}: Props) {
  const { t } = useI18n();
  const en = locale === 'en';

  // Audio
  const muted = useAudioStore(s => s.muted);
  const volume = useAudioStore(s => s.volume);
  const toggleMute = useAudioStore(s => s.toggleMute);
  const setVolume = useAudioStore(s => s.setVolume);

  // Sim Lab
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

  const profiles = getEconomicCalibrationProfiles();

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
    <div>
      {/* ─── Language ─── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('settings.language')}</div>
        <div className={styles.langGroup}>
          <button
            className={`${styles.langBtn} ${locale === 'zh-TW' ? styles.langBtnActive : ''}`}
            onClick={() => onSetLocale('zh-TW')}
          >
            中文
          </button>
          <button
            className={`${styles.langBtn} ${locale === 'en' ? styles.langBtnActive : ''}`}
            onClick={() => onSetLocale('en')}
          >
            English
          </button>
        </div>
      </div>

      {/* ─── Audio ─── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('settings.audio')}</div>
        <div className={styles.audioRow}>
          <button className={styles.muteBtn} onClick={toggleMute}>
            {muted ? '\u{1F507}' : volume > 0.5 ? '\u{1F50A}' : '\u{1F509}'}
          </button>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={muted ? 0 : volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className={styles.volumeSlider}
          />
        </div>
      </div>

      {/* ─── Simulation Lab ─── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('simLab.title')}</div>
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
          <label className={styles.label}>{t('simLab.seed')}</label>
          <input
            className={styles.input}
            value={displayedSeed}
            onChange={e => {
              setSeedDirty(true);
              setSeedInput(e.target.value);
            }}
            inputMode="numeric"
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.secondaryBtn} onClick={randomizeSeed}>{t('settings.randomSeed')}</button>
          <button className={styles.primaryBtn} onClick={launch}>{t('settings.applyRestart')}</button>
        </div>
      </div>

      {/* ─── Economy Calibration ─── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('settings.calibration')}</div>
        <div className={styles.modeRow}>
          {profiles.map(profile => (
            <button
              key={profile.id}
              className={`${styles.modeBtn} ${profile.id === economicCalibrationMode ? styles.modeBtnActive : ''}`}
              onClick={() => onChangeCalibrationMode(profile.id)}
            >
              {profile.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Back to Menu ─── */}
      <div className={styles.section}>
        <button className={styles.menuBtn} onClick={onBackToMenu}>
          {t('settings.backToMenu')}
        </button>
      </div>
    </div>
  );
});
