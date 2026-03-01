import { useRef, useState, useCallback, useEffect } from 'react';
import { GameEngine } from '../engine/GameEngine';
import type { GameState, SectorType } from '../types';
import { CONFIG } from '../config';

export type AutoPlaySpeed = 'slow' | 'medium' | 'fast' | null;

export function useGameEngine() {
  const engineRef = useRef<GameEngine>(new GameEngine());
  const [gameState, setGameState] = useState<GameState>(() => engineRef.current.getState());
  const [autoPlaySpeed, setAutoPlaySpeed] = useState<AutoPlaySpeed>(null);
  const intervalRef = useRef<number | null>(null);

  const syncState = useCallback(() => {
    setGameState(engineRef.current.getState());
  }, []);

  const advanceTurn = useCallback(() => {
    engineRef.current.advanceTurn();
    syncState();
  }, [syncState]);

  const setTaxRate = useCallback((rate: number) => {
    engineRef.current.setTaxRate(rate);
    syncState();
  }, [syncState]);

  const setSubsidy = useCallback((sector: SectorType, amount: number) => {
    engineRef.current.setSubsidy(sector, amount);
    syncState();
  }, [syncState]);

  const setWelfare = useCallback((enabled: boolean) => {
    engineRef.current.setWelfare(enabled);
    syncState();
  }, [syncState]);

  const setPublicWorks = useCallback((active: boolean) => {
    engineRef.current.setPublicWorks(active);
    syncState();
  }, [syncState]);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoPlaySpeed(null);
    engineRef.current.reset();
    syncState();
  }, [syncState]);

  const startAutoPlay = useCallback((speed: 'slow' | 'medium' | 'fast') => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setAutoPlaySpeed(speed);
    const ms = CONFIG.AUTO_PLAY_SPEEDS[speed];
    intervalRef.current = window.setInterval(() => {
      engineRef.current.advanceTurn();
      syncState();
    }, ms);
  }, [syncState]);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoPlaySpeed(null);
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
    advanceTurn,
    setTaxRate,
    setSubsidy,
    setWelfare,
    setPublicWorks,
    reset,
    startAutoPlay,
    stopAutoPlay,
  };
}
