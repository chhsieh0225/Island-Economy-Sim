import { lazy, Suspense, useCallback } from 'react';
import { useUiStore } from './stores/uiStore';
import { useTutorialStore } from './stores/tutorialStore';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { StartScreen } from './components/StartScreen/StartScreen';
import { useI18n } from './i18n/useI18n';
import styles from './App.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Lazy-load the entire game view — only fetched when user leaves start screen.
 * This keeps the initial bundle small (start screen + lightweight stores only).
 * ──────────────────────────────────────────────────────────────────────────── */
const GameView = lazy(() => import('./GameView'));

function App() {
  const appMode = useUiStore(s => s.appMode);
  const setAppMode = useUiStore(s => s.setAppMode);
  const completedLessons = useTutorialStore(s => s.completedLessons);
  const startTutorial = useTutorialStore(s => s.startTutorial);
  const { locale, t } = useI18n();

  const handleStartFreePlay = useCallback(() => {
    setAppMode('freeplay');
  }, [setAppMode]);

  const handleStartTutorial = useCallback(() => {
    startTutorial();
    setAppMode('tutorial');
    // Game initialization (startNewRun) is handled by GameView on mount
  }, [setAppMode, startTutorial]);

  // ─── Start Screen ────────────────────────────────────────────────────
  if (appMode === 'start') {
    return (
      <StartScreen
        locale={locale}
        completedLessons={completedLessons}
        onStartFreePlay={handleStartFreePlay}
        onStartTutorial={handleStartTutorial}
      />
    );
  }

  // ─── Game View (lazy-loaded) ─────────────────────────────────────────
  return (
    <ErrorBoundary fallbackLabel={t('error.appCrash')}>
      <Suspense
        fallback={
          <div className={styles.loadingScreen}>
            <div className={styles.loadingIsland}>🏝️</div>
            <div className={styles.loadingText}>{t('loading.game')}</div>
          </div>
        }
      >
        <GameView />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
