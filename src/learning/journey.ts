import type { GameState } from '../types';

export interface LearningQuest {
  id: string;
  title: string;
  objective: string;
  why: string;
  action: string;
  progress: number;
  progressLabel: string;
  done: boolean;
}

export interface LearningKnowledgeNode {
  id: string;
  title: string;
  chain: string;
  concept: string;
  gameSignal: string;
  worldLink: string;
  nextPrompt: string;
  unlocked: boolean;
}

export interface LearningJourneyState {
  quests: LearningQuest[];
  knowledgeNodes: LearningKnowledgeNode[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function latestOrNull(state: GameState) {
  if (state.statistics.length === 0) return null;
  return state.statistics[state.statistics.length - 1];
}

export function buildLearningJourney(state: GameState): LearningJourneyState {
  const latest = latestOrNull(state);
  const prev = state.statistics.length > 1 ? state.statistics[state.statistics.length - 2] : null;

  const foodDemand = latest?.market.demand.food ?? state.market.demand.food;
  const foodSupply = latest?.market.supply.food ?? state.market.supply.food;
  const foodCoverage = foodDemand > 0.01 ? foodSupply / foodDemand : 1;
  const avgSat = latest?.avgSatisfaction ?? 100;
  const gini = latest?.giniCoefficient ?? 0;
  const dependency = latest?.dependencyRatio ?? 0;
  const avgAge = latest?.avgAge ?? 0;
  const taxRate = state.government.taxRate;
  const treasury = state.government.treasury;

  const maxPriceSwing = (() => {
    if (!latest || !prev) return 0;
    const sectors = ['food', 'goods', 'services'] as const;
    let maxSwing = 0;
    for (const sector of sectors) {
      const oldPrice = prev.market.prices[sector];
      const newPrice = latest.market.prices[sector];
      if (oldPrice <= 0.01) continue;
      const swing = Math.abs((newPrice - oldPrice) / oldPrice);
      maxSwing = Math.max(maxSwing, swing);
    }
    return maxSwing;
  })();

  const hasPolicyRequested = state.pendingPolicies.length > 0 || state.policyTimeline.length > 0;
  const hasPolicyApplied = state.policyTimeline.some(item => item.status === 'applied');
  const hasRandomShock = state.activeRandomEvents.some(
    event => event.def.id === 'drought' || event.def.id === 'flood' || event.def.id === 'inflation_spike',
  );

  const q1Progress = clamp01(state.turn / 3);
  const q2Progress = clamp01(foodCoverage / 1);
  const q3Progress = hasPolicyRequested ? (hasPolicyApplied ? 1 : 0.65) : 0;
  const q4Progress = clamp01(avgSat / 60);
  const q5Progress = state.economyStage === 'agriculture'
    ? 0
    : state.economyStage === 'industrial'
      ? 0.6
      : 1;
  const q6Progress = latest ? clamp01(Math.abs(latest.causalReplay.satisfaction.net) / 3) : 0;

  const quests: LearningQuest[] = [
    {
      id: 'turn_3',
      title: '先跑 3 回合，觀察儀表板',
      objective: '目標：完成 3 回合模擬',
      why: '先建立「每回合都會發生供需、價格、政策反饋」的節奏感。',
      action: '點「下一回合」或開啟自動慢速，先不改政策。',
      progress: q1Progress,
      progressLabel: `${Math.min(3, state.turn)}/3`,
      done: state.turn >= 3,
    },
    {
      id: 'food_balance',
      title: '把食物供需拉回平衡',
      objective: '目標：食物覆蓋率 >= 100%',
      why: '食物是生存需求，短缺會先打擊健康與滿意度，帶來離島風險。',
      action: '優先調整食物補貼，連續觀察 2-3 回合再做下一步。',
      progress: q2Progress,
      progressLabel: fmtPct(Math.min(1, foodCoverage)),
      done: foodCoverage >= 1,
    },
    {
      id: 'policy_lag',
      title: '體驗政策延遲',
      objective: '目標：至少下達 1 次政策並看到生效',
      why: '現實治理最關鍵是「政策有時滯」，不是按下去立刻改善。',
      action: '調一次稅率或補貼，觀察政策時間線待生效 → 已生效。',
      progress: q3Progress,
      progressLabel: hasPolicyApplied ? '已生效' : hasPolicyRequested ? '待生效' : '未下達',
      done: hasPolicyApplied,
    },
    {
      id: 'sentiment_60',
      title: '把平均滿意度拉回 60',
      objective: '目標：平均滿意度 >= 60',
      why: '民心是系統穩定器，低滿意度會放大人口與經濟波動。',
      action: '先保基本需求，再調整稅負與福利，避免一次大幅改動。',
      progress: q4Progress,
      progressLabel: `${avgSat.toFixed(1)}/60`,
      done: avgSat >= 60,
    },
    {
      id: 'stage_upgrade',
      title: '推進產業升級',
      objective: '目標：從農業進到工業/服務',
      why: '結構轉型是成長與韌性的核心，不能永遠只靠單一產業。',
      action: '先穩食物，再觀察商品與服務需求逐步成形。',
      progress: q5Progress,
      progressLabel: state.economyStage === 'agriculture' ? '農業' : state.economyStage === 'industrial' ? '工業' : '服務',
      done: state.economyStage !== 'agriculture',
    },
    {
      id: 'causal_reading',
      title: '讀懂一輪因果回放',
      objective: '目標：看懂「滿意度變化前 3 個驅動」',
      why: '經濟治理不是猜測，而是根據驅動因子做小步迭代。',
      action: '在因果回放看本回合主因，再對應調整下一步政策。',
      progress: q6Progress,
      progressLabel: latest ? `Sat Δ ${latest.causalReplay.satisfaction.net.toFixed(2)}` : '--',
      done: q6Progress >= 1 || state.turn >= 8,
    },
  ];

  const knowledgeNodes: LearningKnowledgeNode[] = [
    {
      id: 'market_signal',
      title: '市場訊號與均衡',
      chain: '微觀市場鏈',
      concept: '價格是訊號：短缺漲價、過剩降價，供需會往均衡移動。',
      gameSignal: `目前食物覆蓋率 ${fmtPct(Math.min(1.5, foodCoverage)).replace('%', '')}%`,
      worldLink: '對照真實世界：能源、糧食、運輸都是透過價格把稀缺傳遞出去。',
      nextPrompt: '觀察下一回合價格變化是否跟短缺方向一致。',
      unlocked: state.turn >= 2,
    },
    {
      id: 'policy_delay',
      title: '政策時滯與預期管理',
      chain: '政策治理鏈',
      concept: '政策通常有生效延遲，決策時要看 1-3 回合後的後果。',
      gameSignal: hasPolicyApplied ? '你已看到政策生效延遲。' : '尚未觸發政策生效案例。',
      worldLink: '對照真實世界：利率、補貼、財政都需時間才會傳導到實體經濟。',
      nextPrompt: '嘗試同時改兩項政策，觀察延遲疊加效果。',
      unlocked: hasPolicyRequested,
    },
    {
      id: 'inflation_shock',
      title: '通膨與供應衝擊',
      chain: '政策治理鏈',
      concept: '供給受損時，價格先反應，福利與實質購買力會被壓縮。',
      gameSignal: hasRandomShock || maxPriceSwing >= 0.08
        ? `最近價格波動 ${(maxPriceSwing * 100).toFixed(1)}%`
        : '目前價格波動尚小，等待事件或短缺觸發。',
      worldLink: '對照真實世界：天災、戰爭、物流中斷常帶來成本推升型通膨。',
      nextPrompt: '比較「補貼」與「降稅」在穩價上的副作用差異。',
      unlocked: hasRandomShock || maxPriceSwing >= 0.08 || state.turn >= 8,
    },
    {
      id: 'distribution_state',
      title: '分配、公平與社會穩定',
      chain: '分配財政鏈',
      concept: '不平等過高會削弱民心與留島率，公平與成長需要平衡。',
      gameSignal: `當前 Gini=${gini.toFixed(3)}，福利${state.government.welfareEnabled ? '已啟用' : '未啟用'}`,
      worldLink: '對照真實世界：稅收與轉移支付是調節分配的重要工具。',
      nextPrompt: '試著在不拉高 Gini 的情況下把 GDP 維持成長。',
      unlocked: gini >= 0.4 || state.government.welfareEnabled || state.turn >= 10,
    },
    {
      id: 'demography_labor',
      title: '人口結構與勞動供給',
      chain: '人口產業鏈',
      concept: '高扶養比會稀釋勞動供給，拉低就業與財政空間。',
      gameSignal: `平均年齡 ${avgAge.toFixed(1)} 歲，扶養比 ${dependency.toFixed(2)}`,
      worldLink: '對照真實世界：高齡化社會常面臨成長放緩與財政壓力。',
      nextPrompt: '觀察出生率、就業率、勞動生產率是否同步改善。',
      unlocked: avgAge >= 35 || dependency >= 0.45 || state.turn >= 12,
    },
    {
      id: 'structural_shift',
      title: '結構轉型與韌性',
      chain: '人口產業鏈',
      concept: '從農業到工業再到服務，能降低單一產業風險並提高抗衝擊能力。',
      gameSignal: `目前階段：${state.economyStage}`,
      worldLink: '對照真實世界：產業多元化通常帶來更穩定的中長期成長。',
      nextPrompt: '看三大產業佔比是否更平衡，並檢查滿意度是否同步改善。',
      unlocked: state.economyStage !== 'agriculture',
    },
    {
      id: 'macro_mix',
      title: '政策組合與總體平衡',
      chain: '總體協調鏈',
      concept: '稅率、補貼、福利、公共建設要成套搭配，避免單點過度拉扯。',
      gameSignal: `稅率 ${(taxRate * 100).toFixed(0)}%，國庫 $${treasury.toFixed(0)}，滿意度 ${avgSat.toFixed(1)}`,
      worldLink: '對照真實世界：可持續治理重點在「穩定預期」而不是短期衝高單一指標。',
      nextPrompt: '挑一個目標（成長/公平/穩定）並設計 5 回合政策路線圖。',
      unlocked: state.turn >= 18 && hasPolicyApplied && state.economyStage !== 'agriculture',
    },
  ];

  return { quests, knowledgeNodes };
}
