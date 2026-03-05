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

export interface LearningCoachAction {
  id: string;
  title: string;
  rationale: string;
  steps: string[];
  expectedSignal: string;
}

export interface LearningCoachBrief {
  phaseLabel: string;
  phaseGoal: string;
  diagnosis: string;
  turnNarrative: string[];
  actions: LearningCoachAction[];
  watchlist: string[];
  pitfall: string;
  economicsLink: string;
  keywords: string[];
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
    // --- Advanced Quests ---
    {
      id: 'gini_target',
      title: '壓低不平等 (Gini < 0.35)',
      objective: '目標：Gini 係數 < 0.35 且 GDP 仍有成長',
      why: '真正的治理藝術是在公平和效率之間找到平衡。',
      action: '使用福利搭配適度稅率，同時維持生產補貼。',
      progress: gini < 0.35 ? 1 : clamp01((0.5 - gini) / 0.15),
      progressLabel: `Gini ${gini.toFixed(3)}`,
      done: gini < 0.35 && state.economyStage !== 'agriculture',
    },
    {
      id: 'survive_crisis',
      title: '安然度過天災衝擊',
      objective: '目標：遭遇天災後人口不低於 85',
      why: '韌性比成長更重要——系統能否在衝擊下自我修復？',
      action: '天災來襲時迅速補貼受衝擊產業，維持民心穩定。',
      progress: hasRandomShock ? clamp01(state.agents.filter(a => a.alive).length / 85) : 0,
      progressLabel: hasRandomShock ? `人口 ${state.agents.filter(a => a.alive).length}` : '等待天災',
      done: hasRandomShock && state.agents.filter(a => a.alive).length >= 85,
    },
    {
      id: 'service_economy',
      title: '建立服務經濟 (服務業 > 40%)',
      objective: '目標：服務業勞動力佔比 > 40%',
      why: '高附加價值的服務經濟是已開發國家的典型結構。',
      action: '穩定農業與工業後，讓市場自然引導勞動力轉移。',
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
      done: (() => {
        const alive = state.agents.filter(a => a.alive);
        return alive.length > 0 && alive.filter(a => a.sector === 'services').length / alive.length > 0.4;
      })(),
    },
    {
      id: 'dependency_control',
      title: '控制扶養比 (< 0.5) 20 回合',
      objective: '目標：扶養比持續 < 0.5',
      why: '人口結構是經濟的慢性根基，高扶養比會侵蝕成長動能。',
      action: '維持穩定的民心以降低離島率，保持勞動力比例。',
      progress: clamp01(dependency < 0.5 ? state.turn / 20 : 0),
      progressLabel: `扶養比 ${dependency.toFixed(2)}`,
      done: dependency < 0.5 && state.turn >= 20,
    },
    {
      id: 'policy_experiment',
      title: '完成一次控制實驗',
      objective: '目標：在模擬實驗室比較不同政策的結果',
      why: '科學精神的核心是對照實驗——用同一個種子碼跑不同政策路線。',
      action: '在模擬實驗室用相同種子碼跑兩局，對比不同策略的結果。',
      progress: clamp01(state.statistics.length > 0 ? 0.5 : 0),
      progressLabel: `歷史紀錄`,
      done: false, // Tracked externally by run history count
    },
    {
      id: 'balanced_growth',
      title: '平衡成長 (GDP↑ Gini↓ Sat↑)',
      objective: '目標：連續 5 回合 GDP 成長、Gini 下降、滿意度上升',
      why: '只有三指標同時改善，才算真正的可持續發展。',
      action: '精細調控政策組合，避免過度傾斜任何單一目標。',
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
    // --- Advanced Knowledge Nodes ---
    {
      id: 'monetary_transmission',
      title: '貨幣政策傳導機制',
      chain: '貨幣金融鏈',
      concept: '利率變化經由儲蓄、借貸、消費逐層傳導，影響實體經濟需時數回合。',
      gameSignal: `政策利率 ${(state.government.policyRate * 100).toFixed(1)}%，銀行存款總額 $${state.agents.filter(a => a.alive).reduce((s, a) => s + a.savings, 0).toFixed(0)}`,
      worldLink: '對照真實世界：Fed 升息後約 6-18 個月才傳導至就業與通膨。',
      nextPrompt: '調一次利率，追蹤 5 回合銀行存款與消費變化。',
      unlocked: state.government.policyRate !== 0.02 || state.turn >= 15,
    },
    {
      id: 'fiscal_sustainability',
      title: '財政可持續性',
      chain: '分配財政鏈',
      concept: '稅收、支出、國庫餘額三者必須長期平衡，否則政策空間會萎縮。',
      gameSignal: `國庫 $${treasury.toFixed(0)}，趨勢：${treasury > 500 ? '充裕' : treasury > 100 ? '可控' : '吃緊'}`,
      worldLink: '對照真實世界：長期財政赤字會推高公債利息，排擠公共投資。',
      nextPrompt: '嘗試在不增稅的前提下讓國庫連 10 回合正成長。',
      unlocked: treasury < 50 || (state.turn >= 20 && hasPolicyApplied),
    },
    {
      id: 'stagflation',
      title: '停滯性通膨 Stagflation',
      chain: '總體協調鏈',
      concept: '經濟停滯加上物價上漲，政策左右為難——刺激加劇通膨，緊縮加劇衰退。',
      gameSignal: (() => {
        if (!latest || !prev) return '尚未觸發';
        const gdpDown = latest.gdp < prev.gdp;
        const priceUp = maxPriceSwing > 0.05;
        return gdpDown && priceUp ? '可能正在經歷停滯性通膨！' : '目前未出現';
      })(),
      worldLink: '對照真實世界：1970s 石油危機後美國經歷典型停滯性通膨。',
      nextPrompt: '如果出現此情境，嘗試用供給側政策（補貼特定產業）而非純需求刺激來應對。',
      unlocked: (() => {
        if (!latest || !prev) return false;
        return (latest.gdp < prev.gdp && maxPriceSwing > 0.05) || state.turn >= 25;
      })(),
    },
    {
      id: 'dutch_disease',
      title: '荷蘭病 Dutch Disease',
      chain: '人口產業鏈',
      concept: '某一產業過度繁榮會吸走其他產業的勞動力，造成經濟結構失衡。',
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
      worldLink: '對照真實世界：荷蘭發現天然氣後製造業萎縮，委內瑞拉過度依賴石油。',
      nextPrompt: '如果某產業佔比 > 60%，嘗試用補貼引導分散化。',
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
      chain: '分配財政鏈',
      concept: '稅率太高反而降低稅收——因為經濟萎縮、人口外流，稅基消失。',
      gameSignal: `稅率 ${(taxRate * 100).toFixed(0)}%，國庫趨勢：${(() => {
        if (state.statistics.length < 3) return '--';
        const recent = state.statistics.slice(-3);
        const taxTrend = recent[recent.length - 1].causalReplay.policy.taxCollected - recent[0].causalReplay.policy.taxCollected;
        return taxTrend >= 0 ? '稅收上升' : '稅收下降';
      })()}`,
      worldLink: '對照真實世界：高稅率可能促使企業/人才外移至低稅地區。',
      nextPrompt: '試著把稅率調到 30% 以上，觀察 5 回合稅收是增是減。',
      unlocked: taxRate >= 0.25 || state.turn >= 22,
    },
  ];

  const coach = (() => {
    if (state.turn < 3) {
      return {
        phaseLabel: 'Phase 1｜建立基線',
        phaseGoal: '先看懂市場怎麼自己動，再動政策。',
        diagnosis: '你正在建立「沒有干預時，供需與價格自然變化」的觀察基線。',
        turnNarrative,
        actions: [
          {
            id: 'baseline_run',
            title: '先跑到第 3 回合',
            rationale: '太早改政策，會失去比較基準。',
            steps: [
              '先用慢速自動或手動前進，暫時不調任何滑桿。',
              '連看 3 回合的食物供需與價格變化。',
            ],
            expectedSignal: '你會看到價格跟短缺方向一致，建立第一個因果直覺。',
          },
        ],
        watchlist: [
          '食物覆蓋率（Supply / Demand）',
          '食物價格變化（是否連續上升）',
          '平均滿意度（是否開始下滑）',
        ],
        pitfall: '常見錯誤：第一回合就同時改稅率、補貼、福利，之後很難判斷是誰造成效果。',
        economicsLink: '經濟學核心是「先觀察訊號，再介入」，不是先猜結論。',
        keywords: ['供需', '價格訊號', '基線'],
      } satisfies LearningCoachBrief;
    }

    if (foodCoverage < 1) {
      return {
        phaseLabel: 'Phase 2｜民生穩定',
        phaseGoal: '先把基本需求補齊，再談成長。',
        diagnosis: `目前食物覆蓋率 ${fmtPct(Math.max(0, Math.min(1.8, foodCoverage))).replace('%', '')}% ，短缺正在放大民心壓力。`,
        turnNarrative,
        actions: [
          {
            id: 'food_patch',
            title: '優先補食物，不要同時大改三產業',
            rationale: '食物短缺會先打擊健康與滿意度，造成連鎖離島。',
            steps: [
              '把食物補貼提高 5%-10%。',
              '維持 2 回合觀察後再決定下一步。',
            ],
            expectedSignal: '食物覆蓋率接近或超過 100%，食物價格漲幅收斂。',
          },
          {
            id: 'tax_soften',
            title: '若民心下滑快，先小幅降稅 2%',
            rationale: '提高可支配所得可緩衝短缺造成的滿意度下滑。',
            steps: [
              '只調 1 次稅率，避免連續上下震盪。',
            ],
            expectedSignal: '平均滿意度跌幅縮小，人口流出壓力下降。',
          },
        ],
        watchlist: [
          '食物覆蓋率是否連續 2 回合 >= 100%',
          '平均滿意度是否停止快速下滑',
          '食物價格是否由急漲轉為平穩',
        ],
        pitfall: '常見錯誤：同時拉高所有補貼，短期看起來有效，國庫卻快速惡化。',
        economicsLink: '這是在學「稀缺管理」：先處理瓶頸資源，再談擴張。',
        keywords: ['稀缺', '民生優先', '供給瓶頸'],
      } satisfies LearningCoachBrief;
    }

    if (!hasPolicyRequested) {
      return {
        phaseLabel: 'Phase 3｜政策時滯',
        phaseGoal: '有意識地體驗「政策不是即時生效」。',
        diagnosis: '你已穩住基本盤，下一步是用一個單點政策做因果實驗。',
        turnNarrative,
        actions: [
          {
            id: 'single_policy',
            title: '只下達 1 個政策，觀察完整 3 回合',
            rationale: '一次只改一個變數，才能知道因果方向。',
            steps: [
              '在政策面板選「稅率」或「單一產業補貼」其中一個。',
              '下達後至少看 3 回合，不要中途再加碼。',
            ],
            expectedSignal: '你會在政策時間線看到「待生效 → 已生效」，並在因果回放看到傳導。',
          },
        ],
        watchlist: [
          '政策時間線狀態',
          '滿意度/國庫/GDP 的方向變化',
          '人均可支配現金 Δ',
        ],
        pitfall: '常見錯誤：政策還沒生效就反向操作，造成「政策打架」。',
        economicsLink: '這是在學公共政策的「時滯與預期管理」。',
        keywords: ['政策時滯', '因果識別', '單一變數'],
      } satisfies LearningCoachBrief;
    }

    if (avgSat < 60 || gini > 0.42) {
      const satIssue = avgSat < 60;
      const equityIssue = gini > 0.42;
      return {
        phaseLabel: 'Phase 4｜成長與公平平衡',
        phaseGoal: '在不犧牲系統穩定下，修復民心與分配。',
        diagnosis: [
          satIssue ? `平均滿意度 ${avgSat.toFixed(1)} 偏低` : '',
          equityIssue ? `Gini ${gini.toFixed(3)} 偏高` : '',
        ].filter(Boolean).join('，') + '。',
        turnNarrative,
        actions: [
          {
            id: 'social_mix',
            title: '啟用或維持福利，搭配小幅稅率微調',
            rationale: '先補底層購買力，再看財政承受度調整。',
            steps: [
              '福利先開，觀察 2 回合。',
              '若國庫壓力大，再把稅率上調 1%-2%。',
            ],
            expectedSignal: '滿意度回升、離島壓力下降，國庫不會瞬間失控。',
          },
          {
            id: 'sector_focus',
            title: '找出短缺最嚴重產業做精準補貼',
            rationale: '廣撒補貼效率低，且容易製造財政負擔。',
            steps: [
              '從市場面板找 supply/demand 缺口最大的產業。',
              '僅提高該產業補貼 5%，其餘先不動。',
            ],
            expectedSignal: '缺口收斂且價格波動降低，滿意度修復更穩定。',
          },
        ],
        watchlist: [
          '平均滿意度是否回到 60+',
          'Gini 是否回落到 0.42 以下',
          '國庫淨變化是否維持可持續',
        ],
        pitfall: '常見錯誤：只追 GDP，忽略分配惡化，最後民心和留島率一起崩。',
        economicsLink: '這是在學經典取捨：效率、公平、穩定三者難以同時極大化。',
        keywords: ['效率 vs 公平', '分配', '社會穩定'],
      } satisfies LearningCoachBrief;
    }

    // Phase 5: intermediate — first 25 turns after passing phase 4
    if (state.turn < 25) {
      return {
        phaseLabel: 'Phase 5｜系統治理與反事實',
        phaseGoal: '從單點調參升級成可驗證的政策路線。',
        diagnosis: '你已跨過新手期，建議改用「小步、可比較、可回顧」的實驗式治理。',
        turnNarrative,
        actions: [
          {
            id: 'one_knob',
            title: '固定 5 回合只調 1 個政策旋鈕',
            rationale: '維持可比較性，避免混合干擾。',
            steps: [
              '先選一個主目標（成長/公平/穩定）。',
              '只動一個政策，觀察完整窗口。',
            ],
            expectedSignal: '因果回放會更乾淨，決策準確度大幅提升。',
          },
          {
            id: 'counterfactual_note',
            title: '每 5 回合記錄一次「若不做這步會怎樣」',
            rationale: '建立反事實思維，才是真正的經濟治理能力。',
            steps: [
              '在心中設定對照組：維持原政策不變。',
              '比較兩者對滿意度/GDP/Gini 的差異。',
            ],
            expectedSignal: '你會更快找到對當前局勢最有效的政策組合。',
          },
        ],
        watchlist: [
          'GDP、Gini、滿意度三指標是否同時可接受',
          '政策時間線是否過度擁塞',
          '隨機衝擊下系統恢復速度',
        ],
        pitfall: '常見錯誤：指標好轉就連續加碼，反而讓系統過熱後反噬。',
        economicsLink: '這是在學總體政策協調與韌性治理，接近真實世界決策節奏。',
        keywords: ['政策組合', '反事實', '韌性'],
      } satisfies LearningCoachBrief;
    }

    // Phase 6: advanced macro — monetary + fiscal coordination
    const hasUsedMonetary = state.government.policyRate !== 0.02 || state.government.liquiditySupportActive;
    if (state.turn < 40 || !hasUsedMonetary) {
      return {
        phaseLabel: 'Phase 6｜進階總體經濟',
        phaseGoal: '掌握貨幣與財政政策的協調，應對複合衝擊。',
        diagnosis: (() => {
          const parts: string[] = [];
          if (!hasUsedMonetary) parts.push('尚未使用貨幣政策工具（利率/流動性支援）');
          if (treasury < 200) parts.push(`國庫 $${treasury.toFixed(0)} 偏緊`);
          if (gini > 0.38) parts.push(`Gini ${gini.toFixed(3)} 仍偏高`);
          return parts.length > 0 ? parts.join('；') + '。' : '系統運行穩定，可嘗試更進階的政策組合。';
        })(),
        turnNarrative,
        actions: [
          {
            id: 'monetary_experiment',
            title: '用利率調節儲蓄與消費行為',
            rationale: '貨幣政策透過利率影響借貸與消費意願，是總體穩定的第二支柱。',
            steps: [
              '把政策利率調高 0.5%，觀察 3 回合銀行存款變化。',
              '再調回原位，比較消費與價格的反應速度。',
            ],
            expectedSignal: '升息後消費減緩、存款增加；降息後相反。注意傳導有 1-2 回合延遲。',
          },
          {
            id: 'fiscal_monetary_mix',
            title: '財政+貨幣雙管齊下',
            rationale: '真實央行與財政部門需要協調——同方向強化效果，反方向則互相抵消。',
            steps: [
              '在經濟衰退時同時降息 + 增加補貼，觀察 GDP 與通膨。',
              '在過熱時同時升息 + 減少補貼，觀察是否軟著陸。',
            ],
            expectedSignal: '雙管齊下效果更快但風險更高，需密切監控物價穩定。',
          },
        ],
        watchlist: [
          '利率調整後 1-3 回合的消費/存款變化',
          '財政赤字是否在可控範圍（國庫不連續大幅下降）',
          '通膨與就業的同步走勢（Phillips 曲線效應）',
        ],
        pitfall: '常見錯誤：貨幣寬鬆+財政擴張同時全開，短期繁榮但很快過熱崩盤。',
        economicsLink: '這是在學 IS-LM 模型的直覺：財政移 IS、貨幣移 LM，要看哪條先碰壁。',
        keywords: ['貨幣政策', '利率傳導', 'IS-LM', '政策協調'],
      } satisfies LearningCoachBrief;
    }

    // Phase 7: system mastery — long-run structural governance
    return {
      phaseLabel: 'Phase 7｜系統大師',
      phaseGoal: '從政策操作者升級為制度設計者，追求長期可持續發展。',
      diagnosis: (() => {
        const alive = state.agents.filter(a => a.alive).length;
        const gdpPerCap = latest ? latest.gdp / Math.max(1, alive) : 0;
        return `人口 ${alive}，人均 GDP $${gdpPerCap.toFixed(0)}，Gini ${gini.toFixed(3)}。你已掌握基本工具，現在挑戰長期韌性。`;
      })(),
      turnNarrative,
      actions: [
        {
          id: 'structural_design',
          title: '設計 20 回合永續治理路線',
          rationale: '從回合制反應升級成前瞻規劃，預判衝擊而非被動應對。',
          steps: [
            '設定明確目標：GDP 年增率、Gini 上限、人口下限。',
            '規劃各階段的政策組合與切換時機。',
            '遇到衝擊時微調而非全盤推翻。',
          ],
          expectedSignal: '20 回合後三大指標（GDP/Gini/滿意度）波動幅度明顯縮小。',
        },
        {
          id: 'anti_fragile',
          title: '測試系統反脆弱性',
          rationale: '好的制度不是避免衝擊，而是讓衝擊反而強化系統。',
          steps: [
            '故意在穩定期降低補貼，測試經濟自主恢復能力。',
            '遭遇天災後觀察恢復速度，比較有/無預備金的差異。',
          ],
          expectedSignal: '系統能在 3-5 回合內自行回穩，不需要持續高強度干預。',
        },
        {
          id: 'comparative_systems',
          title: '比較不同治理路線',
          rationale: '制度差異是各國經濟表現分化的根本原因。',
          steps: [
            '用模擬實驗室分別測試：高稅高福利 vs 低稅低干預。',
            '記錄各路線 30 回合的 GDP、Gini、人口曲線。',
          ],
          expectedSignal: '你會發現沒有「最優制度」，只有「最適當下」的制度選擇。',
        },
      ],
      watchlist: [
        '長期趨勢線（20 回合滑動平均）是否穩定向好',
        '衝擊後恢復速度是否越來越快',
        '政策干預頻率是否減少（制度自動穩定器發揮作用）',
      ],
      pitfall: '常見錯誤：追求完美均衡——真實經濟永遠在動態調整中，接受適度波動是成熟治理的標誌。',
      economicsLink: '這是在學制度經濟學與長期發展理論：制度 > 政策 > 個別決策。',
      keywords: ['制度設計', '反脆弱', '長期發展', '比較制度'],
    } satisfies LearningCoachBrief;
  })();

  return { coach, quests, knowledgeNodes };
}
