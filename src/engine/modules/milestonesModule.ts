import type { MilestoneRecord } from '../../types';
import type { Agent } from '../Agent';
import { te } from '../engineI18n';

function hasRecentIncomeStreak(agent: Agent, turns: number, threshold: number): boolean {
  if (agent.incomeHistory.length < turns) return false;
  const recent = agent.incomeHistory.slice(-turns);
  return recent.every(v => v >= threshold);
}

export function evaluateMilestones({
  turn,
  aliveAgents,
  milestoneFlags,
}: {
  turn: number;
  aliveAgents: Agent[];
  milestoneFlags: Set<string>;
}): MilestoneRecord[] {
  if (aliveAgents.length === 0) return [];

  const records: MilestoneRecord[] = [];

  const richest = aliveAgents.reduce((best, a) => (a.money > best.money ? a : best), aliveAgents[0]);
  const wealthMilestones = [
    { threshold: 1_000, labelKey: 'milestone.wealth1k' },
    { threshold: 10_000, labelKey: 'milestone.wealth10k' },
    { threshold: 1_000_000, labelKey: 'milestone.wealth1m' },
  ];
  for (const milestone of wealthMilestones) {
    const key = `wealth_${milestone.threshold}`;
    if (!milestoneFlags.has(key) && richest.money >= milestone.threshold) {
      milestoneFlags.add(key);
      records.push({
        id: key,
        turn,
        kind: 'wealth',
        title: te(milestone.labelKey),
        description: te('milestone.wealth.desc', {
          name: richest.name,
          threshold: milestone.threshold.toLocaleString(),
          current: richest.money.toFixed(0),
        }),
        agentId: richest.id,
      });
    }
  }

  const smartest = aliveAgents.reduce(
    (best, a) => (a.intelligence > best.intelligence ? a : best),
    aliveAgents[0],
  );
  if (!milestoneFlags.has('super_genius') && smartest.intelligence >= 135) {
    milestoneFlags.add('super_genius');
    records.push({
      id: 'super_genius',
      turn,
      kind: 'talent',
      title: te('milestone.superGenius'),
      description: te('milestone.superGenius.desc', { name: smartest.name, iq: smartest.intelligence }),
      agentId: smartest.id,
    });
  }

  const oldest = aliveAgents.reduce((best, a) => (a.age > best.age ? a : best), aliveAgents[0]);
  const ageMilestones = [
    { turns: 720, labelKey: 'milestone.age60', ageYears: 60 },
    { turns: 900, labelKey: 'milestone.age75', ageYears: 75 },
  ];
  for (const milestone of ageMilestones) {
    const key = `age_${milestone.turns}`;
    if (!milestoneFlags.has(key) && oldest.age >= milestone.turns) {
      milestoneFlags.add(key);
      records.push({
        id: key,
        turn,
        kind: 'longevity',
        title: te(milestone.labelKey),
        description: te('milestone.age.desc', { name: oldest.name, age: milestone.ageYears }),
        agentId: oldest.id,
      });
    }
  }

  const switchKing = aliveAgents.reduce(
    (best, a) => (a.totalSwitches > best.totalSwitches ? a : best),
    aliveAgents[0],
  );
  const switchMilestones = [3, 6];
  for (const threshold of switchMilestones) {
    const key = `switch_${threshold}`;
    if (!milestoneFlags.has(key) && switchKing.totalSwitches >= threshold) {
      milestoneFlags.add(key);
      records.push({
        id: key,
        turn,
        kind: 'career',
        title: te('milestone.switchKing'),
        description: te('milestone.switchKing.desc', { name: switchKing.name, count: switchKing.totalSwitches }),
        agentId: switchKing.id,
      });
    }
  }

  const familyTotals = new Map<number, { wealth: number; members: Agent[] }>();
  for (const agent of aliveAgents) {
    const current = familyTotals.get(agent.familyId);
    if (current) {
      current.wealth += agent.money;
      current.members.push(agent);
    } else {
      familyTotals.set(agent.familyId, { wealth: agent.money, members: [agent] });
    }
  }
  const richestFamily = [...familyTotals.entries()].reduce((best, entry) => (
    !best || entry[1].wealth > best[1].wealth ? entry : best
  ), null as [number, { wealth: number; members: Agent[] }] | null);

  if (richestFamily) {
    const familyMilestones = [5000, 20000];
    for (const threshold of familyMilestones) {
      const key = `family_wealth_${threshold}`;
      if (!milestoneFlags.has(key) && richestFamily[1].wealth >= threshold) {
        milestoneFlags.add(key);
        const representative = richestFamily[1].members.reduce(
          (best, a) => (a.money > best.money ? a : best),
          richestFamily[1].members[0],
        );
        records.push({
          id: key,
          turn,
          kind: 'family',
          title: te('milestone.familyRise'),
          description: te('milestone.familyRise.desc', {
            name: representative.name,
            familyId: richestFamily[0],
            threshold: threshold.toLocaleString(),
          }),
          agentId: representative.id,
          familyId: richestFamily[0],
        });
      }
    }
  }

  const immortalCandidate = aliveAgents.find(a => a.age >= 720 && a.health >= 92);
  if (immortalCandidate && !milestoneFlags.has('immortal_legend')) {
    milestoneFlags.add('immortal_legend');
    records.push({
      id: 'immortal_legend',
      turn,
      kind: 'longevity',
      title: te('milestone.immortalLegend'),
      description: te('milestone.immortalLegend.desc', {
        name: immortalCandidate.name,
        age: Math.floor(immortalCandidate.age / 12),
        health: immortalCandidate.health.toFixed(0),
      }),
      agentId: immortalCandidate.id,
    });
  }

  const workerModel = aliveAgents.find(agent => hasRecentIncomeStreak(agent, 5, 90));
  if (workerModel && !milestoneFlags.has('worker_model')) {
    milestoneFlags.add('worker_model');
    records.push({
      id: 'worker_model',
      turn,
      kind: 'work',
      title: te('milestone.workerModel'),
      description: te('milestone.workerModel.desc', { name: workerModel.name }),
      agentId: workerModel.id,
    });
  }

  return records;
}
