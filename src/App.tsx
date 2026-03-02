import { useState } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { Dashboard } from './components/Dashboard/Dashboard';
import { MarketPanel } from './components/MarketPanel/MarketPanel';
import { JobsPanel } from './components/JobsPanel/JobsPanel';
import { PolicyPanel } from './components/PolicyPanel/PolicyPanel';
import { EventLog } from './components/EventLog/EventLog';
import { AgentInspector } from './components/AgentInspector/AgentInspector';
import { ControlBar } from './components/ControlBar/ControlBar';
import { IslandMap } from './components/IslandMap/IslandMap';
import { AgentRoster } from './components/AgentRoster/AgentRoster';
import { GameOver } from './components/GameOver/GameOver';
import { DecisionPanel } from './components/DecisionPanel/DecisionPanel';
import { SimulationLab } from './components/SimulationLab/SimulationLab';
import { MilestonePanel } from './components/MilestonePanel/MilestonePanel';
import { TerrainPanel } from './components/TerrainPanel/TerrainPanel';
import type { AgentState } from './types';
import styles from './App.module.css';

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
    reset,
    startNewRun,
    startAutoPlay,
    stopAutoPlay,
    endGame,
  } = useGameEngine();

  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [rightTab, setRightTab] = useState<'market' | 'terrain' | 'events' | 'milestones'>('terrain');

  const handleAgentClick = (agent: AgentState) => {
    setSelectedAgent(agent);
  };

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
              onStartRun={startNewRun}
            />

            <PolicyPanel
              turn={gameState.turn}
              government={gameState.government}
              market={gameState.market}
              statistics={gameState.statistics}
              activeRandomEvents={gameState.activeRandomEvents}
              pendingPolicies={gameState.pendingPolicies}
              policyTimeline={gameState.policyTimeline}
              onSetTaxRate={setTaxRate}
              onSetSubsidy={setSubsidy}
              onSetWelfare={setWelfare}
              onSetPublicWorks={setPublicWorks}
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
          </div>
        </div>
      </div>

      {selectedAgent && (
        <AgentInspector
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {gameState.gameOver && (
        <GameOver
          gameOver={gameState.gameOver}
          onRestart={reset}
        />
      )}

      {gameState.pendingDecision && (
        <DecisionPanel
          decision={gameState.pendingDecision}
          onChoose={chooseDecision}
        />
      )}
    </div>
  );
}

export default App;
