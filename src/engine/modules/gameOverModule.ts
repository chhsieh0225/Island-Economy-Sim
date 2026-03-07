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
import { te } from '../engineI18n';
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
  if (share >= 45) return 'dominant';
  if (share >= 33) return 'mature';
  if (share >= 20) return 'growth';
  if (share >= 10) return 'initial';
  return 'weak';
}

function getSectorDevelopmentComment(sector: SectorType, level: SectorDevelopmentLevel): string {
  return te(`gameover.comment.${sector}.${level}`);
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
    return [te('gameover.counterfactual.noData')];
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
      te('gameover.counterfactual.taxCut', {
        taxCut,
        from: taxPct.toFixed(0),
        to: Math.max(0, taxPct - taxCut).toFixed(0),
        relief: taxRelief.toFixed(1),
        leaveRate: leaveRate.toFixed(1),
      }),
    );
  }

  const foodDemand = latest.market.demand.food;
  const foodSupply = latest.market.supply.food;
  const foodGapRatio = foodDemand > 0 ? Math.max(0, (foodDemand - foodSupply) / foodDemand) : 0;
  if (foodGapRatio > 0.1) {
    const satLift = Math.min(7.5, 2 + foodGapRatio * 10);
    notes.push(te('gameover.counterfactual.foodGap', { satLift: satLift.toFixed(1) }));
  }

  if (!latest.government.welfareEnabled && latest.giniCoefficient > 0.44) {
    const giniDrop = Math.min(0.08, 0.02 + (latest.giniCoefficient - 0.44) * 0.35);
    notes.push(te('gameover.counterfactual.welfare', { giniDrop: giniDrop.toFixed(3) }));
  }

  if (notes.length === 0) {
    notes.push(te('gameover.counterfactual.balanced'));
  }

  return notes.slice(0, 3);
}

function buildReflectiveQuestions(history: TurnSnapshot[]): ReflectiveQuestion[] {
  const latest = history[history.length - 1];
  const questions: ReflectiveQuestion[] = [];

  const gini = latest?.giniCoefficient ?? 0;
  const countryKey = gini < 0.3 ? 'nordic' : gini < 0.35 ? 'taiwan' : gini < 0.4 ? 'usa' : gini < 0.45 ? 'brazil' : 'southAfrica';
  const country = te(`gameover.reflect.country.${countryKey}`);
  questions.push({
    question: te('gameover.reflect.giniQuestion', { gini: gini.toFixed(2), country }),
    context: te('gameover.reflect.giniContext'),
    realWorldComparison: te('gameover.reflect.giniComparison'),
  });

  const avgTax = history.reduce((s, h) => s + h.government.taxRate, 0) / Math.max(1, history.length);
  questions.push({
    question: te('gameover.reflect.taxQuestion', { avgTax: (avgTax * 100).toFixed(0) }),
    context: te('gameover.reflect.taxContext'),
    realWorldComparison: te('gameover.reflect.taxComparison'),
  });

  return questions.slice(0, 2);
}

function generateNarrative(agent: Agent): string {
  let text = te('gameover.narrative.header', { name: agent.name, iq: agent.intelligence });
  const jobs = agent.lifeEvents.filter(e => e.category === 'job');
  const achievements = agent.lifeEvents.filter(e => e.category === 'achievement');
  if (jobs.length > 0) text += te('gameover.narrative.jobs', { count: jobs.length });
  if (achievements.length > 0) text += te('gameover.narrative.achievements', { count: achievements.length });
  text += te('gameover.narrative.wealth', { money: agent.money.toFixed(0) });
  if (!agent.alive) {
    const causeKey = agent.causeOfDeath === 'age' ? 'age' : agent.causeOfDeath === 'health' ? 'health' : 'left';
    text += te(`gameover.narrative.death.${causeKey}`, { age: Math.floor(agent.age / 12) });
  } else {
    text += te('gameover.narrative.alive', { age: Math.floor(agent.age / 12) });
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
    title: te('gameover.bio.richest'),
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
      title: te('gameover.bio.oldest'),
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
      title: te('gameover.bio.switcher'),
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
  rankings.push({ category: 'wealth', label: te('gameover.ranking.wealth'), agentName: richest.name, value: `$${richest.money.toFixed(0)}` });
  const oldest = agents.reduce((b, a) => a.age > b.age ? a : b);
  rankings.push({ category: 'age', label: te('gameover.ranking.age'), agentName: oldest.name, value: te('gameover.ranking.ageValue', { age: Math.floor(oldest.age / 12) }) });
  const switcher = agents.reduce((b, a) => a.totalSwitches > b.totalSwitches ? a : b);
  if (switcher.totalSwitches > 0) {
    rankings.push({ category: 'career', label: te('gameover.ranking.career'), agentName: switcher.name, value: te('gameover.ranking.careerValue', { count: switcher.totalSwitches }) });
  }
  const smartest = agents.reduce((b, a) => a.intelligence > b.intelligence ? a : b);
  rankings.push({ category: 'iq', label: te('gameover.ranking.iq'), agentName: smartest.name, value: `IQ ${smartest.intelligence}` });
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
