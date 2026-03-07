import { memo } from 'react';
import { TUTORIAL_LESSONS } from '../../data/tutorialLessons';
import { useI18n } from '../../i18n/useI18n';
import styles from './StartScreen.module.css';

interface Props {
  locale: string;
  completedLessons: Set<string>;
  onStartFreePlay: () => void;
  onStartTutorial: () => void;
}

export const StartScreen = memo(function StartScreen({
  locale,
  completedLessons,
  onStartFreePlay,
  onStartTutorial,
}: Props) {
  const { t } = useI18n();
  const zh = locale === 'zh-TW';
  const completedCount = TUTORIAL_LESSONS.filter(l => completedLessons.has(l.id)).length;
  const totalLessons = TUTORIAL_LESSONS.length;
  const allDone = completedCount >= totalLessons;

  return (
    <div className={styles.backdrop}>
      <div className={styles.container}>
        <div className={styles.island}>🏝️</div>
        <h1 className={styles.title}>
          {t('start.title')}
        </h1>
        <p className={styles.subtitle}>
          {t('start.subtitle')}
        </p>

        <div className={styles.cards}>
          {/* Tutorial Mode Card */}
          <button className={styles.card} onClick={onStartTutorial}>
            <div className={styles.cardIcon}>📚</div>
            <div className={styles.cardTitle}>
              {t('start.tutorial.title')}
            </div>
            <div className={styles.cardDesc}>
              {t('start.tutorial.desc')}
            </div>
            <div className={styles.cardProgress}>
              {completedCount > 0 && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${(completedCount / totalLessons) * 100}%` }}
                  />
                </div>
              )}
              <span className={styles.progressText}>
                {allDone
                  ? t('start.tutorial.allDone')
                  : `${completedCount} / ${totalLessons} ${t('start.tutorial.completed')}`}
              </span>
            </div>
            <div className={styles.cardBadge}>
              {t('start.tutorial.badge')}
            </div>
          </button>

          {/* Free Play Card */}
          <button className={styles.card} onClick={onStartFreePlay}>
            <div className={styles.cardIcon}>🎮</div>
            <div className={styles.cardTitle}>
              {t('start.freeplay.title')}
            </div>
            <div className={styles.cardDesc}>
              {t('start.freeplay.desc')}
            </div>
            <div className={styles.cardFeatures}>
              <span className={styles.featureTag}>
                {t('start.freeplay.scenarios')}
              </span>
              <span className={styles.featureTag}>
                {t('start.freeplay.allTools')}
              </span>
              <span className={styles.featureTag}>
                {t('start.freeplay.ai')}
              </span>
            </div>
          </button>
        </div>

        {/* Lesson preview */}
        <div className={styles.lessonPreview}>
          <div className={styles.previewTitle}>
            {t('start.lessonsOverview')}
          </div>
          <div className={styles.lessonList}>
            {TUTORIAL_LESSONS.map(lesson => {
              const done = completedLessons.has(lesson.id);
              return (
                <div
                  key={lesson.id}
                  className={`${styles.lessonItem} ${done ? styles.lessonDone : ''}`}
                >
                  <span className={styles.lessonEmoji}>{lesson.emoji}</span>
                  <span className={styles.lessonName}>
                    {zh ? lesson.title : lesson.titleEn}
                  </span>
                  {done && <span className={styles.lessonCheck}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
