import { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { useGameStore } from './stores/gameStore';
import { useUiStore } from './stores/uiStore';
import { useNotificationStore } from './stores/notificationStore';
import { useTutorialStore } from './stores/tutorialStore';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { IslandMap } from './components/IslandMap/IslandMap';
import { HudOverlay } from './components/HudOverlay/HudOverlay';
import { DrawerNav, type DrawerType } from './components/DrawerNav/DrawerNav';
import { DrawerPanel } from './components/DrawerPanel/DrawerPanel';
import { SettingsDrawer } from './components/SettingsDrawer/SettingsDrawer';
import { EventsDrawer } from './components/EventsDrawer/EventsDrawer';
import { Dashboard } from './components/Dashboard/Dashboard';
import { PolicyPanel } from './components/PolicyPanel/PolicyPanel';
import { MapFeaturePanel } from './components/MapFeaturePanel/MapFeaturePanel';
import { StickyControlBar } from './components/StickyControlBar/StickyControlBar';
import { NarrativeModal } from './components/NarrativeModal/NarrativeModal';
import { Toast } from './components/Toast/Toast';
import { TutorialPanel } from './components/TutorialPanel/TutorialPanel';
import { TutorialModal } from './components/TutorialModal/TutorialModal';
import { TUTORIAL_LESSONS } from './data/tutorialLessons';
import { SCENARIOS } from './data/scenarios';
import { useI18n } from './i18n/useI18n';
import type { ScenarioId } from './types';
import styles from './App.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Lazy-loaded panels & overlays
 * ──────────────────────────────────────────────────────────────────────────── */

const MarketPanel = lazy(async () => {
  const module = await import('./components/MarketPanel/MarketPanel');
  return { default: module.MarketPanel };
});

const AgentInspector = lazy(async () => {
  const module = await import('./components/AgentInspector/AgentInspector');
  return { default: module.AgentInspector };
});

const GameOver = lazy(async () => {
  const module = await import('./components/GameOver/GameOver');
  return { default: module.GameOver };
});

const DecisionPanel = lazy(async () => {
  const module = await import('./components/DecisionPanel/DecisionPanel');
  return { default: module.DecisionPanel };
});

const EncyclopediaPanel = lazy(async () => {
  const module = await import('./components/EncyclopediaPanel/EncyclopediaPanel');
  return { default: module.EncyclopediaPanel };
});

/* ────────────────────────────────────────────────────────────────────────────
 * GameView — full-viewport map-centered layout
 *
 * Island map fills the screen. HUD overlay shows 5 core stats.
 * Side drawers (stats, policy, market, events, encyclopedia, settings)
 * slide in from the right edge via icon buttons.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function GameView() {
  // App mode
  const appMode = useUiStore(s => s.appMode);
  const setAppMode = useUiStore(s => s.setAppMode);

  // Game store
  const gameState = useGameStore(s => s.gameState);
  const autoPlaySpeed = useGameStore(s => s.autoPlaySpeed);
  const runHistory = useGameStore(s => s.runHistory);
  const economicCalibrationMode = useGameStore(s => s.economicCalibrationMode);
  const advanceTurn = useGameStore(s => s.advanceTurn);
  const chooseDecision = useGameStore(s => s.chooseDecision);
  const setTaxRate = useGameStore(s => s.setTaxRate);
  const setTaxMode = useGameStore(s => s.setTaxMode);
  const setSubsidy = useGameStore(s => s.setSubsidy);
  const setWelfare = useGameStore(s => s.setWelfare);
  const setPublicWorks = useGameStore(s => s.setPublicWorks);
  const setPolicyRate = useGameStore(s => s.setPolicyRate);
  const setLiquiditySupport = useGameStore(s => s.setLiquiditySupport);
  const setStockpile = useGameStore(s => s.setStockpile);
  const reset = useGameStore(s => s.reset);
  const startNewRun = useGameStore(s => s.startNewRun);
  const startAutoPlay = useGameStore(s => s.startAutoPlay);
  const stopAutoPlay = useGameStore(s => s.stopAutoPlay);
  const endGame = useGameStore(s => s.endGame);
  const setEconomicMode = useGameStore(s => s.setEconomicMode);

  // UI store
  const selectedAgent = useUiStore(s => s.selectedAgent);
  const selectedMapFeature = useUiStore(s => s.selectedMapFeature);
  const featureHighlight = useUiStore(s => s.featureHighlight);
  const narrativeToShow = useUiStore(s => s.narrativeToShow);
  const selectAgent = useUiStore(s => s.selectAgent);
  const clearAgent = useUiStore(s => s.clearAgent);
  const selectMapFeature = useUiStore(s => s.selectMapFeature);
  const clearMapFeature = useUiStore(s => s.clearMapFeature);
  const dismissNarrative = useUiStore(s => s.dismissNarrative);
  const resetSelections = useUiStore(s => s.resetSelections);

  // Notification store
  const toastQueue = useNotificationStore(s => s.toastQueue);
  const dismissToast = useNotificationStore(s => s.dismissToast);

  // Tutorial store
  const tutorialActive = useTutorialStore(s => s.active);
  const tutorialPhase = useTutorialStore(s => s.phase);
  const currentLessonIndex = useTutorialStore(s => s.currentLessonIndex);
  const getEnabledControls = useTutorialStore(s => s.getEnabledControls);
  const dismissIntro = useTutorialStore(s => s.dismissIntro);
  const checkObjectives = useTutorialStore(s => s.checkObjectives);
  const nextLesson = useTutorialStore(s => s.nextLesson);
  const exitTutorial = useTutorialStore(s => s.exitTutorial);

  const { locale, setLocale, t } = useI18n();

  // ─── Drawer state ────────────────────────────────────────────────────
  const [activeDrawer, setActiveDrawer] = useState<DrawerType | null>(null);

  const handleToggleDrawer = useCallback((drawer: DrawerType) => {
    setActiveDrawer(prev => (prev === drawer ? null : drawer));
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  // ─── Tutorial initialization on mount ──────────────────────────────────
  const tutorialInitialised = useRef(false);
  useEffect(() => {
    if (appMode === 'tutorial' && tutorialActive && !tutorialInitialised.current) {
      tutorialInitialised.current = true;
      const lesson = TUTORIAL_LESSONS[useTutorialStore.getState().currentLessonIndex];
      if (lesson) {
        startNewRun(lesson.seed, lesson.useInflationPrices ? 'inflation' : 'baseline');
      }
    }
  }, [appMode, tutorialActive, startNewRun]);

  // ─── Tutorial objective checking ─────────────────────────────────────
  useEffect(() => {
    if (appMode === 'tutorial' && tutorialActive && tutorialPhase === 'playing') {
      checkObjectives(gameState);
    }
  }, [appMode, tutorialActive, tutorialPhase, gameState, checkObjectives]);

  // ─── Tutorial: auto-resolve pending decisions ─────────────────────────
  useEffect(() => {
    if (appMode === 'tutorial' && tutorialActive && gameState.pendingDecision) {
      const firstChoice = gameState.pendingDecision.choices[0];
      if (firstChoice) {
        chooseDecision(firstChoice.id);
      }
    }
  }, [appMode, tutorialActive, gameState.pendingDecision, chooseDecision]);

  // ─── Callbacks ───────────────────────────────────────────────────────
  const handleStartNewRun = useCallback((seed: number, scenarioId: ScenarioId) => {
    startNewRun(seed, scenarioId);
    resetSelections();
    setActiveDrawer(null);
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (scenario?.openingNarrative) {
      useUiStore.getState().showNarrative(scenario.openingNarrative);
    }
  }, [startNewRun, resetSelections]);

  const handleTutorialDismissIntro = useCallback(() => {
    dismissIntro();
  }, [dismissIntro]);

  const handleTutorialNextLesson = useCallback(() => {
    nextLesson();
    const store = useTutorialStore.getState();
    if (store.phase === 'finished') {
      exitTutorial();
      setAppMode('start');
      return;
    }
    const lesson = TUTORIAL_LESSONS[store.currentLessonIndex];
    if (lesson) {
      startNewRun(lesson.seed, lesson.useInflationPrices ? 'inflation' : 'baseline');
      resetSelections();
    }
  }, [nextLesson, exitTutorial, setAppMode, startNewRun, resetSelections]);

  const handleExitTutorial = useCallback(() => {
    exitTutorial();
    setAppMode('start');
  }, [exitTutorial, setAppMode]);

  const handleBackToMenu = useCallback(() => {
    stopAutoPlay();
    setActiveDrawer(null);
    setAppMode('start');
  }, [stopAutoPlay, setAppMode]);

  const handleJumpToPolicy = useCallback(() => {
    setActiveDrawer('policy');
  }, []);

  const handleJumpToMarket = useCallback(() => {
    setActiveDrawer('market');
  }, []);

  const handleJumpToRoster = useCallback(() => {
    setActiveDrawer('stats');
  }, []);

  // ─── Get tutorial state for rendering ────────────────────────────────
  const isTutorial = appMode === 'tutorial' && tutorialActive;
  const currentLesson = isTutorial ? TUTORIAL_LESSONS[currentLessonIndex] : null;
  const enabledControls = isTutorial ? getEnabledControls() : undefined;

  // ─── Drawer title lookup ─────────────────────────────────────────────
  function getDrawerTitle(drawer: DrawerType | null): string {
    if (!drawer) return '';
    return t(`drawer.${drawer}`);
  }

  // ─── Main Game UI ────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* Full-viewport island map */}
      <div className={styles.mapLayer}>
        <IslandMap
          agents={gameState.agents}
          turn={gameState.turn}
          terrain={gameState.terrain}
          economyStage={gameState.economyStage}
          activeRandomEvents={gameState.activeRandomEvents}
          autoPlaySpeed={autoPlaySpeed}
          onAgentClick={selectAgent}
          onFeatureClick={selectMapFeature}
          highlightFeature={featureHighlight?.feature ?? null}
          highlightUntilMs={featureHighlight?.untilMs ?? null}
        />
      </div>

      {/* HUD overlay — 5 core stats floating top-left */}
      <HudOverlay state={gameState} />

      {/* Drawer navigation — right edge icon buttons */}
      <DrawerNav activeDrawer={activeDrawer} onToggle={handleToggleDrawer} />

      {/* Slide-in drawer panel */}
      <DrawerPanel
        open={activeDrawer !== null}
        title={getDrawerTitle(activeDrawer)}
        onClose={handleCloseDrawer}
      >
        <ErrorBoundary fallbackLabel={t('common.error')}>
          <Suspense fallback={<div style={{ color: '#8892b0', fontSize: 12 }}>{t('common.loading')}</div>}>
            {activeDrawer === 'stats' && (
              <Dashboard state={gameState} />
            )}
            {activeDrawer === 'policy' && (
              <PolicyPanel
                turn={gameState.turn}
                government={gameState.government}
                statistics={gameState.statistics}
                activeRandomEvents={gameState.activeRandomEvents}
                pendingPolicies={gameState.pendingPolicies}
                policyTimeline={gameState.policyTimeline}
                onSetTaxRate={setTaxRate}
                onSetTaxMode={setTaxMode}
                onSetSubsidy={setSubsidy}
                onSetWelfare={setWelfare}
                onSetPublicWorks={setPublicWorks}
                onSetPolicyRate={setPolicyRate}
                onSetLiquiditySupport={setLiquiditySupport}
                onSetStockpile={setStockpile}
                enabledSections={isTutorial ? enabledControls : undefined}
              />
            )}
            {activeDrawer === 'market' && (
              <MarketPanel market={gameState.market} terrain={gameState.terrain} />
            )}
            {activeDrawer === 'events' && (
              <EventsDrawer
                events={gameState.events}
                activeRandomEvents={gameState.activeRandomEvents}
                milestones={gameState.milestones}
                agents={gameState.agents}
                onAgentClick={selectAgent}
              />
            )}
            {activeDrawer === 'encyclopedia' && (
              <EncyclopediaPanel />
            )}
            {activeDrawer === 'settings' && (
              <SettingsDrawer
                locale={locale}
                onSetLocale={setLocale}
                scenarioId={gameState.scenarioId}
                seed={gameState.seed}
                runHistory={runHistory}
                onStartRun={handleStartNewRun}
                economicCalibrationMode={economicCalibrationMode}
                onChangeCalibrationMode={setEconomicMode}
                onBackToMenu={handleBackToMenu}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </DrawerPanel>

      {/* Map feature overlay (triggered by clicking map zones) */}
      <MapFeaturePanel
        feature={selectedMapFeature}
        state={gameState}
        onClose={clearMapFeature}
        onJumpToPolicy={handleJumpToPolicy}
        onJumpToMarket={handleJumpToMarket}
        onJumpToRoster={handleJumpToRoster}
      />

      {/* Tutorial overlay */}
      {isTutorial && (
        <TutorialPanel
          state={gameState}
          locale={locale}
          onExitTutorial={handleExitTutorial}
        />
      )}

      {/* Bottom control bar — always visible */}
      <StickyControlBar
        gameState={gameState}
        autoPlaySpeed={autoPlaySpeed}
        isGameOver={isTutorial ? false : gameState.gameOver !== null}
        hasPendingDecision={isTutorial ? false : gameState.pendingDecision !== null}
        onAdvanceTurn={advanceTurn}
        onStartAutoPlay={startAutoPlay}
        onStopAutoPlay={stopAutoPlay}
        onReset={reset}
        onEndGame={endGame}
        inlineControlBarVisible={false}
      />

      {/* ─── Overlays ─── */}
      {selectedAgent && (
        <ErrorBoundary fallbackLabel={t('common.error')}>
          <Suspense fallback={<div className={styles.overlayFallback}>{t('common.loading')}</div>}>
            <AgentInspector
              agent={selectedAgent}
              onClose={clearAgent}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {gameState.gameOver && !isTutorial && (
        <ErrorBoundary fallbackLabel={t('common.error')}>
          <Suspense fallback={<div className={styles.overlayFallback}>{t('common.loading')}</div>}>
            <GameOver
              gameOver={gameState.gameOver}
              onRestart={reset}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {gameState.pendingDecision && !isTutorial && (
        <ErrorBoundary fallbackLabel={t('common.error')}>
          <Suspense fallback={<div className={styles.overlayFallback}>{t('common.loading')}</div>}>
            <DecisionPanel
              decision={gameState.pendingDecision}
              onChoose={chooseDecision}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {narrativeToShow && !isTutorial && (
        <NarrativeModal
          narrative={narrativeToShow}
          onDismiss={dismissNarrative}
        />
      )}

      {/* Tutorial modal overlays */}
      {isTutorial && currentLesson && (tutorialPhase === 'intro' || tutorialPhase === 'completed' || tutorialPhase === 'finished') && (
        <TutorialModal
          lesson={currentLesson}
          phase={tutorialPhase}
          locale={locale}
          onDismissIntro={handleTutorialDismissIntro}
          onNextLesson={handleTutorialNextLesson}
          onExitTutorial={handleExitTutorial}
        />
      )}

      <Toast toasts={toastQueue} onDismiss={dismissToast} />

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {t('aria.turnStatus')
          .replace('{turn}', String(gameState.turn))
          .replace('{pop}', String(gameState.agents.filter(a => a.alive).length))}
      </div>
    </div>
  );
}
