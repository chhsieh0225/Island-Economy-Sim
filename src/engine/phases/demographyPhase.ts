import { CONFIG } from '../../config';
import type { GameEvent } from '../../types';
import type { Agent } from '../Agent';
import type { Government } from '../Government';
import type { RNG } from '../RNG';
import { te } from '../engineI18n';

interface LifeDeathPhaseInput {
  turn: number;
  agents: Agent[];
  allAgents: Agent[];
  rng: RNG;
  government: Government;
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
  inheritedByFamily: number;
  inheritedByGovernment: number;
  capitalOutflow: number;
}

export function runAgingPhase({ turn, agents, addEvent }: AgingPhaseInput): void {
  for (const agent of agents) {
    const wasMinor = agent.age < CONFIG.WORKING_AGE;
    agent.ageOneTurn();
    if (wasMinor && agent.age >= CONFIG.WORKING_AGE) {
      agent.addLifeEvent(turn, 'join', te('event.maturity.life'), 'positive');
      addEvent('info', te('event.maturity', { name: agent.name }));
    }
  }
}

/**
 * Distribute the estate of a deceased or departed agent.
 * - Death (age/health): money+savings go to surviving family members;
 *   if no family exists, the estate reverts to the government treasury.
 * - Left: the agent takes their wealth with them (capital outflow — money is destroyed).
 */
function distributeEstate(
  agent: Agent,
  allAgents: Agent[],
  government: Government,
  addEvent: (type: GameEvent['type'], message: string) => void,
): { inheritedByFamily: number; inheritedByGovernment: number; capitalOutflow: number } {
  const estate = agent.money + agent.savings;
  agent.money = 0;
  agent.savings = 0;
  if (estate < 0.01) return { inheritedByFamily: 0, inheritedByGovernment: 0, capitalOutflow: 0 };

  if (agent.causeOfDeath === 'left') {
    // Capital outflow: agent takes wealth out of the system
    addEvent('info', te('engine.capitalOutflow', { name: agent.name, amount: estate.toFixed(0) }));
    return { inheritedByFamily: 0, inheritedByGovernment: 0, capitalOutflow: estate };
  }

  // Death: try family inheritance first
  const familyMembers = allAgents.filter(
    a => a.alive && a.id !== agent.id && a.familyId === agent.familyId,
  );

  if (familyMembers.length > 0) {
    const share = estate / familyMembers.length;
    for (const member of familyMembers) {
      member.receiveMoney(share);
    }
    addEvent('info', te('engine.estateFamily', { name: agent.name, amount: estate.toFixed(0) }));
    return { inheritedByFamily: estate, inheritedByGovernment: 0, capitalOutflow: 0 };
  }

  // No surviving family: estate reverts to government
  government.treasury += estate;
  addEvent('info', te('engine.estateGovernment', { name: agent.name, amount: estate.toFixed(0) }));
  return { inheritedByFamily: 0, inheritedByGovernment: estate, capitalOutflow: 0 };
}

export function runLifeDeathPhase({
  turn,
  agents,
  allAgents,
  rng,
  government,
  createNewAgent,
  addEvent,
}: LifeDeathPhaseInput): DemographyPhaseSummary {
  let deaths = 0;
  const deathByCause = { age: 0, health: 0, left: 0 };
  const leaveCandidates: Agent[] = [];
  let inheritedByFamily = 0;
  let inheritedByGovernment = 0;
  let capitalOutflow = 0;
  const deceased: Agent[] = [];

  for (const agent of agents) {
    if (!agent.alive) continue;

    if (agent.isOld) {
      agent.alive = false;
      agent.causeOfDeath = 'age';
      agent.addLifeEvent(turn, 'death', te('event.death.age.life', { age: Math.floor(agent.age / 12) }), 'warning');
      deaths++;
      deathByCause.age++;
      deceased.push(agent);
      addEvent('warning', te('event.death.age', { name: agent.name, age: Math.floor(agent.age / 12) }));
    } else if (agent.isDead) {
      agent.alive = false;
      agent.causeOfDeath = 'health';
      agent.addLifeEvent(turn, 'death', te('event.death.health.life'), 'critical');
      deaths++;
      deathByCause.health++;
      deceased.push(agent);
      addEvent('critical', te('event.death.health', { name: agent.name }));
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
      agent.addLifeEvent(turn, 'leave', te('event.leave.life'), 'warning');
      deaths++;
      deathByCause.left++;
      leftThisTurn++;
      deceased.push(agent);
      addEvent('warning', te('event.leave', { name: agent.name }));
    }

    if (leaveCandidates.length > leaveCap && leftThisTurn >= leaveCap) {
      addEvent('warning', te('event.migrationWaveLimited'));
    }
  }

  // Distribute estates of all deceased/departed agents
  for (const agent of deceased) {
    const result = distributeEstate(agent, allAgents, government, addEvent);
    inheritedByFamily += result.inheritedByFamily;
    inheritedByGovernment += result.inheritedByGovernment;
    capitalOutflow += result.capitalOutflow;
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
      addEvent('positive', te('event.newborn', { name: newAgent.name }));
    }
  }

  return { births, deaths, deathByCause, inheritedByFamily, inheritedByGovernment, capitalOutflow };
}
