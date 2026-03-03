import type { ScenarioNarrative } from '../../types';
import styles from './NarrativeModal.module.css';

interface Props {
  narrative: ScenarioNarrative;
  onDismiss: () => void;
}

export function NarrativeModal({ narrative, onDismiss }: Props) {
  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{narrative.title}</h2>
        {narrative.paragraphs.map((p, i) => (
          <p key={i} className={styles.paragraph}>{p}</p>
        ))}
        <div className={styles.challenge}>
          <span className={styles.challengeIcon}>🎯</span>
          <span>{narrative.challenge}</span>
        </div>
        <button className={styles.startBtn} onClick={onDismiss}>
          開始遊戲 Start Game
        </button>
      </div>
    </div>
  );
}
