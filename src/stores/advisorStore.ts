import { create } from 'zustand';
import type { AdvisorSuggestion } from '../engine/modules/advisorModule';

interface AdvisorState {
  suggestions: AdvisorSuggestion[];
  dismissedCategories: Set<string>;
  collapsed: boolean;
  setSuggestions: (s: AdvisorSuggestion[]) => void;
  dismiss: (category: string) => void;
  resetDismissals: () => void;
  toggleCollapsed: () => void;
}

export const useAdvisorStore = create<AdvisorState>((set, get) => ({
  suggestions: [],
  dismissedCategories: new Set<string>(),
  collapsed: false,

  setSuggestions: (suggestions) => {
    const dismissed = get().dismissedCategories;
    const filtered = suggestions.filter(s => !dismissed.has(s.category));
    set({ suggestions: filtered });
  },

  dismiss: (category) => {
    set(state => {
      const next = new Set(state.dismissedCategories);
      next.add(category);
      return {
        dismissedCategories: next,
        suggestions: state.suggestions.filter(s => s.category !== category),
      };
    });
  },

  resetDismissals: () => {
    set({ dismissedCategories: new Set<string>() });
  },

  toggleCollapsed: () => {
    set(state => ({ collapsed: !state.collapsed }));
  },
}));
