import { lazy, Suspense, useState, useCallback } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
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
import { SCENARIOS } from './data/scenarios';
import type { AgentState, ScenarioId, ScenarioNarrative } from './types';
import styles from './App.module.css';

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

function App() {
  const {
    gameState,
    autoPlaySpeed,
    runHistory,
    advanceTurn,
    chooseDecision,
    setTaxRate,
    setSubsidy,
    setWelfare,
    setPublicWorks,
    setPolicyRate,
    setLiquiditySupport,
    reset,
    startNewRun,
    startAutoPlay,
    stopAutoPlay,
    endGame,
    economicCalibrationMode,
    setEconomicMode,
    tutorialToastsEnabled,
    setTutorialToasts,
    toastQueue,
    dismissToast,
  } = useGameEngine();

  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [rightTab, setRightTab] = useState<'market' | 'terrain' | 'events' | 'milestones'>('terrain');
  const [narrativeToShow, setNarrativeToShow] = useState<ScenarioNarrative | null>(null);

  const handleAgentClick = (agent: AgentState) => {
    setSelectedAgent(agent);
  };

  const handleStartNewRun = useCallback((seed: number, scenarioId: ScenarioId) => {
    startNewRun(seed, scenarioId);
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (scenario?.openingNarrative) {
      setNarrativeToShow(scenario.openingNarrative);
    }
  }, [startNewRun]);

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerTitle}>小島經濟模擬器</div>
          <div className={styles.headerSub}>Island Economy Simulator</div>
        </div>
      </div>

      <div className={styles.content}>
        <Dashboard state={gameState} />

        <ControlBar
          autoPlaySpeed={autoPlaySpeed}
          isGameOver={gameState.gameOver !== null}
          hasPendingDecision={gameState.pendingDecision !== null}
          onAdvanceTurn={advanceTurn}
          onStartAutoPlay={startAutoPlay}
          onStopAutoPlay={stopAutoPlay}
          onReset={reset}
          onEndGame={endGame}
        />

        <IslandMap
          agents={gameState.agents}
          turn={gameState.turn}
          terrain={gameState.terrain}
          economyStage={gameState.economyStage}
          activeRandomEvents={gameState.activeRandomEvents}
          autoPlaySpeed={autoPlaySpeed}
          onAgentClick={handleAgentClick}
        />

        <div className={styles.columns}>
          <div className={styles.leftColumn}>
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

            <AgentRoster
              agents={gameState.agents}
              onAgentClick={handleAgentClick}
            />

            <JobsPanel state={gameState} />
          </div>

          <div className={styles.rightColumn}>
            <div className={styles.rightTabs}>
              <button
                className={`${styles.rightTabBtn} ${rightTab === 'market' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('market')}
              >
                市場
              </button>
              <button
                className={`${styles.rightTabBtn} ${rightTab === 'terrain' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('terrain')}
              >
                地貌
              </button>
              <button
                className={`${styles.rightTabBtn} ${rightTab === 'events' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('events')}
              >
                事件
              </button>
              <button
                className={`${styles.rightTabBtn} ${rightTab === 'milestones' ? styles.rightTabBtnActive : ''}`}
                onClick={() => setRightTab('milestones')}
              >
                里程碑
              </button>
            </div>

            <Suspense fallback={<div className={styles.panelFallback}>載入中...</div>}>
              {rightTab === 'market' && (
                <MarketPanel market={gameState.market} terrain={gameState.terrain} />
              )}
              {rightTab === 'terrain' && (
                <TerrainPanel terrain={gameState.terrain} />
              )}
              {rightTab === 'events' && (
                <EventLog
                  events={gameState.events}
                  activeRandomEvents={gameState.activeRandomEvents}
                />
              )}
              {rightTab === 'milestones' && (
                <MilestonePanel
                  milestones={gameState.milestones}
                  agents={gameState.agents}
                  onAgentClick={handleAgentClick}
                />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      {selectedAgent && (
        <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
          <AgentInspector
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        </Suspense>
      )}

      {gameState.gameOver && (
        <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
          <GameOver
            gameOver={gameState.gameOver}
            onRestart={reset}
          />
        </Suspense>
      )}

      {gameState.pendingDecision && (
        <Suspense fallback={<div className={styles.overlayFallback}>載入中...</div>}>
          <DecisionPanel
            decision={gameState.pendingDecision}
            onChoose={chooseDecision}
          />
        </Suspense>
      )}

      {narrativeToShow && (
        <NarrativeModal
          narrative={narrativeToShow}
          onDismiss={() => setNarrativeToShow(null)}
        />
      )}

      <Toast toasts={toastQueue} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
