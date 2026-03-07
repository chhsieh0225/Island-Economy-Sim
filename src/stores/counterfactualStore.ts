import { create } from 'zustand';
import { runCounterfactual, type CounterfactualRequest, type CounterfactualResult } from '../engine/modules/counterfactualModule';

/* ────────────────────────────────────────────────────────────────────────────
 * Counterfactual Store
 *
 * Holds the result of a "What If?" comparison and the loading state.
 * ──────────────────────────────────────────────────────────────────────────── */

interface CounterfactualState {
  result: CounterfactualResult | null;
  loading: boolean;
  policySummary: string | null;

  runComparison: (request: CounterfactualRequest, summary: string) => void;
  dismiss: () => void;
}

export const useCounterfactualStore = create<CounterfactualState>((set) => ({
  result: null,
  loading: false,
  policySummary: null,

  runComparison: (request: CounterfactualRequest, summary: string) => {
    set({ loading: true, policySummary: summary, result: null });
    // Run synchronously — typically < 50ms for 100 agents * 5 turns
    try {
      const result = runCounterfactual(request);
      set({ result, loading: false });
    } catch {
      set({ loading: false, result: null });
    }
  },

  dismiss: () => set({ result: null, loading: false, policySummary: null }),
}));
