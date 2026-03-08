import type { GameState } from '../types';

export interface LearningQuest {
  id: string;
  title: string;
  titleEn: string;
  objective: string;
  objectiveEn: string;
  why: string;
  whyEn: string;
  action: string;
  actionEn: string;
  progress: number;
  progressLabel: string;
  progressLabelEn: string;
  done: boolean;
}

export interface LearningKnowledgeNode {
  id: string;
  title: string;
  titleEn: string;
  chain: string;
  chainEn: string;
  concept: string;
  conceptEn: string;
  gameSignal: string;
  gameSignalEn: string;
  worldLink: string;
  worldLinkEn: string;
  nextPrompt: string;
  nextPromptEn: string;
  unlocked: boolean;
}

export interface LearningCoachAction {
  id: string;
  title: string;
  titleEn: string;
  rationale: string;
  rationaleEn: string;
  steps: string[];
  stepsEn: string[];
  expectedSignal: string;
  expectedSignalEn: string;
}

export interface LearningCoachBrief {
  phaseLabel: string;
  phaseLabelEn: string;
  phaseGoal: string;
  phaseGoalEn: string;
  diagnosis: string;
  diagnosisEn: string;
  turnNarrative: string[];
  turnNarrativeEn: string[];
  actions: LearningCoachAction[];
  watchlist: string[];
  watchlistEn: string[];
  pitfall: string;
  pitfallEn: string;
  economicsLink: string;
  economicsLinkEn: string;
  keywords: string[];
  keywordsEn: string[];
}

export interface LearningJourneyState {
  coach: LearningCoachBrief;
  quests: LearningQuest[];
  knowledgeNodes: LearningKnowledgeNode[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function signed(value: number, digits: number = 1): string {
  const text = value.toFixed(digits);
  return value >= 0 ? `+${text}` : text;
}

function latestOrNull(state: GameState) {
  if (state.statistics.length === 0) return null;
  return state.statistics[state.statistics.length - 1];
}

function topDriverLabel(metric: { drivers: Array<{ label: string; value: number }> }): string {
  if (metric.drivers.length === 0) return '無顯著變化';
  const top = [...metric.drivers]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  return top?.label ?? '無顯著變化';
}

function topDriverLabelEn(metric: { drivers: Array<{ labelEn?: string; label: string; value: number }> }): string {
  if (metric.drivers.length === 0) return 'No significant change';
  const top = [...metric.drivers]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  return top?.labelEn ?? top?.label ?? 'No significant change';
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

  const turnNarrative = latest
    ? [
      `滿意度 ${signed(latest.causalReplay.satisfaction.net, 2)}，主因：${topDriverLabel(latest.causalReplay.satisfaction)}。`,
      `健康 ${signed(latest.causalReplay.health.net, 2)}，主因：${topDriverLabel(latest.causalReplay.health)}。`,
      `人口流出 ${latest.causalReplay.departures.net > 0 ? `+${latest.causalReplay.departures.net}` : latest.causalReplay.departures.net}，主因：${topDriverLabel(latest.causalReplay.departures)}。`,
    ]
    : [
      '尚未累積足夠回合，先跑 1-3 回合建立觀察基線。',
    ];

  const turnNarrativeEn = latest
    ? [
      `Satisfaction ${signed(latest.causalReplay.satisfaction.net, 2)}, main driver: ${topDriverLabelEn(latest.causalReplay.satisfaction)}.`,
      `Health ${signed(latest.causalReplay.health.net, 2)}, main driver: ${topDriverLabelEn(latest.causalReplay.health)}.`,
      `Departures ${latest.causalReplay.departures.net > 0 ? `+${latest.causalReplay.departures.net}` : latest.causalReplay.departures.net}, main driver: ${topDriverLabelEn(latest.causalReplay.departures)}.`,
    ]
    : [
      'Not enough turns yet. Run 1\u20133 turns to establish an observation baseline.',
    ];

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
      titleEn: 'Run 3 turns, observe the dashboard',
      objective: '目標：完成 3 回合模擬',
      objectiveEn: 'Goal: Complete 3 simulation turns',
      why: '先建立「每回合都會發生供需、價格、政策反饋」的節奏感。',
      whyEn: 'Build a sense of rhythm: supply, demand, prices, and policy feedback happen every turn.',
      action: '點「下一回合」或開啟自動慢速，先不改政策。',
      actionEn: 'Click "Next Turn" or enable slow auto-play. Don\'t change any policies yet.',
      progress: q1Progress,
      progressLabel: `${Math.min(3, state.turn)}/3`,
      progressLabelEn: `${Math.min(3, state.turn)}/3`,
      done: state.turn >= 3,
    },
    {
      id: 'food_balance',
      title: '把食物供需拉回平衡',
      titleEn: 'Balance food supply and demand',
      objective: '目標：食物覆蓋率 >= 100%',
      objectiveEn: 'Goal: Food coverage >= 100%',
      why: '食物是生存需求，短缺會先打擊健康與滿意度，帶來離島風險。',
      whyEn: 'Food is a survival need. Shortages hit health and satisfaction first, risking population loss.',
      action: '優先調整食物補貼，連續觀察 2-3 回合再做下一步。',
      actionEn: 'Prioritize adjusting food subsidies. Observe for 2\u20133 turns before next steps.',
      progress: q2Progress,
      progressLabel: fmtPct(Math.min(1, foodCoverage)),
      progressLabelEn: fmtPct(Math.min(1, foodCoverage)),
      done: foodCoverage >= 1,
    },
    {
      id: 'policy_lag',
      title: '體驗政策延遲',
      titleEn: 'Experience policy delay',
      objective: '目標：至少下達 1 次政策並看到生效',
      objectiveEn: 'Goal: Issue at least 1 policy and see it take effect',
      why: '現實治理最關鍵是「政策有時滯」，不是按下去立刻改善。',
      whyEn: 'The most critical lesson in real governance: policies have lag\u2014they don\'t take effect immediately.',
      action: '調一次稅率或補貼，觀察政策時間線待生效 → 已生效。',
      actionEn: 'Adjust tax rate or subsidies once, then watch the policy timeline: Pending \u2192 Applied.',
      progress: q3Progress,
      progressLabel: hasPolicyApplied ? '已生效' : hasPolicyRequested ? '待生效' : '未下達',
      progressLabelEn: hasPolicyApplied ? 'Applied' : hasPolicyRequested ? 'Pending' : 'Not set',
      done: hasPolicyApplied,
    },
    {
      id: 'sentiment_60',
      title: '把平均滿意度拉回 60',
      titleEn: 'Raise average satisfaction to 60',
      objective: '目標：平均滿意度 >= 60',
      objectiveEn: 'Goal: Average satisfaction >= 60',
      why: '民心是系統穩定器，低滿意度會放大人口與經濟波動。',
      whyEn: 'Public morale stabilizes the system. Low satisfaction amplifies population and economic volatility.',
      action: '先保基本需求，再調整稅負與福利，避免一次大幅改動。',
      actionEn: 'Secure basic needs first, then fine-tune taxes and welfare. Avoid drastic changes all at once.',
      progress: q4Progress,
      progressLabel: `${avgSat.toFixed(1)}/60`,
      progressLabelEn: `${avgSat.toFixed(1)}/60`,
      done: avgSat >= 60,
    },
    {
      id: 'stage_upgrade',
      title: '推進產業升級',
      titleEn: 'Advance industrial upgrading',
      objective: '目標：從農業進到工業/服務',
      objectiveEn: 'Goal: Progress from agriculture to industrial/service stage',
      why: '結構轉型是成長與韌性的核心，不能永遠只靠單一產業。',
      whyEn: 'Structural transformation is the core of growth and resilience\u2014you can\'t rely on one industry forever.',
      action: '先穩食物，再觀察商品與服務需求逐步成形。',
      actionEn: 'Stabilize food first, then watch goods and services demand gradually take shape.',
      progress: q5Progress,
      progressLabel: state.economyStage === 'agriculture' ? '農業' : state.economyStage === 'industrial' ? '工業' : '服務',
      progressLabelEn: state.economyStage === 'agriculture' ? 'Agriculture' : state.economyStage === 'industrial' ? 'Industrial' : 'Service',
      done: state.economyStage !== 'agriculture',
    },
    {
      id: 'causal_reading',
      title: '讀懂一輪因果回放',
      titleEn: 'Read a causal replay',
      objective: '目標：看懂「滿意度變化前 3 個驅動」',
      objectiveEn: 'Goal: Understand the top 3 drivers of satisfaction change',
      why: '經濟治理不是猜測，而是根據驅動因子做小步迭代。',
      whyEn: 'Economic governance isn\'t guessing\u2014it\'s iterating in small steps based on causal drivers.',
      action: '在因果回放看本回合主因，再對應調整下一步政策。',
      actionEn: 'Check the causal replay for this turn\'s main drivers, then adjust your next policy accordingly.',
      progress: q6Progress,
      progressLabel: latest ? `Sat \u0394 ${latest.causalReplay.satisfaction.net.toFixed(2)}` : '--',
      progressLabelEn: latest ? `Sat \u0394 ${latest.causalReplay.satisfaction.net.toFixed(2)}` : '--',
      done: q6Progress >= 1 || state.turn >= 8,
    },
    // --- Advanced Quests ---
    {
      id: 'gini_target',
      title: '壓低不平等 (Gini < 0.35)',
      titleEn: 'Reduce inequality (Gini < 0.35)',
      objective: '目標：Gini 係數 < 0.35 且 GDP 仍有成長',
      objectiveEn: 'Goal: Gini coefficient < 0.35 while GDP still grows',
      why: '真正的治理藝術是在公平和效率之間找到平衡。',
      whyEn: 'The art of governance is finding the balance between equity and efficiency.',
      action: '使用福利搭配適度稅率，同時維持生產補貼。',
      actionEn: 'Use welfare combined with moderate tax rates while maintaining production subsidies.',
      progress: gini < 0.35 ? 1 : clamp01((0.5 - gini) / 0.15),
      progressLabel: `Gini ${gini.toFixed(3)}`,
      progressLabelEn: `Gini ${gini.toFixed(3)}`,
      done: gini < 0.35 && state.economyStage !== 'agriculture',
    },
    {
      id: 'survive_crisis',
      title: '安然度過天災衝擊',
      titleEn: 'Survive a natural disaster',
      objective: '目標：遭遇天災後人口不低於 85',
      objectiveEn: 'Goal: Keep population at or above 85 after a disaster',
      why: '韌性比成長更重要——系統能否在衝擊下自我修復？',
      whyEn: 'Resilience matters more than growth\u2014can the system self-repair after a shock?',
      action: '天災來襲時迅速補貼受衝擊產業，維持民心穩定。',
      actionEn: 'When disaster strikes, quickly subsidize affected sectors and stabilize public morale.',
      progress: hasRandomShock ? clamp01(state.agents.filter(a => a.alive).length / 85) : 0,
      progressLabel: hasRandomShock ? `人口 ${state.agents.filter(a => a.alive).length}` : '等待天災',
      progressLabelEn: hasRandomShock ? `Pop. ${state.agents.filter(a => a.alive).length}` : 'Awaiting disaster',
      done: hasRandomShock && state.agents.filter(a => a.alive).length >= 85,
    },
    {
      id: 'service_economy',
      title: '建立服務經濟 (服務業 > 40%)',
      titleEn: 'Build a service economy (services > 40%)',
      objective: '目標：服務業勞動力佔比 > 40%',
      objectiveEn: 'Goal: Service sector labor share > 40%',
      why: '高附加價值的服務經濟是已開發國家的典型結構。',
      whyEn: 'A high-value service economy is the typical structure of developed nations.',
      action: '穩定農業與工業後，讓市場自然引導勞動力轉移。',
      actionEn: 'Stabilize agriculture and industry, then let the market naturally guide labor reallocation.',
      progress: (() => {
        const alive = state.agents.filter(a => a.alive);
        const svcPct = alive.length > 0 ? alive.filter(a => a.sector === 'services').length / alive.length : 0;
        return clamp01(svcPct / 0.4);
      })(),
      progressLabel: (() => {
        const alive = state.agents.filter(a => a.alive);
        const svcPct = alive.length > 0 ? alive.filter(a => a.sector === 'services').length / alive.length : 0;
        return `${(svcPct * 100).toFixed(0)}%`;
      })(),
      progressLabelEn: (() => {
        const alive = state.agents.filter(a => a.alive);
        const svcPct = alive.length > 0 ? alive.filter(a => a.sector === 'services').length / alive.length : 0;
        return `${(svcPct * 100).toFixed(0)}%`;
      })(),
      done: (() => {
        const alive = state.agents.filter(a => a.alive);
        return alive.length > 0 && alive.filter(a => a.sector === 'services').length / alive.length > 0.4;
      })(),
    },
    {
      id: 'dependency_control',
      title: '控制扶養比 (< 0.5) 20 回合',
      titleEn: 'Control dependency ratio (< 0.5) for 20 turns',
      objective: '目標：扶養比持續 < 0.5',
      objectiveEn: 'Goal: Keep dependency ratio below 0.5',
      why: '人口結構是經濟的慢性根基，高扶養比會侵蝕成長動能。',
      whyEn: 'Demographics are the slow foundation of the economy. High dependency erodes growth momentum.',
      action: '維持穩定的民心以降低離島率，保持勞動力比例。',
      actionEn: 'Maintain stable morale to reduce departure rates and preserve the labor force ratio.',
      progress: clamp01(dependency < 0.5 ? state.turn / 20 : 0),
      progressLabel: `扶養比 ${dependency.toFixed(2)}`,
      progressLabelEn: `Dep. ratio ${dependency.toFixed(2)}`,
      done: dependency < 0.5 && state.turn >= 20,
    },
    {
      id: 'policy_experiment',
      title: '完成一次控制實驗',
      titleEn: 'Complete a controlled experiment',
      objective: '目標：在模擬實驗室比較不同政策的結果',
      objectiveEn: 'Goal: Compare different policy outcomes in the simulation lab',
      why: '科學精神的核心是對照實驗——用同一個種子碼跑不同政策路線。',
      whyEn: 'The heart of scientific thinking is controlled experiments\u2014run different policies with the same seed.',
      action: '在模擬實驗室用相同種子碼跑兩局，對比不同策略的結果。',
      actionEn: 'In the simulation lab, run two sessions with the same seed and compare different strategies.',
      progress: clamp01(state.statistics.length > 0 ? 0.5 : 0),
      progressLabel: `歷史紀錄`,
      progressLabelEn: 'History',
      done: false, // Tracked externally by run history count
    },
    {
      id: 'balanced_growth',
      title: '平衡成長 (GDP\u2191 Gini\u2193 Sat\u2191)',
      titleEn: 'Balanced growth (GDP\u2191 Gini\u2193 Sat\u2191)',
      objective: '目標：連續 5 回合 GDP 成長、Gini 下降、滿意度上升',
      objectiveEn: 'Goal: 5 consecutive turns of rising GDP, falling Gini, and rising satisfaction',
      why: '只有三指標同時改善，才算真正的可持續發展。',
      whyEn: 'Only when all three indicators improve simultaneously is it truly sustainable development.',
      action: '精細調控政策組合，避免過度傾斜任何單一目標。',
      actionEn: 'Fine-tune your policy mix. Avoid leaning too heavily on any single objective.',
      progress: (() => {
        if (state.statistics.length < 6) return 0;
        let streak = 0;
        for (let i = state.statistics.length - 1; i >= 1 && streak < 5; i--) {
          const cur = state.statistics[i];
          const prv = state.statistics[i - 1];
          if (cur.gdp > prv.gdp && cur.giniCoefficient < prv.giniCoefficient && cur.avgSatisfaction > prv.avgSatisfaction) {
            streak++;
          } else break;
        }
        return clamp01(streak / 5);
      })(),
      progressLabel: '需連續 5 回合',
      progressLabelEn: 'Need 5 consecutive turns',
      done: (() => {
        if (state.statistics.length < 6) return false;
        for (let i = state.statistics.length - 1; i >= state.statistics.length - 5; i--) {
          if (i < 1) return false;
          const cur = state.statistics[i];
          const prv = state.statistics[i - 1];
          if (!(cur.gdp > prv.gdp && cur.giniCoefficient < prv.giniCoefficient && cur.avgSatisfaction > prv.avgSatisfaction)) return false;
        }
        return true;
      })(),
    },
  ];

  const knowledgeNodes: LearningKnowledgeNode[] = [
    {
      id: 'market_signal',
      title: '市場訊號與均衡',
      titleEn: 'Market Signals and Equilibrium',
      chain: '微觀市場鏈',
      chainEn: 'Microeconomic Market Chain',
      concept: '價格是訊號：短缺漲價、過剩降價，供需會往均衡移動。',
      conceptEn: 'Prices are signals: shortages raise prices, surpluses lower them, and supply-demand moves toward equilibrium.',
      gameSignal: `目前食物覆蓋率 ${fmtPct(Math.min(1.5, foodCoverage)).replace('%', '')}%`,
      gameSignalEn: `Current food coverage ${fmtPct(Math.min(1.5, foodCoverage)).replace('%', '')}%`,
      worldLink: '對照真實世界：能源、糧食、運輸都是透過價格把稀缺傳遞出去。',
      worldLinkEn: 'Real-world parallel: Energy, food, and transportation all transmit scarcity through prices.',
      nextPrompt: '觀察下一回合價格變化是否跟短缺方向一致。',
      nextPromptEn: 'Watch whether next turn\'s price changes align with the direction of shortages.',
      unlocked: state.turn >= 2,
    },
    {
      id: 'policy_delay',
      title: '政策時滯與預期管理',
      titleEn: 'Policy Lag and Expectation Management',
      chain: '政策治理鏈',
      chainEn: 'Policy Governance Chain',
      concept: '政策通常有生效延遲，決策時要看 1-3 回合後的後果。',
      conceptEn: 'Policies usually have implementation delays. When deciding, consider the effects 1\u20133 turns ahead.',
      gameSignal: hasPolicyApplied ? '你已看到政策生效延遲。' : '尚未觸發政策生效案例。',
      gameSignalEn: hasPolicyApplied ? 'You\'ve observed policy implementation delay.' : 'No policy has taken effect yet.',
      worldLink: '對照真實世界：利率、補貼、財政都需時間才會傳導到實體經濟。',
      worldLinkEn: 'Real-world parallel: Interest rates, subsidies, and fiscal measures all take time to transmit to the real economy.',
      nextPrompt: '嘗試同時改兩項政策，觀察延遲疊加效果。',
      nextPromptEn: 'Try changing two policies at once and observe how the delays compound.',
      unlocked: hasPolicyRequested,
    },
    {
      id: 'inflation_shock',
      title: '通膨與供應衝擊',
      titleEn: 'Inflation and Supply Shocks',
      chain: '政策治理鏈',
      chainEn: 'Policy Governance Chain',
      concept: '供給受損時，價格先反應，福利與實質購買力會被壓縮。',
      conceptEn: 'When supply is disrupted, prices react first, squeezing welfare and real purchasing power.',
      gameSignal: hasRandomShock || maxPriceSwing >= 0.08
        ? `最近價格波動 ${(maxPriceSwing * 100).toFixed(1)}%`
        : '目前價格波動尚小，等待事件或短缺觸發。',
      gameSignalEn: hasRandomShock || maxPriceSwing >= 0.08
        ? `Recent price swing ${(maxPriceSwing * 100).toFixed(1)}%`
        : 'Price swings still small. Awaiting events or shortages.',
      worldLink: '對照真實世界：天災、戰爭、物流中斷常帶來成本推升型通膨。',
      worldLinkEn: 'Real-world parallel: Disasters, wars, and supply-chain disruptions often cause cost-push inflation.',
      nextPrompt: '比較「補貼」與「降稅」在穩價上的副作用差異。',
      nextPromptEn: 'Compare the side effects of "subsidies" vs. "tax cuts" for price stabilization.',
      unlocked: hasRandomShock || maxPriceSwing >= 0.08 || state.turn >= 8,
    },
    {
      id: 'distribution_state',
      title: '分配、公平與社會穩定',
      titleEn: 'Distribution, Equity, and Social Stability',
      chain: '分配財政鏈',
      chainEn: 'Distribution & Fiscal Chain',
      concept: '不平等過高會削弱民心與留島率，公平與成長需要平衡。',
      conceptEn: 'Excessive inequality erodes morale and retention. Equity and growth must be balanced.',
      gameSignal: `當前 Gini=${gini.toFixed(3)}，福利${state.government.welfareEnabled ? '已啟用' : '未啟用'}`,
      gameSignalEn: `Current Gini=${gini.toFixed(3)}, welfare ${state.government.welfareEnabled ? 'enabled' : 'disabled'}`,
      worldLink: '對照真實世界：稅收與轉移支付是調節分配的重要工具。',
      worldLinkEn: 'Real-world parallel: Taxes and transfer payments are key tools for adjusting income distribution.',
      nextPrompt: '試著在不拉高 Gini 的情況下把 GDP 維持成長。',
      nextPromptEn: 'Try to maintain GDP growth without increasing the Gini coefficient.',
      unlocked: gini >= 0.4 || state.government.welfareEnabled || state.turn >= 10,
    },
    {
      id: 'demography_labor',
      title: '人口結構與勞動供給',
      titleEn: 'Demographics and Labor Supply',
      chain: '人口產業鏈',
      chainEn: 'Population & Industry Chain',
      concept: '高扶養比會稀釋勞動供給，拉低就業與財政空間。',
      conceptEn: 'A high dependency ratio dilutes labor supply, dragging down employment and fiscal capacity.',
      gameSignal: `平均年齡 ${avgAge.toFixed(1)} 歲，扶養比 ${dependency.toFixed(2)}`,
      gameSignalEn: `Avg. age ${avgAge.toFixed(1)}, dependency ratio ${dependency.toFixed(2)}`,
      worldLink: '對照真實世界：高齡化社會常面臨成長放緩與財政壓力。',
      worldLinkEn: 'Real-world parallel: Aging societies often face slower growth and fiscal strain.',
      nextPrompt: '觀察出生率、就業率、勞動生產率是否同步改善。',
      nextPromptEn: 'Watch whether birth rate, employment rate, and labor productivity improve together.',
      unlocked: avgAge >= 35 || dependency >= 0.45 || state.turn >= 12,
    },
    {
      id: 'structural_shift',
      title: '結構轉型與韌性',
      titleEn: 'Structural Transformation and Resilience',
      chain: '人口產業鏈',
      chainEn: 'Population & Industry Chain',
      concept: '從農業到工業再到服務，能降低單一產業風險並提高抗衝擊能力。',
      conceptEn: 'Progressing from agriculture to industry to services reduces single-sector risk and improves shock resistance.',
      gameSignal: `目前階段：${state.economyStage}`,
      gameSignalEn: `Current stage: ${state.economyStage === 'agriculture' ? 'Agriculture' : state.economyStage === 'industrial' ? 'Industrial' : 'Service'}`,
      worldLink: '對照真實世界：產業多元化通常帶來更穩定的中長期成長。',
      worldLinkEn: 'Real-world parallel: Industrial diversification typically brings more stable medium-to-long-term growth.',
      nextPrompt: '看三大產業佔比是否更平衡，並檢查滿意度是否同步改善。',
      nextPromptEn: 'Check whether the three sectors are becoming more balanced and satisfaction is improving.',
      unlocked: state.economyStage !== 'agriculture',
    },
    {
      id: 'macro_mix',
      title: '政策組合與總體平衡',
      titleEn: 'Policy Mix and Macro Balance',
      chain: '總體協調鏈',
      chainEn: 'Macro Coordination Chain',
      concept: '稅率、補貼、福利、公共建設要成套搭配，避免單點過度拉扯。',
      conceptEn: 'Tax rates, subsidies, welfare, and public works must be coordinated as a package\u2014avoid pulling too hard on any single lever.',
      gameSignal: `稅率 ${(taxRate * 100).toFixed(0)}%，國庫 $${treasury.toFixed(0)}，滿意度 ${avgSat.toFixed(1)}`,
      gameSignalEn: `Tax rate ${(taxRate * 100).toFixed(0)}%, treasury $${treasury.toFixed(0)}, satisfaction ${avgSat.toFixed(1)}`,
      worldLink: '對照真實世界：可持續治理重點在「穩定預期」而不是短期衝高單一指標。',
      worldLinkEn: 'Real-world parallel: Sustainable governance focuses on "stabilizing expectations" rather than short-term spikes in any single metric.',
      nextPrompt: '挑一個目標（成長/公平/穩定）並設計 5 回合政策路線圖。',
      nextPromptEn: 'Pick one goal (growth/equity/stability) and design a 5-turn policy roadmap.',
      unlocked: state.turn >= 18 && hasPolicyApplied && state.economyStage !== 'agriculture',
    },
    // --- Advanced Knowledge Nodes ---
    {
      id: 'monetary_transmission',
      title: '貨幣政策傳導機制',
      titleEn: 'Monetary Policy Transmission',
      chain: '貨幣金融鏈',
      chainEn: 'Monetary & Financial Chain',
      concept: '利率變化經由儲蓄、借貸、消費逐層傳導，影響實體經濟需時數回合。',
      conceptEn: 'Interest rate changes transmit through savings, lending, and consumption layer by layer\u2014taking several turns to affect the real economy.',
      gameSignal: `政策利率 ${(state.government.policyRate * 100).toFixed(1)}%，銀行存款總額 $${state.agents.filter(a => a.alive).reduce((s, a) => s + a.savings, 0).toFixed(0)}`,
      gameSignalEn: `Policy rate ${(state.government.policyRate * 100).toFixed(1)}%, total deposits $${state.agents.filter(a => a.alive).reduce((s, a) => s + a.savings, 0).toFixed(0)}`,
      worldLink: '對照真實世界：Fed 升息後約 6-18 個月才傳導至就業與通膨。',
      worldLinkEn: 'Real-world parallel: After the Fed raises rates, it takes 6\u201318 months to transmit to employment and inflation.',
      nextPrompt: '調一次利率，追蹤 5 回合銀行存款與消費變化。',
      nextPromptEn: 'Adjust the interest rate once and track deposit and consumption changes over 5 turns.',
      unlocked: state.government.policyRate !== 0.02 || state.turn >= 15,
    },
    {
      id: 'fiscal_sustainability',
      title: '財政可持續性',
      titleEn: 'Fiscal Sustainability',
      chain: '分配財政鏈',
      chainEn: 'Distribution & Fiscal Chain',
      concept: '稅收、支出、國庫餘額三者必須長期平衡，否則政策空間會萎縮。',
      conceptEn: 'Revenue, spending, and treasury balance must be sustainable long-term\u2014otherwise policy capacity shrinks.',
      gameSignal: `國庫 $${treasury.toFixed(0)}，趨勢：${treasury > 500 ? '充裕' : treasury > 100 ? '可控' : '吃緊'}`,
      gameSignalEn: `Treasury $${treasury.toFixed(0)}, trend: ${treasury > 500 ? 'Ample' : treasury > 100 ? 'Manageable' : 'Tight'}`,
      worldLink: '對照真實世界：長期財政赤字會推高公債利息，排擠公共投資。',
      worldLinkEn: 'Real-world parallel: Persistent fiscal deficits push up debt interest and crowd out public investment.',
      nextPrompt: '嘗試在不增稅的前提下讓國庫連 10 回合正成長。',
      nextPromptEn: 'Try to grow the treasury for 10 consecutive turns without raising taxes.',
      unlocked: treasury < 50 || (state.turn >= 20 && hasPolicyApplied),
    },
    {
      id: 'stagflation',
      title: '停滯性通膨 Stagflation',
      titleEn: 'Stagflation',
      chain: '總體協調鏈',
      chainEn: 'Macro Coordination Chain',
      concept: '經濟停滯加上物價上漲，政策左右為難——刺激加劇通膨，緊縮加劇衰退。',
      conceptEn: 'Economic stagnation plus rising prices creates a policy dilemma\u2014stimulus worsens inflation, austerity deepens recession.',
      gameSignal: (() => {
        if (!latest || !prev) return '尚未觸發';
        const gdpDown = latest.gdp < prev.gdp;
        const priceUp = maxPriceSwing > 0.05;
        return gdpDown && priceUp ? '可能正在經歷停滯性通膨！' : '目前未出現';
      })(),
      gameSignalEn: (() => {
        if (!latest || !prev) return 'Not yet triggered';
        const gdpDown = latest.gdp < prev.gdp;
        const priceUp = maxPriceSwing > 0.05;
        return gdpDown && priceUp ? 'Possible stagflation occurring!' : 'Not currently observed';
      })(),
      worldLink: '對照真實世界：1970s 石油危機後美國經歷典型停滯性通膨。',
      worldLinkEn: 'Real-world parallel: The U.S. experienced classic stagflation after the 1970s oil crisis.',
      nextPrompt: '如果出現此情境，嘗試用供給側政策（補貼特定產業）而非純需求刺激來應對。',
      nextPromptEn: 'If this occurs, try supply-side policies (targeted sector subsidies) rather than pure demand stimulus.',
      unlocked: (() => {
        if (!latest || !prev) return false;
        return (latest.gdp < prev.gdp && maxPriceSwing > 0.05) || state.turn >= 25;
      })(),
    },
    {
      id: 'dutch_disease',
      title: '荷蘭病 Dutch Disease',
      titleEn: 'Dutch Disease',
      chain: '人口產業鏈',
      chainEn: 'Population & Industry Chain',
      concept: '某一產業過度繁榮會吸走其他產業的勞動力，造成經濟結構失衡。',
      conceptEn: 'When one sector booms excessively, it drains labor from other sectors, causing structural imbalance.',
      gameSignal: (() => {
        const alive = state.agents.filter(a => a.alive);
        if (alive.length === 0) return '--';
        const maxSector = ['food', 'goods', 'services'].reduce((max, s) => {
          const count = alive.filter(a => a.sector === s).length;
          return count > max.count ? { sector: s, count } : max;
        }, { sector: '', count: 0 });
        const ratio = maxSector.count / alive.length;
        return ratio > 0.6 ? `${maxSector.sector} 佔 ${(ratio * 100).toFixed(0)}%，結構偏斜！` : '產業分配尚可';
      })(),
      gameSignalEn: (() => {
        const alive = state.agents.filter(a => a.alive);
        if (alive.length === 0) return '--';
        const maxSector = ['food', 'goods', 'services'].reduce((max, s) => {
          const count = alive.filter(a => a.sector === s).length;
          return count > max.count ? { sector: s, count } : max;
        }, { sector: '', count: 0 });
        const ratio = maxSector.count / alive.length;
        return ratio > 0.6 ? `${maxSector.sector} at ${(ratio * 100).toFixed(0)}%, structurally skewed!` : 'Sector distribution acceptable';
      })(),
      worldLink: '對照真實世界：荷蘭發現天然氣後製造業萎縮，委內瑞拉過度依賴石油。',
      worldLinkEn: 'Real-world parallel: After the Netherlands discovered natural gas, manufacturing shrank. Venezuela became over-dependent on oil.',
      nextPrompt: '如果某產業佔比 > 60%，嘗試用補貼引導分散化。',
      nextPromptEn: 'If any sector exceeds 60%, try using subsidies to guide diversification.',
      unlocked: (() => {
        const alive = state.agents.filter(a => a.alive);
        if (alive.length === 0) return false;
        const maxRatio = Math.max(
          alive.filter(a => a.sector === 'food').length,
          alive.filter(a => a.sector === 'goods').length,
          alive.filter(a => a.sector === 'services').length,
        ) / alive.length;
        return maxRatio > 0.55 || state.turn >= 20;
      })(),
    },
    {
      id: 'laffer_effect',
      title: '拉弗曲線效應',
      titleEn: 'Laffer Curve Effect',
      chain: '分配財政鏈',
      chainEn: 'Distribution & Fiscal Chain',
      concept: '稅率太高反而降低稅收——因為經濟萎縮、人口外流，稅基消失。',
      conceptEn: 'Tax rates too high actually reduce tax revenue\u2014because the economy shrinks, people leave, and the tax base disappears.',
      gameSignal: `稅率 ${(taxRate * 100).toFixed(0)}%，國庫趨勢：${(() => {
        if (state.statistics.length < 3) return '--';
        const recent = state.statistics.slice(-3);
        const taxTrend = recent[recent.length - 1].causalReplay.policy.taxCollected - recent[0].causalReplay.policy.taxCollected;
        return taxTrend >= 0 ? '稅收上升' : '稅收下降';
      })()}`,
      gameSignalEn: `Tax rate ${(taxRate * 100).toFixed(0)}%, revenue trend: ${(() => {
        if (state.statistics.length < 3) return '--';
        const recent = state.statistics.slice(-3);
        const taxTrend = recent[recent.length - 1].causalReplay.policy.taxCollected - recent[0].causalReplay.policy.taxCollected;
        return taxTrend >= 0 ? 'Revenue rising' : 'Revenue falling';
      })()}`,
      worldLink: '對照真實世界：高稅率可能促使企業/人才外移至低稅地區。',
      worldLinkEn: 'Real-world parallel: High tax rates may drive businesses and talent to relocate to lower-tax regions.',
      nextPrompt: '試著把稅率調到 30% 以上，觀察 5 回合稅收是增是減。',
      nextPromptEn: 'Try raising the tax rate above 30% and observe whether revenue rises or falls over 5 turns.',
      unlocked: taxRate >= 0.25 || state.turn >= 22,
    },
  ];

  const coach = (() => {
    if (state.turn < 3) {
      return {
        phaseLabel: 'Phase 1\uFF5C建立基線',
        phaseLabelEn: 'Phase 1 | Establish Baseline',
        phaseGoal: '先看懂市場怎麼自己動，再動政策。',
        phaseGoalEn: 'Understand how the market moves on its own before intervening with policy.',
        diagnosis: '你正在建立「沒有干預時，供需與價格自然變化」的觀察基線。',
        diagnosisEn: 'You\'re building an observation baseline: how supply, demand, and prices naturally change without intervention.',
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'baseline_run',
            title: '先跑到第 3 回合',
            titleEn: 'Run to turn 3 first',
            rationale: '太早改政策，會失去比較基準。',
            rationaleEn: 'Changing policies too early means losing your comparison baseline.',
            steps: [
              '先用慢速自動或手動前進，暫時不調任何滑桿。',
              '連看 3 回合的食物供需與價格變化。',
            ],
            stepsEn: [
              'Use slow auto-play or manual advance. Don\'t adjust any sliders yet.',
              'Watch 3 turns of food supply-demand and price changes.',
            ],
            expectedSignal: '你會看到價格跟短缺方向一致，建立第一個因果直覺。',
            expectedSignalEn: 'You\'ll see prices move in line with shortages, building your first causal intuition.',
          },
        ],
        watchlist: [
          '食物覆蓋率（Supply / Demand）',
          '食物價格變化（是否連續上升）',
          '平均滿意度（是否開始下滑）',
        ],
        watchlistEn: [
          'Food coverage (Supply / Demand)',
          'Food price trend (rising consecutively?)',
          'Average satisfaction (starting to decline?)',
        ],
        pitfall: '常見錯誤：第一回合就同時改稅率、補貼、福利，之後很難判斷是誰造成效果。',
        pitfallEn: 'Common mistake: Changing tax rate, subsidies, and welfare all at once on turn 1\u2014making it impossible to tell what caused what.',
        economicsLink: '經濟學核心是「先觀察訊號，再介入」，不是先猜結論。',
        economicsLinkEn: 'The core of economics is "observe signals first, then intervene"\u2014not guess the conclusion.',
        keywords: ['供需', '價格訊號', '基線'],
        keywordsEn: ['Supply-Demand', 'Price Signals', 'Baseline'],
      } satisfies LearningCoachBrief;
    }

    if (foodCoverage < 1) {
      return {
        phaseLabel: 'Phase 2\uFF5C民生穩定',
        phaseLabelEn: 'Phase 2 | Livelihood Stability',
        phaseGoal: '先把基本需求補齊，再談成長。',
        phaseGoalEn: 'Meet basic needs first, then pursue growth.',
        diagnosis: `目前食物覆蓋率 ${fmtPct(Math.max(0, Math.min(1.8, foodCoverage))).replace('%', '')}% ，短缺正在放大民心壓力。`,
        diagnosisEn: `Current food coverage is ${fmtPct(Math.max(0, Math.min(1.8, foodCoverage))).replace('%', '')}%. Shortages are amplifying morale pressure.`,
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'food_patch',
            title: '優先補食物，不要同時大改三產業',
            titleEn: 'Prioritize food\u2014don\'t overhaul all three sectors at once',
            rationale: '食物短缺會先打擊健康與滿意度，造成連鎖離島。',
            rationaleEn: 'Food shortages hit health and satisfaction first, triggering cascading departures.',
            steps: [
              '把食物補貼提高 5%-10%。',
              '維持 2 回合觀察後再決定下一步。',
            ],
            stepsEn: [
              'Raise food subsidies by 5%\u201310%.',
              'Observe for 2 turns before deciding next steps.',
            ],
            expectedSignal: '食物覆蓋率接近或超過 100%，食物價格漲幅收斂。',
            expectedSignalEn: 'Food coverage approaches or exceeds 100%. Food price increases stabilize.',
          },
          {
            id: 'tax_soften',
            title: '若民心下滑快，先小幅降稅 2%',
            titleEn: 'If morale drops fast, cut taxes by 2%',
            rationale: '提高可支配所得可緩衝短缺造成的滿意度下滑。',
            rationaleEn: 'Increasing disposable income buffers the satisfaction decline caused by shortages.',
            steps: [
              '只調 1 次稅率，避免連續上下震盪。',
            ],
            stepsEn: [
              'Adjust the tax rate just once\u2014avoid continuous up-and-down oscillations.',
            ],
            expectedSignal: '平均滿意度跌幅縮小，人口流出壓力下降。',
            expectedSignalEn: 'Average satisfaction decline slows. Departure pressure decreases.',
          },
        ],
        watchlist: [
          '食物覆蓋率是否連續 2 回合 >= 100%',
          '平均滿意度是否停止快速下滑',
          '食物價格是否由急漲轉為平穩',
        ],
        watchlistEn: [
          'Is food coverage >= 100% for 2 consecutive turns?',
          'Has average satisfaction stopped declining rapidly?',
          'Have food prices shifted from surging to stable?',
        ],
        pitfall: '常見錯誤：同時拉高所有補貼，短期看起來有效，國庫卻快速惡化。',
        pitfallEn: 'Common mistake: Raising all subsidies at once looks effective short-term, but the treasury deteriorates rapidly.',
        economicsLink: '這是在學「稀缺管理」：先處理瓶頸資源，再談擴張。',
        economicsLinkEn: 'This teaches "scarcity management": address bottleneck resources first, then pursue expansion.',
        keywords: ['稀缺', '民生優先', '供給瓶頸'],
        keywordsEn: ['Scarcity', 'Basic Needs First', 'Supply Bottleneck'],
      } satisfies LearningCoachBrief;
    }

    if (!hasPolicyRequested) {
      return {
        phaseLabel: 'Phase 3\uFF5C政策時滯',
        phaseLabelEn: 'Phase 3 | Policy Lag',
        phaseGoal: '有意識地體驗「政策不是即時生效」。',
        phaseGoalEn: 'Consciously experience that "policies don\'t take effect immediately."',
        diagnosis: '你已穩住基本盤，下一步是用一個單點政策做因果實驗。',
        diagnosisEn: 'You\'ve stabilized the basics. Next step: use a single policy change as a causal experiment.',
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'single_policy',
            title: '只下達 1 個政策，觀察完整 3 回合',
            titleEn: 'Issue just 1 policy and observe for a full 3 turns',
            rationale: '一次只改一個變數，才能知道因果方向。',
            rationaleEn: 'Change only one variable at a time to identify the causal direction.',
            steps: [
              '在政策面板選「稅率」或「單一產業補貼」其中一個。',
              '下達後至少看 3 回合，不要中途再加碼。',
            ],
            stepsEn: [
              'In the Policy Panel, choose either "Tax Rate" or a single sector subsidy.',
              'After issuing, observe for at least 3 turns without adding more changes.',
            ],
            expectedSignal: '你會在政策時間線看到「待生效 → 已生效」，並在因果回放看到傳導。',
            expectedSignalEn: 'You\'ll see "Pending \u2192 Applied" in the policy timeline, and observe transmission in the causal replay.',
          },
        ],
        watchlist: [
          '政策時間線狀態',
          '滿意度/國庫/GDP 的方向變化',
          '人均可支配現金 \u0394',
        ],
        watchlistEn: [
          'Policy timeline status',
          'Direction of satisfaction / treasury / GDP changes',
          'Per-capita disposable cash \u0394',
        ],
        pitfall: '常見錯誤：政策還沒生效就反向操作，造成「政策打架」。',
        pitfallEn: 'Common mistake: Reversing a policy before it takes effect, causing "policy conflict."',
        economicsLink: '這是在學公共政策的「時滯與預期管理」。',
        economicsLinkEn: 'This teaches the "lag and expectation management" of public policy.',
        keywords: ['政策時滯', '因果識別', '單一變數'],
        keywordsEn: ['Policy Lag', 'Causal Identification', 'Single Variable'],
      } satisfies LearningCoachBrief;
    }

    if (avgSat < 60 || gini > 0.42) {
      const satIssue = avgSat < 60;
      const equityIssue = gini > 0.42;
      return {
        phaseLabel: 'Phase 4\uFF5C成長與公平平衡',
        phaseLabelEn: 'Phase 4 | Balancing Growth and Equity',
        phaseGoal: '在不犧牲系統穩定下，修復民心與分配。',
        phaseGoalEn: 'Repair morale and distribution without sacrificing system stability.',
        diagnosis: [
          satIssue ? `平均滿意度 ${avgSat.toFixed(1)} 偏低` : '',
          equityIssue ? `Gini ${gini.toFixed(3)} 偏高` : '',
        ].filter(Boolean).join('，') + '。',
        diagnosisEn: [
          satIssue ? `Average satisfaction ${avgSat.toFixed(1)} is low` : '',
          equityIssue ? `Gini ${gini.toFixed(3)} is high` : '',
        ].filter(Boolean).join('; ') + '.',
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'social_mix',
            title: '啟用或維持福利，搭配小幅稅率微調',
            titleEn: 'Enable or maintain welfare with minor tax adjustments',
            rationale: '先補底層購買力，再看財政承受度調整。',
            rationaleEn: 'First boost purchasing power at the bottom, then adjust based on fiscal capacity.',
            steps: [
              '福利先開，觀察 2 回合。',
              '若國庫壓力大，再把稅率上調 1%-2%。',
            ],
            stepsEn: [
              'Enable welfare first, observe for 2 turns.',
              'If the treasury is under pressure, raise the tax rate by 1%\u20132%.',
            ],
            expectedSignal: '滿意度回升、離島壓力下降，國庫不會瞬間失控。',
            expectedSignalEn: 'Satisfaction recovers, departure pressure drops, and the treasury doesn\'t spiral out of control.',
          },
          {
            id: 'sector_focus',
            title: '找出短缺最嚴重產業做精準補貼',
            titleEn: 'Target subsidies at the sector with the worst shortage',
            rationale: '廣撒補貼效率低，且容易製造財政負擔。',
            rationaleEn: 'Broad subsidies are inefficient and create fiscal burdens.',
            steps: [
              '從市場面板找 supply/demand 缺口最大的產業。',
              '僅提高該產業補貼 5%，其餘先不動。',
            ],
            stepsEn: [
              'Find the sector with the largest supply/demand gap in the Market Panel.',
              'Raise only that sector\'s subsidy by 5%. Leave others unchanged.',
            ],
            expectedSignal: '缺口收斂且價格波動降低，滿意度修復更穩定。',
            expectedSignalEn: 'The gap narrows, price volatility decreases, and satisfaction recovery is more stable.',
          },
        ],
        watchlist: [
          '平均滿意度是否回到 60+',
          'Gini 是否回落到 0.42 以下',
          '國庫淨變化是否維持可持續',
        ],
        watchlistEn: [
          'Has average satisfaction returned to 60+?',
          'Has Gini fallen below 0.42?',
          'Is the net treasury change sustainable?',
        ],
        pitfall: '常見錯誤：只追 GDP，忽略分配惡化，最後民心和留島率一起崩。',
        pitfallEn: 'Common mistake: Chasing GDP only, ignoring worsening distribution, until morale and retention both collapse.',
        economicsLink: '這是在學經典取捨：效率、公平、穩定三者難以同時極大化。',
        economicsLinkEn: 'This teaches the classic trade-off: efficiency, equity, and stability are hard to maximize simultaneously.',
        keywords: ['效率 vs 公平', '分配', '社會穩定'],
        keywordsEn: ['Efficiency vs. Equity', 'Distribution', 'Social Stability'],
      } satisfies LearningCoachBrief;
    }

    // Phase 5: intermediate — first 25 turns after passing phase 4
    if (state.turn < 25) {
      return {
        phaseLabel: 'Phase 5\uFF5C系統治理與反事實',
        phaseLabelEn: 'Phase 5 | Systems Governance & Counterfactuals',
        phaseGoal: '從單點調參升級成可驗證的政策路線。',
        phaseGoalEn: 'Upgrade from single-parameter tweaking to verifiable policy pathways.',
        diagnosis: '你已跨過新手期，建議改用「小步、可比較、可回顧」的實驗式治理。',
        diagnosisEn: 'You\'ve passed the beginner phase. Shift to "small steps, comparable, reviewable" experimental governance.',
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'one_knob',
            title: '固定 5 回合只調 1 個政策旋鈕',
            titleEn: 'Adjust only 1 policy lever for 5 turns',
            rationale: '維持可比較性，避免混合干擾。',
            rationaleEn: 'Maintain comparability and avoid mixed interference.',
            steps: [
              '先選一個主目標（成長/公平/穩定）。',
              '只動一個政策，觀察完整窗口。',
            ],
            stepsEn: [
              'Pick one primary goal (growth / equity / stability).',
              'Adjust only one policy and observe the full window.',
            ],
            expectedSignal: '因果回放會更乾淨，決策準確度大幅提升。',
            expectedSignalEn: 'Causal replays will be cleaner, and decision accuracy will improve significantly.',
          },
          {
            id: 'counterfactual_note',
            title: '每 5 回合記錄一次「若不做這步會怎樣」',
            titleEn: 'Every 5 turns, note "what would happen if I didn\'t do this"',
            rationale: '建立反事實思維，才是真正的經濟治理能力。',
            rationaleEn: 'Building counterfactual thinking is the real skill of economic governance.',
            steps: [
              '在心中設定對照組：維持原政策不變。',
              '比較兩者對滿意度/GDP/Gini 的差異。',
            ],
            stepsEn: [
              'Mentally set a control group: keep the original policy unchanged.',
              'Compare the effects on satisfaction / GDP / Gini between the two paths.',
            ],
            expectedSignal: '你會更快找到對當前局勢最有效的政策組合。',
            expectedSignalEn: 'You\'ll find the most effective policy mix for the current situation faster.',
          },
        ],
        watchlist: [
          'GDP、Gini、滿意度三指標是否同時可接受',
          '政策時間線是否過度擁塞',
          '隨機衝擊下系統恢復速度',
        ],
        watchlistEn: [
          'Are GDP, Gini, and satisfaction all at acceptable levels simultaneously?',
          'Is the policy timeline becoming too congested?',
          'How fast does the system recover from random shocks?',
        ],
        pitfall: '常見錯誤：指標好轉就連續加碼，反而讓系統過熱後反噬。',
        pitfallEn: 'Common mistake: When indicators improve, doubling down causes the system to overheat and then backlash.',
        economicsLink: '這是在學總體政策協調與韌性治理，接近真實世界決策節奏。',
        economicsLinkEn: 'This teaches macro policy coordination and resilience governance, approaching real-world decision-making rhythm.',
        keywords: ['政策組合', '反事實', '韌性'],
        keywordsEn: ['Policy Mix', 'Counterfactual', 'Resilience'],
      } satisfies LearningCoachBrief;
    }

    // Phase 6: advanced macro — monetary + fiscal coordination
    const hasUsedMonetary = state.government.policyRate !== 0.02 || state.government.liquiditySupportActive;
    if (state.turn < 40 || !hasUsedMonetary) {
      return {
        phaseLabel: 'Phase 6\uFF5C進階總體經濟',
        phaseLabelEn: 'Phase 6 | Advanced Macroeconomics',
        phaseGoal: '掌握貨幣與財政政策的協調，應對複合衝擊。',
        phaseGoalEn: 'Master monetary-fiscal policy coordination to handle compound shocks.',
        diagnosis: (() => {
          const parts: string[] = [];
          if (!hasUsedMonetary) parts.push('尚未使用貨幣政策工具（利率/流動性支援）');
          if (treasury < 200) parts.push(`國庫 $${treasury.toFixed(0)} 偏緊`);
          if (gini > 0.38) parts.push(`Gini ${gini.toFixed(3)} 仍偏高`);
          return parts.length > 0 ? parts.join('；') + '。' : '系統運行穩定，可嘗試更進階的政策組合。';
        })(),
        diagnosisEn: (() => {
          const parts: string[] = [];
          if (!hasUsedMonetary) parts.push('Monetary policy tools (interest rate / liquidity support) not yet used');
          if (treasury < 200) parts.push(`Treasury $${treasury.toFixed(0)} is tight`);
          if (gini > 0.38) parts.push(`Gini ${gini.toFixed(3)} remains high`);
          return parts.length > 0 ? parts.join('; ') + '.' : 'System running stably. Try more advanced policy combinations.';
        })(),
        turnNarrative,
        turnNarrativeEn,
        actions: [
          {
            id: 'monetary_experiment',
            title: '用利率調節儲蓄與消費行為',
            titleEn: 'Use interest rates to regulate savings and consumption',
            rationale: '貨幣政策透過利率影響借貸與消費意願，是總體穩定的第二支柱。',
            rationaleEn: 'Monetary policy influences borrowing and spending through interest rates\u2014the second pillar of macro stability.',
            steps: [
              '把政策利率調高 0.5%，觀察 3 回合銀行存款變化。',
              '再調回原位，比較消費與價格的反應速度。',
            ],
            stepsEn: [
              'Raise the policy rate by 0.5%, observe bank deposit changes over 3 turns.',
              'Then revert and compare the speed of consumption and price reactions.',
            ],
            expectedSignal: '升息後消費減緩、存款增加；降息後相反。注意傳導有 1-2 回合延遲。',
            expectedSignalEn: 'After a rate hike: consumption slows, deposits rise. After a cut: the reverse. Note the 1\u20132 turn transmission lag.',
          },
          {
            id: 'fiscal_monetary_mix',
            title: '財政+貨幣雙管齊下',
            titleEn: 'Combined fiscal + monetary approach',
            rationale: '真實央行與財政部門需要協調——同方向強化效果，反方向則互相抵消。',
            rationaleEn: 'Real-world central banks and treasuries must coordinate\u2014same direction amplifies; opposite directions cancel out.',
            steps: [
              '在經濟衰退時同時降息 + 增加補貼，觀察 GDP 與通膨。',
              '在過熱時同時升息 + 減少補貼，觀察是否軟著陸。',
            ],
            stepsEn: [
              'During recession: cut rates + increase subsidies, watch GDP and inflation.',
              'During overheating: raise rates + reduce subsidies, see if you achieve a soft landing.',
            ],
            expectedSignal: '雙管齊下效果更快但風險更高，需密切監控物價穩定。',
            expectedSignalEn: 'Combined action is faster but riskier\u2014monitor price stability closely.',
          },
        ],
        watchlist: [
          '利率調整後 1-3 回合的消費/存款變化',
          '財政赤字是否在可控範圍（國庫不連續大幅下降）',
          '通膨與就業的同步走勢（Phillips 曲線效應）',
        ],
        watchlistEn: [
          'Consumption/deposit changes 1\u20133 turns after rate adjustment',
          'Is the fiscal deficit manageable (treasury not declining sharply)?',
          'Co-movement of inflation and employment (Phillips Curve effect)',
        ],
        pitfall: '常見錯誤：貨幣寬鬆+財政擴張同時全開，短期繁榮但很快過熱崩盤。',
        pitfallEn: 'Common mistake: Full monetary easing + fiscal expansion at once\u2014short-term boom followed by rapid overheating and crash.',
        economicsLink: '這是在學 IS-LM 模型的直覺：財政移 IS、貨幣移 LM，要看哪條先碰壁。',
        economicsLinkEn: 'This teaches IS-LM intuition: fiscal policy shifts IS, monetary policy shifts LM\u2014see which one hits its limit first.',
        keywords: ['貨幣政策', '利率傳導', 'IS-LM', '政策協調'],
        keywordsEn: ['Monetary Policy', 'Interest Rate Transmission', 'IS-LM', 'Policy Coordination'],
      } satisfies LearningCoachBrief;
    }

    // Phase 7: system mastery — long-run structural governance
    return {
      phaseLabel: 'Phase 7\uFF5C系統大師',
      phaseLabelEn: 'Phase 7 | System Mastery',
      phaseGoal: '從政策操作者升級為制度設計者，追求長期可持續發展。',
      phaseGoalEn: 'Upgrade from policy operator to institutional designer, pursuing long-term sustainable development.',
      diagnosis: (() => {
        const alive = state.agents.filter(a => a.alive).length;
        const gdpPerCap = latest ? latest.gdp / Math.max(1, alive) : 0;
        return `人口 ${alive}，人均 GDP $${gdpPerCap.toFixed(0)}，Gini ${gini.toFixed(3)}。你已掌握基本工具，現在挑戰長期韌性。`;
      })(),
      diagnosisEn: (() => {
        const alive = state.agents.filter(a => a.alive).length;
        const gdpPerCap = latest ? latest.gdp / Math.max(1, alive) : 0;
        return `Population ${alive}, GDP per capita $${gdpPerCap.toFixed(0)}, Gini ${gini.toFixed(3)}. You've mastered the basic tools\u2014now challenge long-term resilience.`;
      })(),
      turnNarrative,
      turnNarrativeEn,
      actions: [
        {
          id: 'structural_design',
          title: '設計 20 回合永續治理路線',
          titleEn: 'Design a 20-turn sustainable governance roadmap',
          rationale: '從回合制反應升級成前瞻規劃，預判衝擊而非被動應對。',
          rationaleEn: 'Upgrade from reactive turn-by-turn responses to forward planning\u2014anticipate shocks rather than reacting.',
          steps: [
            '設定明確目標：GDP 年增率、Gini 上限、人口下限。',
            '規劃各階段的政策組合與切換時機。',
            '遇到衝擊時微調而非全盤推翻。',
          ],
          stepsEn: [
            'Set clear targets: GDP growth rate, Gini ceiling, population floor.',
            'Plan policy combinations and switching points for each phase.',
            'When shocks hit, fine-tune rather than overhaul everything.',
          ],
          expectedSignal: '20 回合後三大指標（GDP/Gini/滿意度）波動幅度明顯縮小。',
          expectedSignalEn: 'After 20 turns, volatility in the three key indicators (GDP/Gini/Satisfaction) noticeably decreases.',
        },
        {
          id: 'anti_fragile',
          title: '測試系統反脆弱性',
          titleEn: 'Test the system\'s antifragility',
          rationale: '好的制度不是避免衝擊，而是讓衝擊反而強化系統。',
          rationaleEn: 'Good institutions don\'t avoid shocks\u2014they let shocks strengthen the system.',
          steps: [
            '故意在穩定期降低補貼，測試經濟自主恢復能力。',
            '遭遇天災後觀察恢復速度，比較有/無預備金的差異。',
          ],
          stepsEn: [
            'Deliberately lower subsidies during stable periods to test the economy\'s self-recovery.',
            'After a disaster, observe recovery speed. Compare with/without reserve funds.',
          ],
          expectedSignal: '系統能在 3-5 回合內自行回穩，不需要持續高強度干預。',
          expectedSignalEn: 'The system self-stabilizes within 3\u20135 turns without needing continuous heavy intervention.',
        },
        {
          id: 'comparative_systems',
          title: '比較不同治理路線',
          titleEn: 'Compare different governance approaches',
          rationale: '制度差異是各國經濟表現分化的根本原因。',
          rationaleEn: 'Institutional differences are the root cause of divergent economic performance across nations.',
          steps: [
            '用模擬實驗室分別測試：高稅高福利 vs 低稅低干預。',
            '記錄各路線 30 回合的 GDP、Gini、人口曲線。',
          ],
          stepsEn: [
            'Use the simulation lab to test: high-tax high-welfare vs. low-tax low-intervention.',
            'Record GDP, Gini, and population curves for each path over 30 turns.',
          ],
          expectedSignal: '你會發現沒有「最優制度」，只有「最適當下」的制度選擇。',
          expectedSignalEn: 'You\'ll discover there\'s no "optimal system"\u2014only the "best fit for current circumstances."',
        },
      ],
      watchlist: [
        '長期趨勢線（20 回合滑動平均）是否穩定向好',
        '衝擊後恢復速度是否越來越快',
        '政策干預頻率是否減少（制度自動穩定器發揮作用）',
      ],
      watchlistEn: [
        'Is the long-term trend (20-turn moving average) steadily improving?',
        'Is recovery speed after shocks getting faster?',
        'Is policy intervention frequency decreasing (automatic stabilizers taking effect)?',
      ],
      pitfall: '常見錯誤：追求完美均衡——真實經濟永遠在動態調整中，接受適度波動是成熟治理的標誌。',
      pitfallEn: 'Common mistake: Pursuing perfect equilibrium\u2014real economies are always dynamically adjusting. Accepting moderate volatility is a sign of mature governance.',
      economicsLink: '這是在學制度經濟學與長期發展理論：制度 > 政策 > 個別決策。',
      economicsLinkEn: 'This teaches institutional economics and long-term development theory: institutions > policies > individual decisions.',
      keywords: ['制度設計', '反脆弱', '長期發展', '比較制度'],
      keywordsEn: ['Institutional Design', 'Antifragility', 'Long-term Development', 'Comparative Systems'],
    } satisfies LearningCoachBrief;
  })();

  return { coach, quests, knowledgeNodes };
}
