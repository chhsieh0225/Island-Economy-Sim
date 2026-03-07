import { memo, useMemo } from 'react';
import { useTutorialStore } from '../../stores/tutorialStore';
import { TUTORIAL_LESSONS } from '../../data/tutorialLessons';
import { getEncyclopediaEntry } from '../../data/encyclopedia';
import type { GameState } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './TutorialPanel.module.css';

interface Props {
  state: GameState;
  locale: string;
  onExitTutorial: () => void;
}

export const TutorialPanel = memo(function TutorialPanel({
  state,
  locale,
  onExitTutorial,
}: Props) {
  const { t } = useI18n();
  const zh = locale === 'zh-TW';

  const currentLessonIndex = useTutorialStore(s => s.currentLessonIndex);
  const phase = useTutorialStore(s => s.phase);
  const objectiveStatuses = useTutorialStore(s => s.objectiveStatuses);
  const completedLessons = useTutorialStore(s => s.completedLessons);
  const getActiveHints = useTutorialStore(s => s.getActiveHints);

  const lesson = TUTORIAL_LESSONS[currentLessonIndex];
  if (!lesson) return null;

  const activeHints = useMemo(
    () => getActiveHints(state, locale),
    [getActiveHints, state, locale],
  );

  const completedCount = objectiveStatuses.filter(o => o.completed).length;
  const totalObjectives = objectiveStatuses.length;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.lessonEmoji}>{lesson.emoji}</span>
          <div>
            <div className={styles.lessonLabel}>
              {t('tutorial.lessonProgress').replace('{n}', String(currentLessonIndex + 1)).replace('{total}', String(TUTORIAL_LESSONS.length))}
            </div>
            <div className={styles.lessonTitle}>
              {zh ? lesson.title : lesson.titleEn}
            </div>
          </div>
        </div>
        <button className={styles.exitBtn} onClick={onExitTutorial} title={t('tutorial.exit')}>
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className={styles.progressRow}>
        {TUTORIAL_LESSONS.map((l, i) => (
          <div
            key={l.id}
            className={`${styles.progressDot} ${
              i < currentLessonIndex || completedLessons.has(l.id)
                ? styles.progressDotDone
                : i === currentLessonIndex
                ? styles.progressDotCurrent
                : ''
            }`}
            title={zh ? l.title : l.titleEn}
          />
        ))}
      </div>

      {/* Instruction */}
      {phase === 'playing' && (
        <div className={styles.instruction}>
          <div className={styles.instructionIcon}>🎯</div>
          <div className={styles.instructionText}>
            {zh ? lesson.instruction : lesson.instructionEn}
          </div>
        </div>
      )}

      {/* Objectives */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          {t('tutorial.objectives')}
          <span className={styles.objectiveCount}>{completedCount}/{totalObjectives}</span>
        </div>
        <div className={styles.objectives}>
          {lesson.objectives.map((obj, i) => {
            const status = objectiveStatuses[i];
            return (
              <div
                key={obj.id}
                className={`${styles.objective} ${status?.completed ? styles.objectiveDone : ''}`}
              >
                <span className={styles.objectiveCheck}>
                  {status?.completed ? '✅' : '⬜'}
                </span>
                <span className={styles.objectiveText}>
                  {zh ? obj.text : obj.textEn}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Hints */}
      {activeHints.length > 0 && (
        <div className={styles.hints}>
          {activeHints.map((hint, i) => (
            <div key={i} className={styles.hint}>
              {hint}
            </div>
          ))}
        </div>
      )}

      {/* Related Concepts */}
      {lesson.conceptIds.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            {t('tutorial.relatedConcepts')}
          </div>
          <div className={styles.concepts}>
            {lesson.conceptIds.map(cid => {
              const entry = getEncyclopediaEntry(cid);
              if (!entry) return null;
              return (
                <div key={cid} className={styles.conceptCard}>
                  <div className={styles.conceptTitle}>
                    {zh ? entry.title : entry.titleEn}
                  </div>
                  <div className={styles.conceptIntro}>
                    {entry.intuition.slice(0, 80)}...
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lesson Selector */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          {t('tutorial.allLessons')}
        </div>
        <div className={styles.lessonList}>
          {TUTORIAL_LESSONS.map((l, i) => {
            const isDone = completedLessons.has(l.id);
            const isCurrent = i === currentLessonIndex;
            return (
              <div
                key={l.id}
                className={`${styles.lessonListItem} ${isCurrent ? styles.lessonListCurrent : ''} ${isDone ? styles.lessonListDone : ''}`}
              >
                <span className={styles.lessonListEmoji}>{l.emoji}</span>
                <span className={styles.lessonListName}>
                  {zh ? l.title : l.titleEn}
                </span>
                {isDone && <span className={styles.lessonListCheck}>✓</span>}
                {isCurrent && <span className={styles.lessonListBadge}>{t('tutorial.currentBadge')}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
