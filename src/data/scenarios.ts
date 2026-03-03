import type { ScenarioDef, ScenarioId } from '../types';

export const DEFAULT_SCENARIO: ScenarioId = 'baseline';

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'baseline',
    name: '基準小島 Baseline',
    description: '平衡開局，適合觀察政策與市場互動。',
    initialTreasury: 0,
    openingNarrative: {
      title: '歡迎來到小島 Welcome to the Island',
      paragraphs: [
        '你被任命為這座百人小島的新市長。島上有食物、商品、服務三大產業，居民們各司其職，靠著市場交易維持生計。',
        '市場價格由供需自動決定，你的任務是透過稅率、補貼、福利等政策工具，引導經濟發展，讓居民過上好日子。',
      ],
      challenge: '目標：讓島嶼繁榮 50 年，達成 GDP 或國庫勝利條件，或盡可能維持高分。',
    },
  },
  {
    id: 'inflation',
    name: '通膨危機 Inflation',
    description: '物價偏高、國庫吃緊，先穩定民生再談成長。',
    initialTreasury: 120,
    initialTaxRate: 0.08,
    priceMultiplier: { food: 1.6, goods: 1.5, services: 1.4 },
    openingNarrative: {
      title: '通膨危機 Inflation Crisis',
      paragraphs: [
        '小島正經歷嚴重的物價上漲。食物價格飆升 60%，商品和服務也跟著水漲船高。',
        '居民的購買力大幅下降，不滿情緒正在蔓延。你必須在抑制通膨和維持經濟活力之間找到平衡。',
      ],
      challenge: '挑戰：在不引發經濟衰退的前提下，將物價恢復到合理水平。',
    },
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
    openingNarrative: {
      title: '不平等陷阱 Inequality Trap',
      paragraphs: [
        '小島上的財富分配嚴重失衡。頂層 18% 的居民擁有其他人 3 倍以上的財富，底層居民掙扎求存。',
        '不平等不只是數字 — 它影響社會流動性、消費力、甚至居民的健康和幸福感。',
      ],
      challenge: '挑戰：在不摧毀經濟成長的前提下，降低 Gini 係數至 0.35 以下。',
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
    openingNarrative: {
      title: '高齡化社會 Aging Society',
      paragraphs: [
        '小島面臨嚴峻的人口老化問題。平均年齡偏高，勞動人口比例下降，社會福利負擔加重。',
        '年輕人太少，老年人的醫療和照護需求卻不斷增加。你必須想辦法維持經濟運轉。',
      ],
      challenge: '挑戰：在勞動力不足的條件下，維持人口穩定和經濟成長。',
    },
  },
];

const SCENARIO_MAP = new Map<ScenarioId, ScenarioDef>(
  SCENARIOS.map(s => [s.id, s]),
);

export function getScenarioById(id: ScenarioId): ScenarioDef {
  return SCENARIO_MAP.get(id) ?? SCENARIO_MAP.get(DEFAULT_SCENARIO)!;
}
