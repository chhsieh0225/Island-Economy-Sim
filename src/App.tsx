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
import type { AgentState } from './types';
import styles from './App.module.css';

function App() {
  const {
    gameState,
    autoPlaySpeed,
    advanceTurn,
    setTaxRate,
    setSubsidy,
    setWelfare,
    setPublicWorks,
    reset,
    startAutoPlay,
    stopAutoPlay,
  } = useGameEngine();

  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);

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
          onAdvanceTurn={advanceTurn}
          onStartAutoPlay={startAutoPlay}
          onStopAutoPlay={stopAutoPlay}
          onReset={reset}
        />

        <IslandMap
          agents={gameState.agents}
          turn={gameState.turn}
          activeRandomEvents={gameState.activeRandomEvents}
          onAgentClick={handleAgentClick}
        />

        <div className={styles.columns}>
          <div className={styles.leftColumn}>
            <PolicyPanel
              government={gameState.government}
              onSetTaxRate={setTaxRate}
              onSetSubsidy={setSubsidy}
              onSetWelfare={setWelfare}
              onSetPublicWorks={setPublicWorks}
            />

            <JobsPanel state={gameState} />
          </div>

          <div className={styles.rightColumn}>
            <MarketPanel market={gameState.market} />
            <EventLog
              events={gameState.events}
              activeRandomEvents={gameState.activeRandomEvents}
            />
          </div>
        </div>
      </div>

      {selectedAgent && (
        <AgentInspector
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

export default App;
