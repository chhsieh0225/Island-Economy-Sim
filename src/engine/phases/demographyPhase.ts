import { CONFIG } from '../../config';
import type { GameEvent } from '../../types';
import type { Agent } from '../Agent';
import type { RNG } from '../RNG';

interface LifeDeathPhaseInput {
  turn: number;
  agents: Agent[];
  allAgents: Agent[];
  rng: RNG;
  createNewAgent: (familyId?: number, ageTurns?: number, bornOnIsland?: boolean) => Agent;
  addEvent: (type: GameEvent['type'], message: string) => void;
}

interface AgingPhaseInput {
  turn: number;
  agents: Agent[];
  addEvent: (type: GameEvent['type'], message: string) => void;
}

export interface DemographyPhaseSummary {
  births: number;
  deaths: number;
  deathByCause: {
    age: number;
    health: number;
    left: number;
  };
}

export function runAgingPhase({ turn, agents, addEvent }: AgingPhaseInput): void {
  for (const agent of agents) {
    const wasMinor = agent.age < CONFIG.WORKING_AGE;
    agent.ageOneTurn();
    if (wasMinor && agent.age >= CONFIG.WORKING_AGE) {
      agent.addLifeEvent(turn, 'join', '成年並開始投入勞動市場。', 'positive');
      addEvent('info', `${agent.name} 已成年，正式加入勞動市場。`);
    }
  }
}

export function runLifeDeathPhase({
  turn,
  agents,
  allAgents,
  rng,
  createNewAgent,
  addEvent,
}: LifeDeathPhaseInput): DemographyPhaseSummary {
  let deaths = 0;
  const deathByCause = { age: 0, health: 0, left: 0 };
  const leaveCandidates: Agent[] = [];

  for (const agent of agents) {
    if (!agent.alive) continue;

    if (agent.isOld) {
      agent.alive = false;
      agent.causeOfDeath = 'age';
      agent.addLifeEvent(turn, 'death', `於 ${Math.floor(agent.age / 12)} 歲因年老去世。`, 'warning');
      deaths++;
      deathByCause.age++;
      addEvent('warning', `${agent.name} 因年老去世 (${Math.floor(agent.age / 12)} 歲)。`);
    } else if (agent.isDead) {
      agent.alive = false;
      agent.causeOfDeath = 'health';
      agent.addLifeEvent(turn, 'death', '因健康不佳去世。', 'critical');
      deaths++;
      deathByCause.health++;
      addEvent('critical', `${agent.name} 因健康不佳而死亡。`);
    } else if (agent.age >= CONFIG.WORKING_AGE && agent.shouldLeave) {
      leaveCandidates.push(agent);
    }
  }

  if (leaveCandidates.length > 0) {
    for (let i = leaveCandidates.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i);
      const tmp = leaveCandidates[i];
      leaveCandidates[i] = leaveCandidates[j];
      leaveCandidates[j] = tmp;
    }

    const aliveAfterNonLeaveDeaths = allAgents.filter(a => a.alive).length;
    const leaveCap = Math.max(1, Math.ceil(aliveAfterNonLeaveDeaths * CONFIG.LEAVE_MAX_SHARE_PER_TURN));
    let leftThisTurn = 0;

    for (const agent of leaveCandidates) {
      if (!agent.alive) continue;
      if (leftThisTurn >= leaveCap) break;
      if (rng.next() >= agent.leaveProbability) continue;

      agent.alive = false;
      agent.causeOfDeath = 'left';
      agent.addLifeEvent(turn, 'leave', '對小島失去信心，選擇離開。', 'warning');
      deaths++;
      deathByCause.left++;
      leftThisTurn++;
      addEvent('warning', `${agent.name} 因不滿離開了小島。`);
    }

    if (leaveCandidates.length > leaveCap && leftThisTurn >= leaveCap) {
      addEvent('warning', '本回合出現離島潮，但已由交通與行政容量限制住瞬間外流規模。');
    }
  }

  const aliveAgents = allAgents.filter(a => a.alive);
  const aliveCount = aliveAgents.length;
  const reproductiveAdults = aliveAgents.filter(
    a => a.gender === 'F' && a.age >= CONFIG.BIRTH_MIN_REPRO_AGE && a.age <= CONFIG.BIRTH_MAX_REPRO_AGE
  );

  const capacityFactor = Math.max(0, 1 - aliveCount / CONFIG.BIRTH_CAPACITY_FACTOR);
  const reproRatio = reproductiveAdults.length / Math.max(1, aliveCount);

  // Economic fertility modifier: satisfaction influences birth willingness
  // sat >= neutral → up to MAX_MULT; sat << neutral → down to MIN_MULT
  const avgSat = aliveCount > 0
    ? aliveAgents.reduce((s, a) => s + a.satisfaction, 0) / aliveCount
    : CONFIG.BIRTH_SATISFACTION_NEUTRAL;
  const satDelta = avgSat - CONFIG.BIRTH_SATISFACTION_NEUTRAL;
  const satRange = satDelta >= 0
    ? (100 - CONFIG.BIRTH_SATISFACTION_NEUTRAL)
    : CONFIG.BIRTH_SATISFACTION_NEUTRAL;
  const satNorm = satRange > 0 ? satDelta / satRange : 0; // −1 … +1
  const satMult = satNorm >= 0
    ? 1 + satNorm * (CONFIG.BIRTH_SATISFACTION_MAX_MULT - 1)
    : 1 + satNorm * (1 - CONFIG.BIRTH_SATISFACTION_MIN_MULT);

  const birthProb = Math.min(1, Math.max(0,
    CONFIG.BIRTH_BASE_PROBABILITY * reproRatio * capacityFactor * satMult
  ));

  let births = 0;
  for (let i = 0; i < 5; i++) {
    if (births >= CONFIG.BIRTH_MAX_PER_TURN) break;
    if (reproductiveAdults.length === 0) break;
    if (birthProb > 0 && rng.next() < birthProb) {
      const parent = rng.pick(reproductiveAdults);
      const newAgent = createNewAgent(parent.familyId, CONFIG.NEWBORN_STARTING_AGE, true);
      allAgents.push(newAgent);
      births++;
      addEvent('positive', `島上迎來新生兒 ${newAgent.name}（1 歲）。`);
    }
  }

  return { births, deaths, deathByCause };
}
