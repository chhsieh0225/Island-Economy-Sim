import { CONFIG } from '../../config';
import {
  SECTORS,
  type AgentBiography,
  type BestOfRanking,
  type GameOverReason,
  type GameOverState,
  type ReflectiveQuestion,
  type SectorDevelopmentLevel,
  type SectorType,
  type TurnSnapshot,
} from '../../types';
import type { Agent } from '../Agent';
import { computeScore } from '../Scoring';

export function deriveGameOverReason({
  aliveCount,
  cumulativeGdp,
  treasury,
  turn,
}: {
  aliveCount: number;
  cumulativeGdp: number;
  treasury: number;
  turn: number;
}): GameOverReason | null {
  if (aliveCount === 0) return 'all_dead';
  if (cumulativeGdp >= CONFIG.VICTORY_GDP_THRESHOLD) return 'gdp_victory';
  if (treasury >= CONFIG.VICTORY_TREASURY_THRESHOLD) return 'treasury_victory';
  if (turn >= CONFIG.MAX_TURNS) return 'max_turns';
  return null;
}

function classifySectorDevelopment(share: number): SectorDevelopmentLevel {
  if (share >= 45) return '主導';
  if (share >= 33) return '成熟';
  if (share >= 20) return '成長';
  if (share >= 10) return '起步';
  return '薄弱';
}

function getSectorDevelopmentComment(sector: SectorType, level: SectorDevelopmentLevel): string {
  const comments: Record<SectorType, Record<SectorDevelopmentLevel, string>> = {
    food: {
      薄弱: '糧食基礎不足，遇到衝擊時風險偏高。',
      起步: '糧食供給剛起步，仍需擴大生產能力。',
      成長: '糧食體系逐步穩定，已具備基本支撐力。',
      成熟: '糧食供應成熟，對人口承載較有保障。',
      主導: '糧食產業高度主導，安全盤穩但結構較單一。',
    },
    goods: {
      薄弱: '製造產能偏弱，實體經濟擴張受限。',
      起步: '工坊與生產鏈剛建立，仍在打底階段。',
      成長: '製造部門穩定成長，帶動交易活力。',
      成熟: '商品產業成熟，是經濟增長的重要引擎。',
      主導: '商品業高度集中，效率高但波動風險上升。',
    },
    services: {
      薄弱: '服務供給不足，生活品質與消費偏弱。',
      起步: '服務業剛形成，內需體驗還在建立。',
      成長: '服務業穩步發展，內需韌性逐漸提升。',
      成熟: '服務網絡成熟，居民福祉與交易體驗良好。',
      主導: '服務業主導結構，內需強勁但實體供應需平衡。',
    },
  };
  return comments[sector][level];
}

function buildSectorDevelopment(history: TurnSnapshot[]): GameOverState['finalStats']['sectorDevelopment'] {
  const latest = history[history.length - 1];
  const distribution: Record<SectorType, number> = latest?.jobDistribution ?? {
    food: 0,
    goods: 0,
    services: 0,
  };
  const total = Math.max(1, distribution.food + distribution.goods + distribution.services);

  const result = {} as GameOverState['finalStats']['sectorDevelopment'];
  for (const sector of SECTORS) {
    const share = (distribution[sector] / total) * 100;
    const level = classifySectorDevelopment(share);
    result[sector] = {
      share,
      level,
      comment: getSectorDevelopmentComment(sector, level),
    };
  }
  return result;
}

function buildCounterfactualNotes(history: TurnSnapshot[], agents: Agent[]): string[] {
  const latest = history[history.length - 1];
  if (!latest) {
    return ['資料不足，建議先運行數回合再比較政策反事實。'];
  }

  const notes: string[] = [];
  const taxPct = latest.government.taxRate * 100;
  const totalPopulationSeen = Math.max(1, agents.length);
  const leftCount = agents.filter(a => a.causeOfDeath === 'left').length;
  const leaveRate = (leftCount / totalPopulationSeen) * 100;

  if (taxPct >= 12) {
    const taxCut = 5;
    const taxRelief = Math.max(1, (taxPct - 10) * 0.18 + latest.giniCoefficient * 3.2);
    notes.push(
      `若稅率下調 ${taxCut}%（${taxPct.toFixed(0)}% → ${Math.max(0, taxPct - taxCut).toFixed(0)}%），估計離島率可減少約 ${taxRelief.toFixed(1)}%（現況約 ${leaveRate.toFixed(1)}%）。`,
    );
  }

  const foodDemand = latest.market.demand.food;
  const foodSupply = latest.market.supply.food;
  const foodGapRatio = foodDemand > 0 ? Math.max(0, (foodDemand - foodSupply) / foodDemand) : 0;
  if (foodGapRatio > 0.1) {
    const satLift = Math.min(7.5, 2 + foodGapRatio * 10);
    notes.push(`若把食物缺口補回一半，估計平均滿意度可回升約 ${satLift.toFixed(1)}%。`);
  }

  if (!latest.government.welfareEnabled && latest.giniCoefficient > 0.44) {
    const giniDrop = Math.min(0.08, 0.02 + (latest.giniCoefficient - 0.44) * 0.35);
    notes.push(`若啟用福利並持續 12 回合，估計基尼可下降約 ${giniDrop.toFixed(3)}。`);
  }

  if (notes.length === 0) {
    notes.push('現況結構相對平衡：可用稅率或補貼 ±5% 做對照實驗，觀察中期差異。');
  }

  return notes.slice(0, 3);
}

function buildReflectiveQuestions(history: TurnSnapshot[]): ReflectiveQuestion[] {
  const latest = history[history.length - 1];
  const questions: ReflectiveQuestion[] = [];

  const gini = latest?.giniCoefficient ?? 0;
  const country = gini < 0.3 ? '北歐國家' : gini < 0.35 ? '台灣' : gini < 0.4 ? '美國' : gini < 0.45 ? '巴西' : '南非';
  questions.push({
    question: `你的島嶼 Gini=${gini.toFixed(2)}，接近${country}的水平。你覺得不平等是經濟成長的必然代價嗎？`,
    context: '基尼係數反映財富分配不均的程度。現實中各國選擇了不同的平衡點。',
    realWorldComparison: '台灣≈0.34, 美國≈0.39, 北歐≈0.27, 巴西≈0.48',
  });

  const avgTax = history.reduce((s, h) => s + h.government.taxRate, 0) / Math.max(1, history.length);
  questions.push({
    question: `你的平均稅率是 ${(avgTax * 100).toFixed(0)}%。高稅率能支撐更多公共服務，但是否壓抑了經濟活力？`,
    context: '這是經濟學中「效率 vs 公平」的經典取捨。',
    realWorldComparison: '北歐稅率約 45-55%, 美國約 25-35%, 香港約 15%',
  });

  return questions.slice(0, 2);
}

function generateNarrative(agent: Agent): string {
  let text = `${agent.name}（IQ ${agent.intelligence}）`;
  const jobs = agent.lifeEvents.filter(e => e.category === 'job');
  const achievements = agent.lifeEvents.filter(e => e.category === 'achievement');
  if (jobs.length > 0) text += `，歷經 ${jobs.length} 次轉職`;
  if (achievements.length > 0) text += `，獲得 ${achievements.length} 項成就`;
  text += `，最終累積財富 $${agent.money.toFixed(0)}`;
  if (!agent.alive) {
    const cause = agent.causeOfDeath === 'age' ? '壽終正寢' : agent.causeOfDeath === 'health' ? '因病離世' : '離開了小島';
    text += `。${Math.floor(agent.age / 12)} 歲時${cause}。`;
  } else {
    text += `。至今仍健在（${Math.floor(agent.age / 12)} 歲）。`;
  }
  return text;
}

function buildAgentBiographies(agents: Agent[]): AgentBiography[] {
  const biographies: AgentBiography[] = [];
  if (agents.length === 0) return biographies;

  const richest = agents.reduce((b, a) => a.money > b.money ? a : b);
  biographies.push({
    agentId: richest.id,
    name: richest.name,
    title: '💰 最富有的島民',
    narrative: generateNarrative(richest),
    highlights: richest.lifeEvents
      .filter(e => e.category === 'achievement' || e.category === 'job')
      .slice(-3)
      .map(e => e.message),
  });

  const oldest = agents.reduce((b, a) => a.age > b.age ? a : b);
  if (oldest.id !== richest.id) {
    biographies.push({
      agentId: oldest.id,
      name: oldest.name,
      title: '🎂 最年長的島民',
      narrative: generateNarrative(oldest),
      highlights: oldest.lifeEvents
        .filter(e => e.category === 'achievement' || e.category === 'job')
        .slice(-3)
        .map(e => e.message),
    });
  }

  const switcher = agents.reduce((b, a) => a.totalSwitches > b.totalSwitches ? a : b);
  if (switcher.totalSwitches >= 2 && switcher.id !== richest.id && switcher.id !== oldest.id) {
    biographies.push({
      agentId: switcher.id,
      name: switcher.name,
      title: '🔄 最多轉職的島民',
      narrative: generateNarrative(switcher),
      highlights: switcher.lifeEvents
        .filter(e => e.category === 'achievement' || e.category === 'job')
        .slice(-3)
        .map(e => e.message),
    });
  }

  return biographies;
}

function buildBestOfRankings(agents: Agent[]): BestOfRanking[] {
  const rankings: BestOfRanking[] = [];
  if (agents.length === 0) return rankings;

  const richest = agents.reduce((b, a) => a.money > b.money ? a : b);
  rankings.push({ category: 'wealth', label: '💰 最富有', agentName: richest.name, value: `$${richest.money.toFixed(0)}` });
  const oldest = agents.reduce((b, a) => a.age > b.age ? a : b);
  rankings.push({ category: 'age', label: '🎂 最長壽', agentName: oldest.name, value: `${Math.floor(oldest.age / 12)} 歲` });
  const switcher = agents.reduce((b, a) => a.totalSwitches > b.totalSwitches ? a : b);
  if (switcher.totalSwitches > 0) {
    rankings.push({ category: 'career', label: '🔄 最多轉職', agentName: switcher.name, value: `${switcher.totalSwitches} 次` });
  }
  const smartest = agents.reduce((b, a) => a.intelligence > b.intelligence ? a : b);
  rankings.push({ category: 'iq', label: '🧠 最聰明', agentName: smartest.name, value: `IQ ${smartest.intelligence}` });
  return rankings;
}

export function buildGameOverState({
  reason,
  turn,
  history,
  agents,
}: {
  reason: GameOverReason;
  turn: number;
  history: TurnSnapshot[];
  agents: Agent[];
}): GameOverState {
  return {
    reason,
    turn,
    score: computeScore(history),
    finalStats: {
      peakPopulation: history.length > 0 ? Math.max(...history.map(h => h.population)) : 0,
      totalBirths: history.reduce((s, h) => s + h.births, 0),
      totalDeaths: history.reduce((s, h) => s + h.deaths, 0),
      peakGdp: history.length > 0 ? Math.max(...history.map(h => h.gdp)) : 0,
      avgSatisfaction: history.length > 0
        ? history.reduce((s, h) => s + h.avgSatisfaction, 0) / history.length : 0,
      avgHealth: history.length > 0
        ? history.reduce((s, h) => s + h.avgHealth, 0) / history.length : 0,
      sectorDevelopment: buildSectorDevelopment(history),
      counterfactualNotes: buildCounterfactualNotes(history, agents),
      reflectiveQuestions: buildReflectiveQuestions(history),
      agentBiographies: buildAgentBiographies(agents),
      bestOfRankings: buildBestOfRankings(agents),
    },
  };
}
