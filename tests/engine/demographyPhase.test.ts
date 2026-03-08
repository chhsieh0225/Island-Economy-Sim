import { describe, it, expect } from 'vitest';
import { runAgingPhase, runLifeDeathPhase } from '../../src/engine/phases/demographyPhase';
import { Agent } from '../../src/engine/Agent';
import { Government } from '../../src/engine/Government';
import { RNG } from '../../src/engine/RNG';
import { CONFIG } from '../../src/config';
import type { GameEvent } from '../../src/types';

function createAgent(id: number, rng: RNG, overrides?: { age?: number; maxAge?: number; health?: number; satisfaction?: number; gender?: 'M' | 'F' }) {
  const agent = new Agent(id, `Agent${id}`, 'food', rng, {
    age: overrides?.age ?? CONFIG.WORKING_AGE + 10,
    maxAge: overrides?.maxAge ?? CONFIG.MAX_LIFESPAN,
    gender: overrides?.gender ?? 'F',
  });
  if (overrides?.health !== undefined) agent.health = overrides.health;
  if (overrides?.satisfaction !== undefined) agent.satisfaction = overrides.satisfaction;
  return agent;
}

describe('demographyPhase', () => {
  describe('runAgingPhase', () => {
    it('increments all agents age by 1', () => {
      const rng = new RNG(42);
      const agents = [createAgent(1, rng, { age: 300 }), createAgent(2, rng, { age: 400 })];
      const events: string[] = [];

      runAgingPhase({
        turn: 1,
        agents,
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(agents[0].age).toBe(301);
      expect(agents[1].age).toBe(401);
    });

    it('emits event when agent crosses working age threshold', () => {
      const rng = new RNG(42);
      const youngAgent = createAgent(1, rng, { age: CONFIG.WORKING_AGE - 1 });
      const events: string[] = [];

      runAgingPhase({
        turn: 5,
        agents: [youngAgent],
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(youngAgent.age).toBe(CONFIG.WORKING_AGE);
      expect(events.length).toBe(1);
      expect(events[0]).toContain('已成年');
    });

    it('does not emit event for agents already past working age', () => {
      const rng = new RNG(42);
      const adultAgent = createAgent(1, rng, { age: CONFIG.WORKING_AGE + 5 });
      const events: string[] = [];

      runAgingPhase({
        turn: 1,
        agents: [adultAgent],
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(events.length).toBe(0);
    });
  });

  describe('runLifeDeathPhase', () => {
    it('marks old agents as dead', () => {
      const rng = new RNG(42);
      const oldAgent = createAgent(1, rng, { age: 960, maxAge: 960 });
      // Constructor enforces maxAge >= age + 120, so manually set maxAge = age
      oldAgent.maxAge = oldAgent.age;
      const events: string[] = [];

      const result = runLifeDeathPhase({
        turn: 1,
        agents: [oldAgent],
        allAgents: [oldAgent],
        rng,
        government: new Government(),
        createNewAgent: () => createAgent(99, new RNG(1)),
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(oldAgent.alive).toBe(false);
      expect(oldAgent.causeOfDeath).toBe('age');
      expect(result.deaths).toBe(1);
      expect(result.deathByCause.age).toBe(1);
    });

    it('marks agents with health <= 0 as dead', () => {
      const rng = new RNG(42);
      const sickAgent = createAgent(1, rng, { health: 0 });
      const events: string[] = [];

      const result = runLifeDeathPhase({
        turn: 1,
        agents: [sickAgent],
        allAgents: [sickAgent],
        rng,
        government: new Government(),
        createNewAgent: () => createAgent(99, new RNG(1)),
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(sickAgent.alive).toBe(false);
      expect(sickAgent.causeOfDeath).toBe('health');
      expect(result.deathByCause.health).toBe(1);
    });

    it('respects leave cap (LEAVE_MAX_SHARE_PER_TURN)', () => {
      const rng = new RNG(42);
      // Create 20 agents all wanting to leave
      const agents = Array.from({ length: 20 }, (_, i) => {
        const a = createAgent(i, new RNG(i), { satisfaction: 1 }); // very low satisfaction
        return a;
      });
      const events: string[] = [];

      const result = runLifeDeathPhase({
        turn: 1,
        agents,
        allAgents: agents,
        rng,
        government: new Government(),
        createNewAgent: () => createAgent(99, new RNG(1)),
        addEvent: (_type, msg) => events.push(msg),
      });

      // Leave cap = max(1, ceil(20 * 0.12)) = 3
      const maxLeave = Math.max(1, Math.ceil(20 * CONFIG.LEAVE_MAX_SHARE_PER_TURN));
      expect(result.deathByCause.left).toBeLessThanOrEqual(maxLeave);
    });

    it('births create new agents', () => {
      const rng = new RNG(42);
      // Create reproductive females
      const allAgents: Agent[] = Array.from({ length: 30 }, (_, i) =>
        createAgent(i, new RNG(i), {
          age: CONFIG.BIRTH_MIN_REPRO_AGE + 10,
          gender: 'F',
          health: 100,
          satisfaction: 80,
        }),
      );
      const aliveAgents = allAgents.filter(a => a.alive);
      const events: string[] = [];
      let newId = 100;

      // Run many trials to get at least one birth
      let totalBirths = 0;
      for (let trial = 0; trial < 10; trial++) {
        const trialAgents = Array.from({ length: 30 }, (_, i) =>
          createAgent(i + trial * 30, new RNG(trial * 100 + i), {
            age: CONFIG.BIRTH_MIN_REPRO_AGE + 10,
            gender: 'F',
            health: 100,
            satisfaction: 80,
          }),
        );
        const result = runLifeDeathPhase({
          turn: trial + 1,
          agents: trialAgents,
          allAgents: trialAgents,
          rng: new RNG(trial),
          government: new Government(),
          createNewAgent: () => createAgent(newId++, new RNG(newId)),
          addEvent: (_type, msg) => events.push(msg),
        });
        totalBirths += result.births;
      }
      expect(totalBirths).toBeGreaterThan(0);
    });

    it('birth count respects BIRTH_MAX_PER_TURN', () => {
      const rng = new RNG(42);
      const allAgents: Agent[] = Array.from({ length: 50 }, (_, i) =>
        createAgent(i, new RNG(i), {
          age: CONFIG.BIRTH_MIN_REPRO_AGE + 10,
          gender: 'F',
        }),
      );
      const events: string[] = [];
      let newId = 100;

      const result = runLifeDeathPhase({
        turn: 1,
        agents: allAgents,
        allAgents: allAgents,
        rng,
        government: new Government(),
        createNewAgent: () => createAgent(newId++, new RNG(newId)),
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(result.births).toBeLessThanOrEqual(CONFIG.BIRTH_MAX_PER_TURN);
    });

    it('returns correct summary with all fields', () => {
      const rng = new RNG(42);
      const agents = [createAgent(1, rng)];
      const events: string[] = [];

      const result = runLifeDeathPhase({
        turn: 1,
        agents,
        allAgents: agents,
        rng,
        government: new Government(),
        createNewAgent: () => createAgent(99, new RNG(1)),
        addEvent: (_type, msg) => events.push(msg),
      });

      expect(typeof result.births).toBe('number');
      expect(typeof result.deaths).toBe('number');
      expect(typeof result.deathByCause.age).toBe('number');
      expect(typeof result.deathByCause.health).toBe('number');
      expect(typeof result.deathByCause.left).toBe('number');
    });
  });
});
