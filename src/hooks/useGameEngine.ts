import { useRef, useState, useCallback, useEffect } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { computeScore } from '../engine/Scoring';
import { clearTileCache } from '../components/IslandMap/islandRenderer';
import type {
  GameState,
  SectorType,
  ScenarioId,
  RunSummary,
  GameOverReason,
  MilestoneRecord,
  ToastNotification,
} from '../types';
import { CONFIG } from '../config';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';
import type { EconomicCalibrationProfileId } from '../engine/economicCalibration';
import { buildLearningJourney } from '../learning/journey';

export type AutoPlaySpeed = 'slow' | 'medium' | 'fast' | null;

function buildRunSummary(
  state: GameState,
  id: number,
  reason: GameOverReason | 'reset',
): RunSummary | null {
  if (state.turn <= 0 || state.statistics.length === 0) return null;

  const latest = state.statistics[state.statistics.length - 1];
  const totals = state.statistics.reduce(
    (acc, s) => ({
      births: acc.births + s.births,
      deaths: acc.deaths + s.deaths,
    }),
    { births: 0, deaths: 0 },
  );

  return {
    id,
    timestamp: new Date().toISOString(),
    scenarioId: state.scenarioId,
    scenarioName: getScenarioById(state.scenarioId).name,
    seed: state.seed,
    turns: state.turn,
    reason,
    finalPopulation: latest.population,
    totalBirths: totals.births,
    totalDeaths: totals.deaths,
    finalGdp: latest.gdp,
    finalGini: latest.giniCoefficient,
    score: computeScore(state.statistics).totalScore,
  };
}

export function useGameEngine() {
  const [engine] = useState(() => new GameEngine(Date.now(), DEFAULT_SCENARIO));
  const [gameState, setGameState] = useState<GameState>(() => engine.getState());
  const [autoPlaySpeed, setAutoPlaySpeed] = useState<AutoPlaySpeed>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [toastQueue, setToastQueue] = useState<ToastNotification[]>([]);
  const [tutorialToastsEnabled, setTutorialToastsEnabled] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem('econ_sim_tutorial_toasts_enabled');
      if (raw === 'false') return false;
    } catch {
      // ignore localStorage read failures
    }
    return true;
  });
  const [economicCalibrationMode, setEconomicCalibrationModeState] = useState<EconomicCalibrationProfileId>(
    () => engine.getEconomicCalibrationProfileId(),
  );
  const initialLearning = buildLearningJourney(engine.getState());
  const intervalRef = useRef<number | null>(null);
  const runIdRef = useRef(1);
  const toastIdRef = useRef(0);
  const completedQuestIdsRef = useRef<Set<string>>(
    new Set(initialLearning.quests.filter(quest => quest.done).map(quest => quest.id)),
  );
  const unlockedNodeIdsRef = useRef<Set<string>>(
    new Set(initialLearning.knowledgeNodes.filter(node => node.unlocked).map(node => node.id)),
  );

  const pushLearningToasts = useCallback((state: GameState) => {
    const learning = buildLearningJourney(state);
    const nextCompleted = new Set(learning.quests.filter(quest => quest.done).map(quest => quest.id));
    const nextUnlocked = new Set(learning.knowledgeNodes.filter(node => node.unlocked).map(node => node.id));
    const toasts: ToastNotification[] = [];

    for (const quest of learning.quests) {
      if (!quest.done || completedQuestIdsRef.current.has(quest.id)) continue;
      toasts.push({
        id: `toast-${toastIdRef.current++}`,
        type: 'celebration',
        title: `新手任務完成：${quest.title}`,
        message: quest.objective,
        createdAt: Date.now(),
        duration: 5200,
      });
    }

    for (const node of learning.knowledgeNodes) {
      if (!node.unlocked || unlockedNodeIdsRef.current.has(node.id)) continue;
      toasts.push({
        id: `toast-${toastIdRef.current++}`,
        type: 'info',
        title: `知識解鎖：${node.title}`,
        message: `${node.chain} · ${node.concept}`,
        createdAt: Date.now(),
        duration: 5200,
      });
    }

    completedQuestIdsRef.current = nextCompleted;
    unlockedNodeIdsRef.current = nextUnlocked;

    if (tutorialToastsEnabled && toasts.length > 0) {
      setToastQueue(prev => [...prev, ...toasts.slice(0, 3)].slice(-8));
    }
  }, [completedQuestIdsRef, unlockedNodeIdsRef, toastIdRef, tutorialToastsEnabled]);

  const syncState = useCallback(() => {
    setGameState(prev => {
      const state = engine.getState(prev);
      pushLearningToasts(state);
      return state;
    });
  }, [engine, pushLearningToasts]);

  const stopAutoPlayInternal = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoPlaySpeed(null);
  }, []);

  const pushRunSnapshot = useCallback((reason: GameOverReason | 'reset') => {
    const summary = buildRunSummary(engine.getState(), runIdRef.current++, reason);
    if (!summary) return;
    setRunHistory(prev => [summary, ...prev].slice(0, 12));
  }, [engine]);

  const pushToasts = useCallback((newMilestones: MilestoneRecord[]) => {
    if (newMilestones.length === 0) return;
    const now = Date.now();
    const toasts: ToastNotification[] = newMilestones.map(m => ({
      id: `toast-${toastIdRef.current++}`,
      type: 'milestone' as const,
      title: m.title,
      message: m.description,
      createdAt: now,
      duration: 4000,
    }));
    setToastQueue(prev => [...prev, ...toasts].slice(-6));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToastQueue(prev => prev.filter(t => t.id !== id));
  }, []);

  const advanceTurn = useCallback(() => {
    engine.advanceTurn();
    pushToasts(engine.newMilestones);
    syncState();
    if (engine.gameOver || engine.pendingDecision) {
      stopAutoPlayInternal();
    }
  }, [engine, syncState, stopAutoPlayInternal, pushToasts]);

  const setTaxRate = useCallback((rate: number) => {
    engine.setTaxRate(rate);
    syncState();
  }, [engine, syncState]);

  const setSubsidy = useCallback((sector: SectorType, amount: number) => {
    engine.setSubsidy(sector, amount);
    syncState();
  }, [engine, syncState]);

  const setWelfare = useCallback((enabled: boolean) => {
    engine.setWelfare(enabled);
    syncState();
  }, [engine, syncState]);

  const setPublicWorks = useCallback((active: boolean) => {
    engine.setPublicWorks(active);
    syncState();
  }, [engine, syncState]);

  const setPolicyRate = useCallback((rate: number) => {
    engine.setPolicyRate(rate);
    syncState();
  }, [engine, syncState]);

  const setLiquiditySupport = useCallback((active: boolean) => {
    engine.setLiquiditySupport(active);
    syncState();
  }, [engine, syncState]);

  const chooseDecision = useCallback((choiceId: string) => {
    const resolved = engine.resolveDecision(choiceId);
    if (resolved) {
      syncState();
    }
  }, [engine, syncState]);

  const startNewRun = useCallback((seed: number, scenarioId: ScenarioId) => {
    stopAutoPlayInternal();

    const existing = engine.getState();
    if (existing.turn > 0) {
      pushRunSnapshot(existing.gameOver?.reason ?? 'reset');
    }

    engine.reset(seed, scenarioId);
    clearTileCache();
    syncState();
  }, [engine, pushRunSnapshot, stopAutoPlayInternal, syncState]);

  const reset = useCallback(() => {
    const state = engine.getState();
    startNewRun(state.seed, state.scenarioId);
  }, [engine, startNewRun]);

  const startAutoPlay = useCallback((speed: 'slow' | 'medium' | 'fast') => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setAutoPlaySpeed(speed);
    const ms = CONFIG.AUTO_PLAY_SPEEDS[speed];
    intervalRef.current = window.setInterval(() => {
      engine.advanceTurn();
      pushToasts(engine.newMilestones);
      syncState();
      if (engine.gameOver || engine.pendingDecision) {
        stopAutoPlayInternal();
      }
    }, ms);
  }, [engine, syncState, stopAutoPlayInternal, pushToasts]);

  const stopAutoPlay = useCallback(() => {
    stopAutoPlayInternal();
  }, [stopAutoPlayInternal]);

  const endGame = useCallback(() => {
    stopAutoPlayInternal();
    engine.endGame();
    syncState();
  }, [engine, syncState, stopAutoPlayInternal]);

  const setEconomicMode = useCallback((mode: EconomicCalibrationProfileId) => {
    engine.setEconomicCalibrationProfile(mode);
    setEconomicCalibrationModeState(mode);
  }, [engine]);

  const setTutorialToasts = useCallback((enabled: boolean) => {
    setTutorialToastsEnabled(enabled);
    try {
      window.localStorage.setItem('econ_sim_tutorial_toasts_enabled', enabled ? 'true' : 'false');
    } catch {
      // ignore localStorage write failures
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
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
  };
}
