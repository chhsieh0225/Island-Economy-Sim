import type { PendingDecision, DecisionChoice } from '../../types';
import styles from './DecisionPanel.module.css';

interface Props {
  decision: PendingDecision;
  onChoose: (choiceId: string) => void;
}

function buildImpactTags(choice: DecisionChoice): { text: string; positive: boolean }[] {
  const tags: { text: string; positive: boolean }[] = [];
  if (choice.immediate) {
    const im = choice.immediate;
    if (im.treasuryDelta) tags.push({ text: `國庫 ${im.treasuryDelta > 0 ? '+' : ''}$${im.treasuryDelta}`, positive: im.treasuryDelta > 0 });
    if (im.satisfactionDelta) tags.push({ text: `滿意度 ${im.satisfactionDelta > 0 ? '+' : ''}${im.satisfactionDelta}`, positive: im.satisfactionDelta > 0 });
    if (im.healthDelta) tags.push({ text: `健康 ${im.healthDelta > 0 ? '+' : ''}${im.healthDelta}`, positive: im.healthDelta > 0 });
  }
  if (choice.temporary) {
    tags.push({ text: `持續 ${choice.temporary.duration} 回合`, positive: true });
    const eff = choice.temporary.effects;
    if (eff.productivityPenalty) tags.push({ text: `生產力 ${((1 - eff.productivityPenalty) * 100 - 100).toFixed(0)}%`, positive: false });
    if (eff.servicesDemandBoost) tags.push({ text: `服務需求 +${((eff.servicesDemandBoost - 1) * 100).toFixed(0)}%`, positive: true });
  }
  return tags;
}

export function DecisionPanel({ decision, onChoose }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.title}>市政抉擇 Civic Decision</div>
        <div className={styles.name}>{decision.name}</div>
        <div className={styles.message}>{decision.message}</div>
        <div className={styles.choices}>
          {decision.choices.map(choice => {
            const impactTags = buildImpactTags(choice);
            return (
              <button
                key={choice.id}
                className={styles.choice}
                onClick={() => onChoose(choice.id)}
              >
                <span className={styles.choiceLabel}>{choice.label}</span>
                <span className={styles.choiceDesc}>{choice.description}</span>
                {impactTags.length > 0 && (
                  <div className={styles.impactPreview}>
                    {impactTags.map((tag, i) => (
                      <span key={i} className={`${styles.impactTag} ${tag.positive ? styles.impactPositive : styles.impactNegative}`}>
                        {tag.text}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
