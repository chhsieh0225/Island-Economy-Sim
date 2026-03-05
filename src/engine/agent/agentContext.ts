import type { AgeGroup, AgentGoalType, SectorType } from '../../types';
import type { EconomicCalibrationProfile } from '../economicCalibration';

/** Read-only snapshot of agent state needed by strategy functions. */
export interface AgentContext {
  sector: SectorType;
  money: number;
  savings: number;
  inventory: Record<SectorType, number>;
  health: number;
  satisfaction: number;
  effectiveProductivity: number;
  productivity: number;
  alive: boolean;
  lowIncomeTurns: number;
  turnsInSector: number;
  age: number;
  ageGroup: AgeGroup;
  goalType: AgentGoalType;
  intelligence: number;
  totalSwitches: number;
  switchHistory: SectorType[];
  desperation: number;
  luckFactor: number;
  incomeThisTurn: number;
  spentThisTurn: number;
  intelligenceDecisionFactor: number;
  decisionNoiseAmplitude: number;
  goalWeights: GoalWeights;
  calibration: EconomicCalibrationProfile;
}

export interface GoalWeights {
  survival: number;
  wealth: number;
  happiness: number;
  stability: number;
}
