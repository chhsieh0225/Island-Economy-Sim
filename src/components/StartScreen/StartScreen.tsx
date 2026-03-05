import { memo } from 'react';
import { TUTORIAL_LESSONS } from '../../data/tutorialLessons';
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
  const zh = locale === 'zh-TW';
  const completedCount = TUTORIAL_LESSONS.filter(l => completedLessons.has(l.id)).length;
  const totalLessons = TUTORIAL_LESSONS.length;
  const allDone = completedCount >= totalLessons;

  return (
    <div className={styles.backdrop}>
      <div className={styles.container}>
        <div className={styles.island}>🏝️</div>
        <h1 className={styles.title}>
          {zh ? '小島經濟模擬器' : 'Island Economy Simulator'}
        </h1>
        <p className={styles.subtitle}>
          {zh ? '選擇你的遊戲模式' : 'Choose your game mode'}
        </p>

        <div className={styles.cards}>
          {/* Tutorial Mode Card */}
          <button className={styles.card} onClick={onStartTutorial}>
            <div className={styles.cardIcon}>📚</div>
            <div className={styles.cardTitle}>
              {zh ? '教學模式' : 'Tutorial Mode'}
            </div>
            <div className={styles.cardDesc}>
              {zh
                ? '逐步學習 8 個核心經濟學概念。每堂課專注一個觀點，循序漸進。'
                : 'Learn 8 core economics concepts step by step. Each lesson focuses on one idea.'}
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
                  ? (zh ? '✅ 已全部完成（可重玩）' : '✅ All completed (replay available)')
                  : `${completedCount} / ${totalLessons} ${zh ? '已完成' : 'completed'}`}
              </span>
            </div>
            <div className={styles.cardBadge}>
              {zh ? '推薦新手' : 'Recommended for beginners'}
            </div>
          </button>

          {/* Free Play Card */}
          <button className={styles.card} onClick={onStartFreePlay}>
            <div className={styles.cardIcon}>🎮</div>
            <div className={styles.cardTitle}>
              {zh ? '自由模式' : 'Free Play'}
            </div>
            <div className={styles.cardDesc}>
              {zh
                ? '完整的經濟模擬體驗。4 種劇本、所有政策工具、AI 對手、百科全書。'
                : 'Full simulation experience. 4 scenarios, all policy tools, AI opponent, encyclopedia.'}
            </div>
            <div className={styles.cardFeatures}>
              <span className={styles.featureTag}>
                {zh ? '4 劇本' : '4 Scenarios'}
              </span>
              <span className={styles.featureTag}>
                {zh ? '所有工具' : 'All Tools'}
              </span>
              <span className={styles.featureTag}>
                {zh ? 'AI 對手' : 'AI Opponent'}
              </span>
            </div>
          </button>
        </div>

        {/* Lesson preview */}
        <div className={styles.lessonPreview}>
          <div className={styles.previewTitle}>
            {zh ? '📖 教學課程一覽' : '📖 Tutorial Lessons Overview'}
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
