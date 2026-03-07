import { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { useGameStore } from './stores/gameStore';
import { useUiStore } from './stores/uiStore';
import { useNotificationStore } from './stores/notificationStore';
import { useTutorialStore } from './stores/tutorialStore';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { Dashboard } from './components/Dashboard/Dashboard';
import { JobsPanel } from './components/JobsPanel/JobsPanel';
import { PolicyPanel } from './components/PolicyPanel/PolicyPanel';
import { ControlBar } from './components/ControlBar/ControlBar';
import { IslandMap } from './components/IslandMap/IslandMap';
import { AgentRoster } from './components/AgentRoster/AgentRoster';
import { SimulationLab } from './components/SimulationLab/SimulationLab';
import { NarrativeModal } from './components/NarrativeModal/NarrativeModal';
import { Toast } from './components/Toast/Toast';
import { EconomyCalibrationPanel } from './components/EconomyCalibrationPanel/EconomyCalibrationPanel';
import { LearningJourneyPanel } from './components/LearningJourneyPanel/LearningJourneyPanel';
import { MapFeaturePanel } from './components/MapFeaturePanel/MapFeaturePanel';
import { SandboxPanel } from './components/SandboxPanel/SandboxPanel';
import { InfrastructurePanel } from './components/InfrastructurePanel/InfrastructurePanel';
import { CompetitionPanel } from './components/CompetitionPanel/CompetitionPanel';
import { StickyControlBar } from './components/StickyControlBar/StickyControlBar';
import { TutorialPanel } from './components/TutorialPanel/TutorialPanel';
import { TutorialModal } from './components/TutorialModal/TutorialModal';
import { TUTORIAL_LESSONS } from './data/tutorialLessons';
import { SCENARIOS } from './data/scenarios';
import { useI18n } from './i18n/useI18n';
import type { ScenarioId } from './types';
import styles from './App.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Lazy-loaded right-panel tabs & overlays
 * ──────────────────────────────────────────────────────────────────────────── */

const MarketPanel = lazy(async () => {
  const module = await import('./components/MarketPanel/MarketPanel');
  return { default: module.MarketPanel };
});

const TerrainPanel = lazy(async () => {
  const module = await import('./components/TerrainPanel/TerrainPanel');
  return { default: module.TerrainPanel };
});

const EventLog = lazy(async () => {
  const module = await import('./components/EventLog/EventLog');
  return { default: module.EventLog };
});

const MilestonePanel = lazy(async () => {
  const module = await import('./components/MilestonePanel/MilestonePanel');
  return { default: module.MilestonePanel };
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
 * GameView — the full game UI, loaded lazily from App.tsx
 *
 * Contains all game logic, store connections, and component rendering that
 * was previously in App.tsx. This is only loaded when the user leaves the
 * start screen (appMode !== 'start').
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
  const setSubsidy = useGameStore(s => s.setSubsidy);
  const setWelfare = useGameStore(s => s.setWelfare);
  const setPublicWorks = useGameStore(s => s.setPublicWorks);
  const setPolicyRate = useGameStore(s => s.setPolicyRate);
  const setLiquiditySupport = useGameStore(s => s.setLiquiditySupport);
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
  const rightTab = useUiStore(s => s.rightTab);
  const narrativeToShow = useUiStore(s => s.narrativeToShow);
  const selectAgent = useUiStore(s => s.selectAgent);
  const clearAgent = useUiStore(s => s.clearAgent);
  const selectMapFeature = useUiStore(s => s.selectMapFeature);
  const clearMapFeature = useUiStore(s => s.clearMapFeature);
  const setRightTab = useUiStore(s => s.setRightTab);
  const dismissNarrative = useUiStore(s => s.dismissNarrative);
  const resetSelections = useUiStore(s => s.resetSelections);

  // Notification store
  const toastQueue = useNotificationStore(s => s.toastQueue);
  const dismissToast = useNotificationStore(s => s.dismissToast);
  const tutorialToastsEnabled = useNotificationStore(s => s.tutorialToastsEnabled);
  const setTutorialToasts = useNotificationStore(s => s.setTutorialToasts);

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

  const [sandboxEnabled, setSandboxEnabled] = useState(false);

  // ─── Tutorial initialization on mount ──────────────────────────────────
  // When GameView loads for the first time in tutorial mode, start the run
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

  // ─── IntersectionObserver: track whether inline ControlBar is visible ──
  const inlineControlBarRef = useRef<HTMLDivElement>(null);
  const [inlineBarVisible, setInlineBarVisible] = useState(true);
  useEffect(() => {
    const el = inlineControlBarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInlineBarVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [appMode]);

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
  const scrollToAnchor = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleJumpToPolicy = useCallback(() => {
    scrollToAnchor('policy-panel-anchor');
  }, [scrollToAnchor]);

  const handleJumpToRoster = useCallback(() => {
    scrollToAnchor('agent-roster-anchor');
  }, [scrollToAnchor]);

  const handleJumpToMarket = useCallback(() => {
    setRightTab('market');
    window.setTimeout(() => {
      scrollToAnchor('market-panel-anchor');
    }, 90);
  }, [scrollToAnchor, setRightTab]);

  const handleStartNewRun = useCallback((seed: number, scenarioId: ScenarioId) => {
    startNewRun(seed, scenarioId);
    resetSelections();
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
    setAppMode('start');
  }, [stopAutoPlay, setAppMode]);

  // ─── Get tutorial state for rendering ────────────────────────────────
  const isTutorial = appMode === 'tutorial' && tutorialActive;
  const currentLesson = isTutorial ? TUTORIAL_LESSONS[currentLessonIndex] : null;
  const enabledControls = isTutorial ? getEnabledControls() : undefined;

  // ─── Main Game UI ────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerTitle}>
            {isTutorial
              ? (locale === 'zh-TW' ? '📚 教學模式' : '📚 Tutorial Mode')
              : t('app.title')}
          </div>
          <div className={styles.headerSub}>
            {isTutorial
              ? (locale === 'zh-TW' ? 'Island Economy Simulator — Tutorial' : '')
              : (locale === 'zh-TW' ? 'Island Economy Simulator' : '')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={styles.localeToggle}
            onClick={handleBackToMenu}
            title={locale === 'zh-TW' ? '回主選單' : 'Back to Menu'}
          >
            ☰
          </button>
          <button
            className={styles.localeToggle}
            onClick={() => setLocale(locale === 'zh-TW' ? 'en' : 'zh-TW')}
            title={t('locale.toggle')}
          >
            {locale === 'zh-TW' ? 'EN' : '中'}
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <div id="dashboard-anchor">
          <Dashboard state={gameState} />
        </div>

        <div ref={inlineControlBarRef}>
          <ControlBar
            autoPlaySpeed={autoPlaySpeed}
            isGameOver={isTutorial ? false : gameState.gameOver !== null}
            hasPendingDecision={isTutorial ? false : gameState.pendingDecision !== null}
            onAdvanceTurn={advanceTurn}
            onStartAutoPlay={startAutoPlay}
            onStopAutoPlay={stopAutoPlay}
            onReset={reset}
            onEndGame={endGame}
          />
        </div>

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

        <MapFeaturePanel
          feature={selectedMapFeature}
          state={gameState}
          onClose={clearMapFeature}
          onJumpToPolicy={handleJumpToPolicy}
          onJumpToMarket={handleJumpToMarket}
          onJumpToRoster={handleJumpToRoster}
        />

        <div className={styles.columns}>
          <div className={styles.leftColumn}>
            {/* ─── Tutorial Mode: show TutorialPanel + restricted PolicyPanel ── */}
            {isTutorial && (
              <>
                <TutorialPanel
                  state={gameState}
                  locale={locale}
                  onExitTutorial={handleExitTutorial}
                />

                {currentLesson && currentLesson.enabledControls.size > 0 && (
                  <div id="policy-panel-anchor">
                    <PolicyPanel
                      turn={gameState.turn}
                      government={gameState.government}
                      statistics={gameState.statistics}
                      activeRandomEvents={gameState.activeRandomEvents}
                      pendingPolicies={gameState.pendingPolicies}
                      policyTimeline={gameState.policyTimeline}
                      onSetTaxRate={setTaxRate}
                      onSetSubsidy={setSubsidy}
                      onSetWelfare={setWelfare}
                      onSetPublicWorks={setPublicWorks}
                      onSetPolicyRate={setPolicyRate}
                      onSetLiquiditySupport={setLiquiditySupport}
                      enabledSections={enabledControls}
                    />
                  </div>
                )}
              </>
            )}

            {/* ─── Free Play Mode: show all panels ────────────────────────── */}
            {!isTutorial && (
              <>
                <SimulationLab
                  scenarioId={gameState.scenarioId}
                  seed={gameState.seed}
                  runHistory={runHistory}
                  onStartRun={handleStartNewRun}
                />

                <EconomyCalibrationPanel
                  mode={economicCalibrationMode}
                  onChangeMode={setEconomicMode}
                />

                <LearningJourneyPanel
                  state={gameState}
                  tutorialToastsEnabled={tutorialToastsEnabled}
                  onSetTutorialToasts={setTutorialToasts}
                />

                <SandboxPanel
                  enabled={sandboxEnabled}
                  onToggle={setSandboxEnabled}
                />

                <div id="policy-panel-anchor">
                  <PolicyPanel
                    turn={gameState.turn}
                    government={gameState.government}
                    statistics={gameState.statistics}
                    activeRandomEvents={gameState.activeRandomEvents}
                    pendingPolicies={gameState.pendingPolicies}
                    policyTimeline={gameState.policyTimeline}
                    onSetTaxRate={setTaxRate}
                    onSetSubsidy={setSubsidy}
                    onSetWelfare={setWelfare}
                    onSetPublicWorks={setPublicWorks}
                    onSetPolicyRate={setPolicyRate}
                    onSetLiquiditySupport={setLiquiditySupport}
                  />
                </div>

                <InfrastructurePanel
                  treasury={gameState.government.treasury}
                  infrastructure={gameState.infrastructure}
                />

                <CompetitionPanel state={gameState} />

                <div id="agent-roster-anchor">
                  <AgentRoster
                    agents={gameState.agents}
                    onAgentClick={selectAgent}
                  />
                </div>

                <JobsPanel state={gameState} />
              </>
            )}
          </div>

          <div className={styles.rightColumn}>
            <div className={styles.rightTabs} role="tablist">
              <button
                role="tab"
                aria-selected={rightTab === 'market'}
                className={`${styles.rightTabBtn} ${rightTab === 'market' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('market')}
              >
                {t('tabs.market')}
              </button>
              {!isTutorial && (
                <button
                  role="tab"
                  aria-selected={rightTab === 'terrain'}
                  className={`${styles.rightTabBtn} ${rightTab === 'terrain' ? styles.rightTabBtnActive : ''}`}
                  onClick={() => setRightTab('terrain')}
                >
                  {t('tabs.terrain')}
                </button>
              )}
              {!isTutorial && (
                <button
                  role="tab"
                  aria-selected={rightTab === 'events'}
                  className={`${styles.rightTabBtn} ${rightTab === 'events' ? styles.rightTabBtnActive : ''}`}
                  onClick={() => setRightTab('events')}
                >
                  {t('tabs.events')}
                </button>
              )}
              {!isTutorial && (
                <button
                  role="tab"
                  aria-selected={rightTab === 'milestones'}
                  className={`${styles.rightTabBtn} ${rightTab === 'milestones' ? styles.rightTabBtnActive : ''}`}
                  onClick={() => setRightTab('milestones')}
                >
                  {t('tabs.milestones')}
                </button>
              )}
              <button
                role="tab"
                aria-selected={rightTab === 'encyclopedia'}
                className={`${styles.rightTabBtn} ${rightTab === 'encyclopedia' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('encyclopedia')}
              >
                {t('tabs.encyclopedia')}
              </button>
            </div>

            <ErrorBoundary fallbackLabel="右側面板發生錯誤">
              <Suspense fallback={<div className={styles.panelFallback}>載入中...</div>}>
                {rightTab === 'market' && (
                  <div id="market-panel-anchor">
                    <MarketPanel market={gameState.market} terrain={gameState.terrain} />
                  </div>
                )}
                {rightTab === 'terrain' && !isTutorial && (
                  <TerrainPanel terrain={gameState.terrain} />
                )}
                {rightTab === 'events' && !isTutorial && (
                  <EventLog
                    events={gameState.events}
                    activeRandomEvents={gameState.activeRandomEvents}
                  />
                )}
                {rightTab === 'milestones' && !isTutorial && (
                  <MilestonePanel
                    milestones={gameState.milestones}
                    agents={gameState.agents}
                    onAgentClick={selectAgent}
                  />
                )}
                {rightTab === 'encyclopedia' && (
                  <EncyclopediaPanel />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>

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
        inlineControlBarVisible={inlineBarVisible}
      />

      {selectedAgent && (
        <ErrorBoundary fallbackLabel="居民面板發生錯誤">
          <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
            <AgentInspector
              agent={selectedAgent}
              onClose={clearAgent}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {gameState.gameOver && !isTutorial && (
        <ErrorBoundary fallbackLabel="結算面板發生錯誤">
          <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
            <GameOver
              gameOver={gameState.gameOver}
              onRestart={reset}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {gameState.pendingDecision && !isTutorial && (
        <ErrorBoundary fallbackLabel="決策面板發生錯誤">
          <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
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
        {`回合 ${gameState.turn} | 人口 ${gameState.agents.filter(a => a.alive).length}`}
      </div>
    </div>
  );
}
