import type { AutoPlaySpeed } from '../../hooks/useGameEngine';
import styles from './ControlBar.module.css';

interface Props {
  autoPlaySpeed: AutoPlaySpeed;
  isGameOver: boolean;
  onAdvanceTurn: () => void;
  onStartAutoPlay: (speed: 'slow' | 'medium' | 'fast') => void;
  onStopAutoPlay: () => void;
  onReset: () => void;
  onEndGame: () => void;
}

export function ControlBar({
  autoPlaySpeed, isGameOver,
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
        disabled={autoPlaySpeed !== null || isGameOver}
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
            disabled={isGameOver}
          >
            {speed === 'slow' ? '慢' : speed === 'medium' ? '中' : '快'}
          </button>
        ))}
      </div>

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
    </div>
  );
}
