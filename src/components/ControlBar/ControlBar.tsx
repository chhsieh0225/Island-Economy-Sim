import { memo } from 'react';
import type { AutoPlaySpeed } from '../../stores/gameStore';
import { useGameStore } from '../../stores/gameStore';
import { useAudioStore } from '../../audio/audioManager';
import styles from './ControlBar.module.css';

interface Props {
  autoPlaySpeed: AutoPlaySpeed;
  isGameOver: boolean;
  hasPendingDecision: boolean;
  onAdvanceTurn: () => void;
  onStartAutoPlay: (speed: 'slow' | 'medium' | 'fast') => void;
  onStopAutoPlay: () => void;
  onReset: () => void;
  onEndGame: () => void;
}

function SaveLoadControls() {
  const hasSavedGame = useGameStore(s => s.hasSavedGame);
  const save = useGameStore(s => s.saveCurrentGame);
  const load = useGameStore(s => s.loadSavedGame);

  return (
    <div className={styles.saveLoadGroup}>
      <button className={styles.saveBtn} onClick={save} title="儲存 Save">
        存
      </button>
      <button
        className={styles.loadBtn}
        onClick={load}
        disabled={!hasSavedGame}
        title="讀取 Load"
      >
        讀
      </button>
    </div>
  );
}

function AudioControls() {
  const muted = useAudioStore(s => s.muted);
  const volume = useAudioStore(s => s.volume);
  const toggleMute = useAudioStore(s => s.toggleMute);
  const setVolume = useAudioStore(s => s.setVolume);

  return (
    <div className={styles.audioControls}>
      <button className={styles.muteBtn} onClick={toggleMute} title={muted ? '取消靜音' : '靜音'}>
        {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={muted ? 0 : volume}
        onChange={e => setVolume(parseFloat(e.target.value))}
        className={styles.volumeSlider}
        title={`音量 ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}

export const ControlBar = memo(function ControlBar({
  autoPlaySpeed, isGameOver, hasPendingDecision,
  onAdvanceTurn, onStartAutoPlay, onStopAutoPlay, onReset, onEndGame,
}: Props) {
  const handleSpeedClick = (speed: 'slow' | 'medium' | 'fast') => {
    if (autoPlaySpeed === speed) {
      onStopAutoPlay();
    } else {
      onStartAutoPlay(speed);
    }
  };

  return (
    <div className={styles.bar}>
      <button
        className={styles.nextTurnBtn}
        onClick={onAdvanceTurn}
        disabled={autoPlaySpeed !== null || isGameOver || hasPendingDecision}
      >
        ▶ 下一回合
      </button>

      {autoPlaySpeed !== null && (
        <button className={styles.pauseBtn} onClick={onStopAutoPlay}>
          ⏸ 暫停 Pause
        </button>
      )}

      <span className={styles.label}>自動:</span>
      <div className={styles.autoGroup}>
        {(['slow', 'medium', 'fast'] as const).map(speed => (
          <button
            key={speed}
            className={`${styles.speedBtn} ${autoPlaySpeed === speed ? styles.speedBtnActive : ''}`}
            onClick={() => handleSpeedClick(speed)}
            disabled={isGameOver || hasPendingDecision}
          >
            {speed === 'slow' ? '慢' : speed === 'medium' ? '中' : '快'}
          </button>
        ))}
      </div>

      {hasPendingDecision && (
        <span className={styles.pendingFlag}>等待市政抉擇中</span>
      )}

      <button
        className={styles.endGameBtn}
        onClick={onEndGame}
        disabled={isGameOver}
      >
        結束 End
      </button>

      <button className={styles.resetBtn} onClick={onReset}>
        重置
      </button>

      <SaveLoadControls />
      <AudioControls />
    </div>
  );
});
