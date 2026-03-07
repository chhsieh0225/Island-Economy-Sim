import type { PendingDecision, DecisionChoice } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './DecisionPanel.module.css';

interface Props {
  decision: PendingDecision;
  onChoose: (choiceId: string) => void;
}

function buildImpactTags(choice: DecisionChoice, t: (key: string) => string): { text: string; positive: boolean }[] {
  const tags: { text: string; positive: boolean }[] = [];
  if (choice.immediate) {
    const im = choice.immediate;
    if (im.treasuryDelta) tags.push({ text: `${t('decision.treasury')} ${im.treasuryDelta > 0 ? '+' : ''}$${im.treasuryDelta}`, positive: im.treasuryDelta > 0 });
    if (im.satisfactionDelta) tags.push({ text: `${t('decision.satisfaction')} ${im.satisfactionDelta > 0 ? '+' : ''}${im.satisfactionDelta}`, positive: im.satisfactionDelta > 0 });
    if (im.healthDelta) tags.push({ text: `${t('decision.health')} ${im.healthDelta > 0 ? '+' : ''}${im.healthDelta}`, positive: im.healthDelta > 0 });
  }
  if (choice.temporary) {
    tags.push({ text: t('decision.duration').replace('{n}', String(choice.temporary.duration)), positive: true });
    const eff = choice.temporary.effects;
    if (eff.productivityPenalty) tags.push({ text: `${t('decision.productivity')} ${((1 - eff.productivityPenalty) * 100 - 100).toFixed(0)}%`, positive: false });
    if (eff.servicesDemandBoost) tags.push({ text: `${t('decision.servicesDemand')} +${((eff.servicesDemandBoost - 1) * 100).toFixed(0)}%`, positive: true });
  }
  return tags;
}

export function DecisionPanel({ decision, onChoose }: Props) {
  const { t } = useI18n();

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.title}>{t('decision.title')}</div>
        <div className={styles.name}>{decision.name}</div>
        <div className={styles.message}>{decision.message}</div>
        <div className={styles.choices}>
          {decision.choices.map(choice => {
            const impactTags = buildImpactTags(choice, t);
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
