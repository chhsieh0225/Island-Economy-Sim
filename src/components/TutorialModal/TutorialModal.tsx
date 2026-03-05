import { memo } from 'react';
import type { TutorialLesson } from '../../data/tutorialLessons';
import type { TutorialPhase } from '../../stores/tutorialStore';
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
  const zh = locale === 'zh-TW';

  if (phase === 'intro') {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.modalEmoji}>{lesson.emoji}</div>
          <div className={styles.modalLabel}>
            {zh ? `第 ${lesson.order + 1} 課` : `Lesson ${lesson.order + 1}`}
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
              {zh ? '開始學習 ▶' : 'Start Learning ▶'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.modalEmoji}>🎉</div>
          <div className={styles.modalLabel}>
            {zh ? '課程完成！' : 'Lesson Complete!'}
          </div>
          <h2 className={styles.modalTitle}>
            {zh ? lesson.title : lesson.titleEn}
          </h2>
          <div className={styles.summaryBlock}>
            <div className={styles.summaryLabel}>
              {zh ? '📝 你學到了：' : '📝 What you learned:'}
            </div>
            <p className={styles.summaryText}>
              {zh ? lesson.summary : lesson.summaryEn}
            </p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.primaryBtn} onClick={onNextLesson}>
              {zh ? '下一課 ▶' : 'Next Lesson ▶'}
            </button>
            <button className={styles.secondaryBtn} onClick={onExitTutorial}>
              {zh ? '回到主選單' : 'Back to Menu'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.modalEmoji}>🎓</div>
          <div className={styles.modalLabel}>
            {zh ? '恭喜畢業！' : 'Congratulations!'}
          </div>
          <h2 className={styles.modalTitle}>
            {zh ? '你已完成所有經濟學教學課程' : 'You\'ve completed all economics lessons'}
          </h2>
          <div className={styles.summaryBlock}>
            <p className={styles.summaryText}>
              {zh
                ? '你學習了供給與需求、價格機制、稅收、補貼、福利、公共財、通膨與貨幣政策等核心概念。現在可以進入自由模式，挑戰真正的經濟治理！'
                : 'You learned supply & demand, pricing, taxation, subsidies, welfare, public goods, inflation & monetary policy. Now enter Free Play for the real challenge!'}
            </p>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.primaryBtn} onClick={onExitTutorial}>
              {zh ? '進入自由模式 🎮' : 'Enter Free Play 🎮'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
});
