import type { ScenarioId } from '../../types';
import type { EconomicCalibrationProfileId } from '../economicCalibration';

const SAVE_KEY = 'econ_sim_save';
const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  seed: number;
  scenarioId: ScenarioId;
  turns: number;
  calibrationProfileId: EconomicCalibrationProfileId;
  /** Policy actions applied at each turn (turn → action list) */
  policyLog: PolicyLogEntry[];
  timestamp: string;
}

export interface PolicyLogEntry {
  turn: number;
  action: PolicyAction;
}

export type PolicyAction =
  | { type: 'taxRate'; value: number }
  | { type: 'taxMode'; mode: 'flat' | 'progressive' }
  | { type: 'subsidy'; sector: string; value: number }
  | { type: 'welfare'; enabled: boolean }
  | { type: 'publicWorks'; active: boolean }
  | { type: 'policyRate'; value: number }
  | { type: 'liquiditySupport'; active: boolean }
  | { type: 'stockpile'; enabled: boolean }
  | { type: 'decision'; choiceId: string };

export function hasSave(): boolean {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(data: SaveData): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

function isValidSaveData(data: unknown): data is SaveData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.version === SAVE_VERSION &&
    typeof d.seed === 'number' &&
    typeof d.scenarioId === 'string' &&
    typeof d.turns === 'number' &&
    typeof d.calibrationProfileId === 'string' &&
    Array.isArray(d.policyLog) &&
    typeof d.timestamp === 'string'
  );
}

export function loadGame(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSaveData(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
