import { CONFIG } from '../../config';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../data/events';
import type {
  ActiveRandomEvent,
  DecisionChoice,
  DecisionEventDef,
  GameEvent,
  PendingDecision,
  RandomEventDef,
  SectorType,
} from '../../types';
import type { Agent } from '../Agent';
import { te, pickL } from '../engineI18n';
import type { Government } from '../Government';
import type { Market } from '../Market';
import type { RNG } from '../RNG';

const CHAIN_SIGNALS = {
  supplyStage1: 'chain_supply_s1',
  supplyStage2: 'chain_supply_s2',
  growthStage1: 'chain_growth_s1',
  growthStage2: 'chain_growth_s2',
} as const;

interface RandomEventsPhaseInput {
  turn: number;
  rng: RNG;
  market: Market;
  activeRandomEvents: ActiveRandomEvent[];
  pendingDecision: PendingDecision | null;
  lastRandomEventTurn: number;
  lastDecisionTurn: number;
  eventChainSignals: Record<string, number>;
  addEvent: (type: GameEvent['type'], message: string) => void;
}

interface RandomEventsPhaseResult {
  activeRandomEvents: ActiveRandomEvent[];
  pendingDecision: PendingDecision | null;
  lastRandomEventTurn: number;
  lastDecisionTurn: number;
  eventChainSignals: Record<string, number>;
}

interface ApplyDecisionChoiceInput {
  choice: DecisionChoice;
  turn: number;
  rng: RNG;
  agents: Agent[];
  government: Government;
  activeRandomEvents: ActiveRandomEvent[];
  addEvent: (type: GameEvent['type'], message: string) => void;
}

function decayEventChainSignals(signals: Record<string, number>): void {
  for (const [signal, turns] of Object.entries(signals)) {
    const nextTurns = turns - 1;
    if (nextTurns <= 0) {
      delete signals[signal];
    } else {
      signals[signal] = nextTurns;
    }
  }
}

function registerEventChainSignal(signals: Record<string, number>, signal: string, turns: number = CONFIG.EVENT_CHAIN_SIGNAL_TURNS): void {
  signals[signal] = Math.max(signals[signal] ?? 0, turns);
}

function hasEventChainSignal(signals: Record<string, number>, signal: string): boolean {
  return (signals[signal] ?? 0) > 0;
}

function registerChainProgressByEvent(signals: Record<string, number>, eventId: string): void {
  if (eventId === 'drought' || eventId === 'storm') {
    registerEventChainSignal(signals, CHAIN_SIGNALS.supplyStage1, CONFIG.EVENT_CHAIN_SIGNAL_TURNS + 1);
    return;
  }

  if (eventId === 'inflation_spike' && hasEventChainSignal(signals, CHAIN_SIGNALS.supplyStage1)) {
    registerEventChainSignal(signals, CHAIN_SIGNALS.supplyStage2, CONFIG.EVENT_CHAIN_SIGNAL_TURNS + 1);
    return;
  }

  if (eventId === 'good_harvest') {
    registerEventChainSignal(signals, CHAIN_SIGNALS.growthStage1, CONFIG.EVENT_CHAIN_SIGNAL_TURNS + 1);
    return;
  }

  if (eventId === 'trade_ship' && hasEventChainSignal(signals, CHAIN_SIGNALS.growthStage1)) {
    registerEventChainSignal(signals, CHAIN_SIGNALS.growthStage2, CONFIG.EVENT_CHAIN_SIGNAL_TURNS + 1);
  }
}

function sectorShortageRatio(market: Market, sector: SectorType): number {
  const demand = market.demand[sector];
  if (demand <= 0.01) return 0;
  const supply = market.supply[sector];
  return Math.max(0, (demand - supply) / demand);
}

function getRandomEventProbability(
  eventDef: RandomEventDef,
  market: Market,
  eventChainSignals: Record<string, number>,
): { probability: number; chainReason?: string } {
  const baseProbability = eventDef.probability * CONFIG.RANDOM_EVENT_PROBABILITY_MULTIPLIER;
  let multiplier = 1;
  const reasons: string[] = [];

  if (eventDef.id === 'inflation_spike') {
    if (
      hasEventChainSignal(eventChainSignals, CHAIN_SIGNALS.supplyStage1) ||
      hasEventChainSignal(eventChainSignals, 'drought')
    ) {
      multiplier *= 1.85;
      reasons.push(te('eventChain.supplyStage1Inflation'));
    }
    if (hasEventChainSignal(eventChainSignals, 'storm')) {
      multiplier *= 1.3;
      reasons.push(te('eventChain.stormDisruption'));
    }
    const foodShortage = sectorShortageRatio(market, 'food');
    if (foodShortage >= 0.16) {
      const shortageMultiplier = 1 + Math.min(0.45, foodShortage * 1.2);
      multiplier *= shortageMultiplier;
      reasons.push(te('eventChain.foodShortageInflation'));
    }
  }

  if (eventDef.id === 'trade_ship' && hasEventChainSignal(eventChainSignals, CHAIN_SIGNALS.growthStage1)) {
    multiplier *= 1.55;
    reasons.push(te('eventChain.harvestExpandsTrade'));
  }

  if (eventDef.id === 'festival' && hasEventChainSignal(eventChainSignals, CHAIN_SIGNALS.growthStage2)) {
    multiplier *= 1.65;
    reasons.push(te('eventChain.tradeBoomFestival'));
  }

  const boostedProbability = Math.min(
    baseProbability * multiplier,
    baseProbability + CONFIG.EVENT_CHAIN_MAX_RANDOM_BONUS,
  );

  return {
    probability: Math.max(0, Math.min(1, boostedProbability)),
    chainReason: reasons.length > 0 ? reasons.join('、') : undefined,
  };
}

function getDecisionEventProbability(
  eventDef: DecisionEventDef,
  market: Market,
  eventChainSignals: Record<string, number>,
): { probability: number; chainReason?: string } {
  const baseProbability = eventDef.probability;
  let multiplier = 1;
  const reasons: string[] = [];

  if (eventDef.id === 'cost_of_living') {
    if (hasEventChainSignal(eventChainSignals, CHAIN_SIGNALS.supplyStage2)) {
      multiplier *= 2.35;
      reasons.push(te('eventChain.inflationLivingCost'));
    }
    if (hasEventChainSignal(eventChainSignals, 'inflation_spike')) {
      multiplier *= 2.15;
      reasons.push(te('eventChain.inflationSpillover'));
    }
    const foodShortage = sectorShortageRatio(market, 'food');
    if (foodShortage >= 0.18) {
      const shortageMultiplier = 1 + Math.min(0.35, foodShortage);
      multiplier *= shortageMultiplier;
      reasons.push(te('eventChain.supplyTight'));
    }
  }

  if (eventDef.id === 'health_crisis' && hasEventChainSignal(eventChainSignals, 'epidemic')) {
    multiplier *= 1.8;
    reasons.push(te('eventChain.epidemicAftermath'));
  }

  if (eventDef.id === 'industry_lobby' && hasEventChainSignal(eventChainSignals, CHAIN_SIGNALS.growthStage2)) {
    multiplier *= 1.45;
    reasons.push(te('eventChain.tradeUpgradeIndustry'));
  }

  const boostedProbability = Math.min(
    baseProbability * multiplier,
    baseProbability + CONFIG.EVENT_CHAIN_MAX_DECISION_BONUS,
  );

  return {
    probability: Math.max(0, Math.min(1, boostedProbability)),
    chainReason: reasons.length > 0 ? reasons.join('、') : undefined,
  };
}

export function runRandomEventsPhase({
  turn,
  rng,
  market,
  activeRandomEvents,
  pendingDecision,
  lastRandomEventTurn,
  lastDecisionTurn,
  eventChainSignals,
  addEvent,
}: RandomEventsPhaseInput): RandomEventsPhaseResult {
  const nextActiveEvents = activeRandomEvents.filter(event => {
    event.turnsRemaining--;
    return event.turnsRemaining > 0;
  });

  const nextSignals: Record<string, number> = { ...eventChainSignals };
  decayEventChainSignals(nextSignals);
  for (const event of nextActiveEvents) {
    if (event.def.probability > 0) {
      registerEventChainSignal(nextSignals, event.def.id, 2);
      registerChainProgressByEvent(nextSignals, event.def.id);
    }
  }

  let nextPendingDecision = pendingDecision;
  let nextLastDecisionTurn = lastDecisionTurn;
  const decisionCooldownDone = turn - lastDecisionTurn > CONFIG.DECISION_EVENT_COOLDOWN_TURNS;
  if (!nextPendingDecision && decisionCooldownDone) {
    for (const eventDef of DECISION_EVENTS) {
      const { probability, chainReason } = getDecisionEventProbability(eventDef, market, nextSignals);
      if (rng.next() < probability) {
        const dName = pickL(eventDef.name, eventDef.nameEn);
        const dMsg = pickL(eventDef.message, eventDef.messageEn);
        nextPendingDecision = {
          id: eventDef.id,
          name: dName,
          message: dMsg,
          severity: eventDef.severity,
          choices: eventDef.choices,
          turnIssued: turn,
        };
        nextLastDecisionTurn = turn;
        if (chainReason) {
          addEvent('info', te('event.chainCausedDecision', { reason: chainReason, name: dName }));
        }
        addEvent(eventDef.severity, `${dName}：${dMsg}`);
        addEvent('info', te('event.decisionAwaiting'));
        break;
      }
    }
  }

  let nextLastRandomEventTurn = lastRandomEventTurn;
  const randomCooldownDone = turn - lastRandomEventTurn > CONFIG.RANDOM_EVENT_COOLDOWN_TURNS;
  if (randomCooldownDone) {
    const available = RANDOM_EVENTS.filter(
      eventDef => !nextActiveEvents.some(event => event.def.id === eventDef.id),
    );

    if (available.length > 0) {
      const startIdx = rng.nextInt(0, available.length - 1);
      for (let i = 0; i < available.length; i++) {
        const eventDef = available[(startIdx + i) % available.length];
        const { probability, chainReason } = getRandomEventProbability(eventDef, market, nextSignals);
        if (rng.next() < probability) {
          nextActiveEvents.push({ def: eventDef, turnsRemaining: eventDef.duration });
          nextLastRandomEventTurn = turn;
          if (eventDef.probability > 0) {
            registerEventChainSignal(nextSignals, eventDef.id);
            registerChainProgressByEvent(nextSignals, eventDef.id);
          }
          const rName = pickL(eventDef.name, eventDef.nameEn);
          const rMsg = pickL(eventDef.message, eventDef.messageEn);
          if (chainReason) {
            addEvent('info', te('event.chainTriggeredRandom', { reason: chainReason, name: rName }));
          }
          addEvent(eventDef.severity, rMsg);
          break;
        }
      }
    }
  }

  for (const event of nextActiveEvents) {
    if (event.def.effects.priceModifier) {
      for (const [sector, mod] of Object.entries(event.def.effects.priceModifier)) {
        market.prices[sector as SectorType] *= mod;
      }
    }
  }

  return {
    activeRandomEvents: nextActiveEvents,
    pendingDecision: nextPendingDecision,
    lastRandomEventTurn: nextLastRandomEventTurn,
    lastDecisionTurn: nextLastDecisionTurn,
    eventChainSignals: nextSignals,
  };
}

export function applyDecisionChoiceEffects({
  choice,
  turn,
  rng,
  agents,
  government,
  activeRandomEvents,
  addEvent,
}: ApplyDecisionChoiceInput): void {
  if (choice.immediate) {
    if (choice.immediate.treasuryDelta) {
      government.treasury = Math.max(0, government.treasury + choice.immediate.treasuryDelta);
    }

    if (choice.immediate.satisfactionDelta) {
      for (const agent of agents) {
        if (!agent.alive) continue;
        agent.satisfaction = Math.max(0, Math.min(100, agent.satisfaction + choice.immediate.satisfactionDelta));
      }
    }

    if (choice.immediate.healthDelta) {
      for (const agent of agents) {
        if (!agent.alive) continue;
        agent.health = Math.max(0, Math.min(100, agent.health + choice.immediate.healthDelta));
      }
    }

    if (choice.immediate.taxRateDelta) {
      government.setTaxRate(government.taxRate + choice.immediate.taxRateDelta);
    }

    if (choice.immediate.subsidyDelta) {
      for (const [sector, delta] of Object.entries(choice.immediate.subsidyDelta)) {
        const key = sector as SectorType;
        government.setSubsidy(key, government.subsidies[key] + (delta ?? 0));
      }
    }
  }

  if (choice.temporary) {
    const tMsg = pickL(choice.temporary.message, choice.temporary.messageEn);
    const tempDef: RandomEventDef = {
      id: `decision_${turn}_${choice.id}_${rng.nextInt(1, 1_000_000)}`,
      name: choice.label,
      nameEn: choice.labelEn,
      probability: 0,
      duration: choice.temporary.duration,
      effects: choice.temporary.effects,
      message: choice.temporary.message,
      messageEn: choice.temporary.messageEn,
      severity: choice.temporary.severity ?? 'info',
    };
    activeRandomEvents.push({ def: tempDef, turnsRemaining: tempDef.duration });
    addEvent(tempDef.severity, tMsg);
  }
}
