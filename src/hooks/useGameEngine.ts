import { useRef, useState, useCallback, useEffect } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { computeScore } from '../engine/Scoring';
import type {
  GameState,
  SectorType,
  ScenarioId,
  RunSummary,
  GameOverReason,
} from '../types';
import { CONFIG } from '../config';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';

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
  const intervalRef = useRef<number | null>(null);
  const runIdRef = useRef(1);

  const syncState = useCallback(() => {
    setGameState(engine.getState());
  }, [engine]);

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

  const advanceTurn = useCallback(() => {
    engine.advanceTurn();
    syncState();
    if (engine.gameOver || engine.pendingDecision) {
      stopAutoPlayInternal();
    }
  }, [engine, syncState, stopAutoPlayInternal]);

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
      syncState();
      if (engine.gameOver || engine.pendingDecision) {
        stopAutoPlayInternal();
      }
    }, ms);
  }, [engine, syncState, stopAutoPlayInternal]);

  const stopAutoPlay = useCallback(() => {
    stopAutoPlayInternal();
  }, [stopAutoPlayInternal]);

  const endGame = useCallback(() => {
    stopAutoPlayInternal();
    engine.endGame();
    syncState();
  }, [engine, syncState, stopAutoPlayInternal]);

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
    reset,
    startNewRun,
    startAutoPlay,
    stopAutoPlay,
    endGame,
  };
}
