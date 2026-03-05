// ── Leaderboard ─────────────────────────────────────────────────────
// Persistent high scores stored in localStorage.

const STORAGE_KEY = 'econ_sim_leaderboard';
const MAX_ENTRIES = 20;

export interface LeaderboardEntry {
  id: string;
  timestamp: string;
  scenarioId: string;
  seed: number;
  turns: number;
  score: number;
  finalPopulation: number;
  finalGdp: number;
  finalGini: number;
  playerName: string;
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveToLeaderboard(entry: Omit<LeaderboardEntry, 'id' | 'timestamp'>): LeaderboardEntry {
  const full: LeaderboardEntry = {
    ...entry,
    id: `lb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  const existing = loadLeaderboard();
  existing.push(full);
  existing.sort((a, b) => b.score - a.score);
  const trimmed = existing.slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — silently fail
  }

  return full;
}

export function clearLeaderboard(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getPersonalBest(scenarioId: string): LeaderboardEntry | null {
  const entries = loadLeaderboard().filter(e => e.scenarioId === scenarioId);
  return entries.length > 0 ? entries[0] : null;
}
