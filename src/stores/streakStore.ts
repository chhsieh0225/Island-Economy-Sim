import { create } from 'zustand';
import type { TurnDeltas } from './turnDiffStore';

/* ────────────────────────────────────────────────────────────────────────────
 * Streak Store
 *
 * Tracks consecutive positive or negative turns. A positive turn is one where
 * GDP >= 0, population >= 0, and satisfaction >= -0.5.  A negative turn is one
 * where GDP < 0, population <= 0, and satisfaction < -0.5. Mixed turns reset.
 * ──────────────────────────────────────────────────────────────────────────── */

export type StreakType = 'positive' | 'negative' | null;

interface StreakState {
  type: StreakType;
  count: number;
  bestPositiveStreak: number;
  /** Record current turn deltas and update streak */
  recordTurnDeltas: (deltas: TurnDeltas) => void;
  /** Clear streak state (on reset / new run) */
  clear: () => void;
}

function classifyTurn(d: TurnDeltas): StreakType {
  const isPositive = d.gdp >= 0 && d.population >= 0 && d.avgSatisfaction >= -0.5;
  const isNegative = d.gdp < 0 && d.population <= 0 && d.avgSatisfaction < -0.5;
  if (isPositive) return 'positive';
  if (isNegative) return 'negative';
  return null;
}

export const useStreakStore = create<StreakState>((set, get) => ({
  type: null,
  count: 0,
  bestPositiveStreak: 0,

  recordTurnDeltas: (deltas: TurnDeltas) => {
    const turnType = classifyTurn(deltas);
    const { type: prevType, count: prevCount, bestPositiveStreak } = get();

    if (turnType === null) {
      set({ type: null, count: 0 });
      return;
    }

    if (turnType === prevType) {
      const newCount = prevCount + 1;
      const newBest = turnType === 'positive'
        ? Math.max(bestPositiveStreak, newCount)
        : bestPositiveStreak;
      set({ count: newCount, bestPositiveStreak: newBest });
    } else {
      const newBest = turnType === 'positive'
        ? Math.max(bestPositiveStreak, 1)
        : bestPositiveStreak;
      set({ type: turnType, count: 1, bestPositiveStreak: newBest });
    }
  },

  clear: () => set({ type: null, count: 0, bestPositiveStreak: 0 }),
}));
