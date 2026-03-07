import { memo, useState } from 'react';
import type { NarrativeDisplay } from '../../stores/uiStore';
import { useI18n } from '../../i18n/useI18n';
import styles from './NarrativeModal.module.css';

const PORTRAIT_EMOJI: Record<string, string> = {
  mayor: '\u{1F3DB}',   // classical building
  elder: '\u{1F9D3}',   // older person
  farmer: '\u{1F33E}',  // rice
  merchant: '\u{1F4B0}', // money bag
  scholar: '\u{1F4DA}', // books
};

interface Props {
  narrative: NarrativeDisplay;
  onDismiss: () => void;
}

export const NarrativeModal = memo(function NarrativeModal({ narrative, onDismiss }: Props) {
  const { t } = useI18n();
  const [pageIdx, setPageIdx] = useState(0);

  if (narrative.kind === 'scenario') {
    const { title, paragraphs, challenge } = narrative.data;
    return (
      <div className={styles.overlay} onClick={onDismiss}>
        <div className={styles.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
          <h2 className={styles.title}>{title}</h2>
          {paragraphs.map((p, i) => (
            <p key={i} className={styles.paragraph}>{p}</p>
          ))}
          <div className={styles.challenge}>
            <span className={styles.challengeIcon}>&#x1F3AF;</span>
            <span>{challenge}</span>
          </div>
          <button className={styles.startBtn} onClick={onDismiss}>
            {t('narrative.startGame')}
          </button>
        </div>
      </div>
    );
  }

  // Story narrative — multi-page with portraits
  const { title, pages } = narrative.data;
  const page = pages[pageIdx];
  const isLast = pageIdx >= pages.length - 1;
  const isFirst = pageIdx === 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>

        <div className={styles.storyPage}>
          {page.portrait && (
            <div className={styles.portrait}>
              <span className={styles.portraitEmoji}>
                {PORTRAIT_EMOJI[page.portrait] ?? '\u{1F464}'}
              </span>
            </div>
          )}
          <p className={styles.storyText}>{page.text}</p>
        </div>

        <div className={styles.pageIndicator}>
          {pages.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === pageIdx ? styles.dotActive : ''}`}
            />
          ))}
        </div>

        <div className={styles.navRow}>
          {!isFirst && (
            <button
              className={styles.navBtn}
              onClick={() => setPageIdx(p => p - 1)}
            >
              {t('narrative.prevPage')}
            </button>
          )}
          <div className={styles.navSpacer} />
          {isLast ? (
            <button className={styles.startBtn} onClick={onDismiss}>
              {t('narrative.continue')}
            </button>
          ) : (
            <button
              className={styles.navBtn}
              onClick={() => setPageIdx(p => p + 1)}
            >
              {t('narrative.nextPage')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
