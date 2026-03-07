import { memo } from 'react';
import type { TutorialLesson } from '../../data/tutorialLessons';
import type { TutorialPhase } from '../../stores/tutorialStore';
import { useI18n } from '../../i18n/useI18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './TutorialModal.module.css';

interface Props {
  lesson: TutorialLesson;
  phase: TutorialPhase;
  locale: string;
  onDismissIntro: () => void;
  onNextLesson: () => void;
  onExitTutorial: () => void;
}

export const TutorialModal = memo(function TutorialModal({
  lesson,
  phase,
  locale,
  onDismissIntro,
  onNextLesson,
  onExitTutorial,
}: Props) {
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const zh = locale === 'zh-TW';

  if (phase === 'intro') {
    return (
      <div className={styles.overlay}>
        <div ref={trapRef} className={styles.modal} role="dialog" aria-modal="true">
          <div className={styles.modalEmoji}>{lesson.emoji}</div>
          <div className={styles.modalLabel}>
            {t('tutorial.lessonN').replace('{n}', String(lesson.order + 1))}
          </div>
          <h2 className={styles.modalTitle}>
            {zh ? lesson.title : lesson.titleEn}
          </h2>
          <div className={styles.introParagraphs}>
            {(zh ? lesson.intro : lesson.introEn).map((p, i) => (
              <p key={i} className={styles.introParagraph}>{p}</p>
            ))}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.primaryBtn} onClick={onDismissIntro}>
              {t('tutorial.startLearning')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div className={styles.overlay}>
        <div ref={trapRef} className={styles.modal} role="dialog" aria-modal="true">
          <div className={styles.modalEmoji}>🎉</div>
          <div className={styles.modalLabel}>
            {t('tutorial.complete')}
          </div>
          <h2 className={styles.modalTitle}>
            {zh ? lesson.title : lesson.titleEn}
          </h2>
          <div className={styles.summaryBlock}>
            <div className={styles.summaryLabel}>
              {t('tutorial.whatYouLearned')}
            </div>
            <p className={styles.summaryText}>
              {zh ? lesson.summary : lesson.summaryEn}
            </p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.primaryBtn} onClick={onNextLesson}>
              {t('tutorial.nextLessonBtn')}
            </button>
            <button className={styles.secondaryBtn} onClick={onExitTutorial}>
              {t('tutorial.backToMenu')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className={styles.overlay}>
        <div ref={trapRef} className={styles.modal} role="dialog" aria-modal="true">
          <div className={styles.modalEmoji}>🎓</div>
          <div className={styles.modalLabel}>
            {t('tutorial.congratulations')}
          </div>
          <h2 className={styles.modalTitle}>
            {t('tutorial.completedAllTitle')}
          </h2>
          <div className={styles.summaryBlock}>
            <p className={styles.summaryText}>
              {t('tutorial.completedAllDesc')}
            </p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.primaryBtn} onClick={onExitTutorial}>
              {t('tutorial.enterFreePlay')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
});
