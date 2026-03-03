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
}: LifeDeathPhaseInput): { births: number; deaths: number } {
  let deaths = 0;

  for (const agent of agents) {
    if (!agent.alive) continue;

    if (agent.isOld) {
      agent.alive = false;
      agent.causeOfDeath = 'age';
      agent.addLifeEvent(turn, 'death', `於 ${Math.floor(agent.age / 12)} 歲因年老去世。`, 'warning');
      deaths++;
      addEvent('warning', `${agent.name} 因年老去世 (${Math.floor(agent.age / 12)} 歲)。`);
    } else if (agent.isDead) {
      agent.alive = false;
      agent.causeOfDeath = 'health';
      agent.addLifeEvent(turn, 'death', '因健康不佳去世。', 'critical');
      deaths++;
      addEvent('critical', `${agent.name} 因健康不佳而死亡。`);
    } else if (agent.age >= CONFIG.WORKING_AGE && agent.shouldLeave) {
      agent.alive = false;
      agent.causeOfDeath = 'left';
      agent.addLifeEvent(turn, 'leave', '對小島失去信心，選擇離開。', 'warning');
      deaths++;
      addEvent('warning', `${agent.name} 因不滿離開了小島。`);
    }
  }

  const aliveAgents = allAgents.filter(a => a.alive);
  const aliveCount = aliveAgents.length;
  const reproductiveAdults = aliveAgents.filter(
    a => a.gender === 'F' && a.age >= CONFIG.BIRTH_MIN_REPRO_AGE && a.age <= CONFIG.BIRTH_MAX_REPRO_AGE
  );

  const capacityFactor = Math.max(0, 1 - aliveCount / CONFIG.BIRTH_CAPACITY_FACTOR);
  const reproRatio = reproductiveAdults.length / Math.max(1, aliveCount);
  const birthProb = Math.min(1, Math.max(0,
    CONFIG.BIRTH_BASE_PROBABILITY * reproRatio * capacityFactor
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

  return { births, deaths };
}
