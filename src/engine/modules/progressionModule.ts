import { CONFIG } from '../../config';
import type { Agent } from '../Agent';
import type { EconomyStage, SectorType } from '../../types';

export interface StageProgressionInput {
  turn: number;
  economyStage: EconomyStage;
  stageTransitionFrom: EconomyStage | null;
  stageTransitionStartTurn: number | null;
  agents: Agent[];
  foodDemand: number;
  foodSupply: number;
}

export interface StageProgressionResult {
  economyStage: EconomyStage;
  stageTransitionFrom: EconomyStage | null;
  stageTransitionStartTurn: number | null;
  message?: string;
}

export function getUnlockedSectorsForStage(stage: EconomyStage): SectorType[] {
  switch (stage) {
    case 'agriculture':
      return ['food'];
    case 'industrial':
      return ['food', 'goods'];
    case 'service':
      return ['food', 'goods', 'services'];
  }
}

export function getStageNeedMultipliers({
  turn,
  economyStage,
  stageTransitionFrom,
  stageTransitionStartTurn,
}: {
  turn: number;
  economyStage: EconomyStage;
  stageTransitionFrom: EconomyStage | null;
  stageTransitionStartTurn: number | null;
}): {
  multipliers: Record<SectorType, number>;
  stageTransitionFrom: EconomyStage | null;
  stageTransitionStartTurn: number | null;
} {
  const target = CONFIG.STAGE_NEED_MULTIPLIERS[economyStage];
  if (!stageTransitionFrom || stageTransitionStartTurn === null || stageTransitionFrom === economyStage) {
    return {
      multipliers: { ...target },
      stageTransitionFrom,
      stageTransitionStartTurn,
    };
  }

  if (economyStage === 'agriculture') {
    return {
      multipliers: { ...target },
      stageTransitionFrom,
      stageTransitionStartTurn,
    };
  }

  const rampTurns = CONFIG.STAGE_TRANSITION_RAMP_TURNS[economyStage];
  if (rampTurns <= 0) {
    return {
      multipliers: { ...target },
      stageTransitionFrom,
      stageTransitionStartTurn,
    };
  }

  const elapsedTurns = Math.max(0, turn - stageTransitionStartTurn);
  const progress = Math.min(1, elapsedTurns / rampTurns);
  if (progress >= 1) {
    return {
      multipliers: { ...target },
      stageTransitionFrom: null,
      stageTransitionStartTurn: null,
    };
  }

  const source = CONFIG.STAGE_NEED_MULTIPLIERS[stageTransitionFrom];
  return {
    multipliers: {
      food: source.food + (target.food - source.food) * progress,
      goods: source.goods + (target.goods - source.goods) * progress,
      services: source.services + (target.services - source.services) * progress,
    },
    stageTransitionFrom,
    stageTransitionStartTurn,
  };
}

function startNeedRamp(
  from: EconomyStage,
  to: EconomyStage,
  turn: number,
): { stageTransitionFrom: EconomyStage | null; stageTransitionStartTurn: number | null } {
  if (from === to || to === 'agriculture') {
    return {
      stageTransitionFrom: from,
      stageTransitionStartTurn: null,
    };
  }
  return {
    stageTransitionFrom: from,
    stageTransitionStartTurn: turn + 1,
  };
}

export function evaluateEconomyStageProgression({
  turn,
  economyStage,
  stageTransitionFrom,
  stageTransitionStartTurn,
  agents,
  foodDemand,
  foodSupply,
}: StageProgressionInput): StageProgressionResult {
  if (!CONFIG.PROGRESSIVE_ECONOMY_ENABLED) {
    return { economyStage, stageTransitionFrom, stageTransitionStartTurn };
  }

  if (economyStage === 'agriculture') {
    const marketFoodCoverage = foodDemand > 0.01 ? foodSupply / foodDemand : 1;
    const avgFoodStock = agents.reduce((sum, agent) => sum + agent.inventory.food, 0) / Math.max(1, agents.length);
    const stockFoodCoverage = avgFoodStock / Math.max(0.01, CONFIG.CONSUMPTION.food);
    const foodCoverage = Math.max(marketFoodCoverage, stockFoodCoverage);

    if (turn >= CONFIG.STAGE_INDUSTRIAL_MIN_TURN && foodCoverage >= CONFIG.STAGE_INDUSTRIAL_MIN_FOOD_COVERAGE) {
      const ramp = startNeedRamp(economyStage, 'industrial', turn);
      return {
        economyStage: 'industrial',
        stageTransitionFrom: ramp.stageTransitionFrom,
        stageTransitionStartTurn: ramp.stageTransitionStartTurn,
        message: `產業升級：島嶼進入工業化階段（糧食覆蓋 ${foodCoverage.toFixed(2)}），商品業開始成形。`,
      };
    }
    return { economyStage, stageTransitionFrom, stageTransitionStartTurn };
  }

  if (economyStage === 'industrial') {
    const adultWorkers = agents.filter(a => a.age >= CONFIG.WORKING_AGE);
    const goodsWorkers = adultWorkers.filter(a => a.sector === 'goods').length;
    const goodsShare = goodsWorkers / Math.max(1, adultWorkers.length);
    const avgSat = agents.reduce((sum, a) => sum + a.satisfaction, 0) / Math.max(1, agents.length);

    if (
      turn >= CONFIG.STAGE_SERVICE_MIN_TURN &&
      goodsShare >= CONFIG.STAGE_SERVICE_MIN_GOODS_WORKER_SHARE &&
      avgSat >= CONFIG.STAGE_SERVICE_MIN_AVG_SATISFACTION
    ) {
      const ramp = startNeedRamp(economyStage, 'service', turn);
      return {
        economyStage: 'service',
        stageTransitionFrom: ramp.stageTransitionFrom,
        stageTransitionStartTurn: ramp.stageTransitionStartTurn,
        message: '產業升級：島嶼進入服務化階段，服務業全面展開。',
      };
    }
  }

  return { economyStage, stageTransitionFrom, stageTransitionStartTurn };
}
