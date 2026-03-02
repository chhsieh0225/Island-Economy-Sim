import type { PendingDecision } from '../../types';
import styles from './DecisionPanel.module.css';

interface Props {
  decision: PendingDecision;
  onChoose: (choiceId: string) => void;
}

export function DecisionPanel({ decision, onChoose }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.title}>市政抉擇 Civic Decision</div>
        <div className={styles.name}>{decision.name}</div>
        <div className={styles.message}>{decision.message}</div>
        <div className={styles.choices}>
          {decision.choices.map(choice => (
            <button
              key={choice.id}
              className={styles.choice}
              onClick={() => onChoose(choice.id)}
            >
              <span className={styles.choiceLabel}>{choice.label}</span>
              <span className={styles.choiceDesc}>{choice.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
