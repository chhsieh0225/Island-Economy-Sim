import type { ScenarioDef, ScenarioId } from '../types';

export const DEFAULT_SCENARIO: ScenarioId = 'baseline';

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'baseline',
    name: '基準小島 Baseline',
    description: '平衡開局，適合觀察政策與市場互動。',
    initialTreasury: 0,
  },
  {
    id: 'inflation',
    name: '通膨危機 Inflation',
    description: '物價偏高、國庫吃緊，先穩定民生再談成長。',
    initialTreasury: 120,
    initialTaxRate: 0.08,
    priceMultiplier: { food: 1.6, goods: 1.5, services: 1.4 },
  },
  {
    id: 'inequality',
    name: '不平等陷阱 Inequality',
    description: '少數富裕、多數拮据，考驗再分配策略。',
    initialTreasury: 260,
    wealthSkew: {
      topPercent: 0.18,
      topMultiplier: 3.2,
      bottomMultiplier: 0.65,
    },
  },
  {
    id: 'aging',
    name: '高齡化社會 Aging',
    description: '起始人口年齡偏高，健康與勞動供給更脆弱。',
    initialTreasury: 200,
    initialTaxRate: 0.12,
    enableWelfare: true,
    ageShiftTurns: 180,
  },
];

const SCENARIO_MAP = new Map<ScenarioId, ScenarioDef>(
  SCENARIOS.map(s => [s.id, s]),
);

export function getScenarioById(id: ScenarioId): ScenarioDef {
  return SCENARIO_MAP.get(id) ?? SCENARIO_MAP.get(DEFAULT_SCENARIO)!;
}
