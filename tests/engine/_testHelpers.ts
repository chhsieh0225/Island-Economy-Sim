/**
 * Shared test factories for engine unit tests.
 * NOT a test file — shared fixture helpers only.
 */

import type { AgentContext, GoalWeights } from '../../src/engine/agent/agentContext';
import type { TurnSnapshot } from '../../src/types';
import {
  DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  getEconomicCalibrationProfile,
} from '../../src/engine/economicCalibration';

const defaultCalibration = getEconomicCalibrationProfile(DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID);

const BALANCED_WEIGHTS: GoalWeights = {
  survival: 0.31,
  wealth: 0.31,
  happiness: 0.24,
  stability: 0.14,
};

/**
 * Build a default AgentContext suitable for strategy function tests.
 * Override any field to create targeted test scenarios.
 */
export function makeAgentContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sector: 'food',
    money: 100,
    savings: 0,
    inventory: { food: 2, goods: 1, services: 1 },
    health: 100,
    satisfaction: 100,
    effectiveProductivity: 1.0,
    productivity: 1.0,
    alive: true,
    lowIncomeTurns: 0,
    turnsInSector: 8,
    age: 300, // 25 years old
    ageGroup: 'adult',
    goalType: 'balanced',
    intelligence: 100,
    totalSwitches: 0,
    switchHistory: ['food'],
    desperation: 0,
    luckFactor: 1,
    incomeThisTurn: 0,
    spentThisTurn: 0,
    intelligenceDecisionFactor: 0.5,
    decisionNoiseAmplitude: 0.1,
    goalWeights: { ...BALANCED_WEIGHTS },
    calibration: defaultCalibration,
    ...overrides,
  };
}

/**
 * Build a default TurnSnapshot for scoring/statistics tests.
 * Mirrors the factory in corePhases.test.ts.
 */
export function makeSnapshot(overrides?: Partial<TurnSnapshot>): TurnSnapshot {
  const base: TurnSnapshot = {
    turn: 1,
    population: 100,
    gdp: 5000,
    giniCoefficient: 0.3,
    avgSatisfaction: 70,
    avgHealth: 80,
    jobDistribution: { food: 34, goods: 33, services: 33 },
    market: {
      prices: { food: 10, goods: 15, services: 12 },
      priceHistory: { food: [10], goods: [15], services: [12] },
      supply: { food: 100, goods: 80, services: 70 },
      demand: { food: 95, goods: 78, services: 68 },
      volume: { food: 80, goods: 60, services: 55 },
    },
    government: {
      treasury: 1000,
      taxRate: 0.1,
      subsidies: { food: 0, goods: 0, services: 0 },
      welfareEnabled: false,
      publicWorksActive: false,
      policyRate: 0.018,
      liquiditySupportActive: false,
    },
    births: 0,
    deaths: 0,
    avgAge: 33,
    workingAgePopulation: 78,
    laborForce: 70,
    employed: 66,
    unemployed: 4,
    employmentRate: 94.3,
    unemploymentRate: 5.7,
    laborParticipationRate: 89.7,
    crudeBirthRate: 12.0,
    fertilityRate: 1.45,
    laborProductivity: 75.76,
    dependencyRatio: 0.38,
    causalReplay: {
      satisfaction: {
        net: 0,
        unit: 'point',
        drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
      },
      health: {
        net: 0,
        unit: 'point',
        drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
      },
      departures: {
        net: 0,
        unit: 'count',
        drivers: [{ id: 'flat', label: '本回合無人口流出', value: 0 }],
      },
      policy: {
        taxCollected: 0,
        welfarePaid: 0,
        welfareRecipients: 0,
        publicWorksCost: 0,
        liquidityInjected: 0,
        policyRate: 0.018,
        perCapitaCashDelta: 0,
        treasuryDelta: 0,
      },
    },
  };
  return { ...base, ...overrides };
}
