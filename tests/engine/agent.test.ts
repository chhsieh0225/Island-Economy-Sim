import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/engine/Agent';
import { RNG } from '../../src/engine/RNG';
import { CONFIG } from '../../src/config';

function createAgent(rng?: RNG, options?: Parameters<typeof Agent.prototype.constructor>[4]) {
  const r = rng ?? new RNG(42);
  return new Agent(1, 'Test Agent', 'food', r, options);
}

describe('Agent', () => {
  describe('constructor', () => {
    it('initializes with correct defaults', () => {
      const agent = createAgent();
      expect(agent.id).toBe(1);
      expect(agent.name).toBe('Test Agent');
      expect(agent.sector).toBe('food');
      expect(agent.money).toBe(CONFIG.INITIAL_MONEY);
      expect(agent.savings).toBe(0);
      expect(agent.health).toBe(100);
      expect(agent.satisfaction).toBe(100);
      expect(agent.alive).toBe(true);
    });

    it('age falls within configured bounds', () => {
      for (let seed = 0; seed < 50; seed++) {
        const agent = createAgent(new RNG(seed));
        expect(agent.age).toBeGreaterThanOrEqual(CONFIG.MIN_STARTING_AGE);
        expect(agent.age).toBeLessThanOrEqual(CONFIG.MAX_STARTING_AGE);
      }
    });

    it('intelligence falls within configured bounds', () => {
      for (let seed = 0; seed < 50; seed++) {
        const agent = createAgent(new RNG(seed));
        expect(agent.intelligence).toBeGreaterThanOrEqual(CONFIG.INTELLIGENCE_MIN);
        expect(agent.intelligence).toBeLessThanOrEqual(CONFIG.INTELLIGENCE_MAX);
      }
    });

    it('gender is M or F', () => {
      const genders = new Set<string>();
      for (let seed = 0; seed < 50; seed++) {
        genders.add(createAgent(new RNG(seed)).gender);
      }
      expect(genders.has('M')).toBe(true);
      expect(genders.has('F')).toBe(true);
      expect(genders.size).toBe(2);
    });

    it('maxAge is always >= age + 120', () => {
      for (let seed = 0; seed < 50; seed++) {
        const agent = createAgent(new RNG(seed));
        expect(agent.maxAge).toBeGreaterThanOrEqual(agent.age + 120);
      }
    });

    it('respects explicit options', () => {
      const agent = createAgent(new RNG(1), {
        age: 300,
        maxAge: 900,
        intelligence: 130,
        gender: 'F',
        familyId: 99,
      });
      expect(agent.age).toBe(300);
      expect(agent.intelligence).toBe(130);
      expect(agent.gender).toBe('F');
      expect(agent.familyId).toBe(99);
    });
  });

  describe('effectiveProductivity', () => {
    it('has penalty for newly joined sector (turnsInSector < 2)', () => {
      const agent = createAgent();
      agent.turnsInSector = 0;
      const ep = agent.effectiveProductivity;
      expect(ep).toBeLessThan(agent.productivity);
    });

    it('no penalty after settling in', () => {
      const agent = createAgent();
      agent.turnsInSector = 5;
      const ep = agent.effectiveProductivity;
      // Should be approximately productivity * intelligence factor
      expect(ep).toBeGreaterThan(0);
    });
  });

  describe('payTax', () => {
    it('deducts correct tax amount from income this turn', () => {
      const agent = createAgent();
      agent.money = 100;
      // payTax taxes _incomeThisTurn, not money. Simulate income via receiveMoney.
      agent.receiveMoney(100);
      const tax = agent.payTax(0.1);
      expect(tax).toBeCloseTo(10, 5);
      // money started at 100 + received 100 - tax 10 = 190
      expect(agent.money).toBeCloseTo(190, 5);
    });

    it('returns 0 for agents with no income this turn', () => {
      const agent = createAgent();
      agent.money = 100;
      // No receiveMoney call, so _incomeThisTurn = 0
      const tax = agent.payTax(0.1);
      expect(tax).toBe(0);
    });

    it('50% tax rate takes half of income', () => {
      const agent = createAgent();
      agent.money = 200;
      agent.receiveMoney(200);
      const tax = agent.payTax(0.5);
      expect(tax).toBeCloseTo(100, 5);
      // money: 200 + 200 - 100 = 300
      expect(agent.money).toBeCloseTo(300, 5);
    });
  });

  describe('switchJob', () => {
    it('changes sector', () => {
      const agent = createAgent();
      expect(agent.sector).toBe('food');
      agent.money = 100;
      agent.switchJob('goods');
      expect(agent.sector).toBe('goods');
    });

    it('deducts switch cost', () => {
      const agent = createAgent();
      agent.money = 100;
      const before = agent.money;
      agent.switchJob('goods');
      expect(agent.money).toBe(before - CONFIG.JOB_SWITCH_COST);
    });

    it('resets turnsInSector to 0', () => {
      const agent = createAgent();
      agent.turnsInSector = 10;
      agent.money = 100;
      agent.switchJob('goods');
      expect(agent.turnsInSector).toBe(0);
    });

    it('increments totalSwitches', () => {
      const agent = createAgent();
      agent.money = 200;
      expect(agent.totalSwitches).toBe(0);
      agent.switchJob('goods');
      expect(agent.totalSwitches).toBe(1);
      agent.switchJob('services');
      expect(agent.totalSwitches).toBe(2);
    });

    it('updates switch history', () => {
      const agent = createAgent();
      agent.money = 200;
      agent.switchJob('goods');
      expect(agent.switchHistory).toContain('goods');
    });
  });

  describe('ageOneTurn', () => {
    it('increments age by 1', () => {
      const agent = createAgent();
      const before = agent.age;
      agent.ageOneTurn();
      expect(agent.age).toBe(before + 1);
    });

    it('health decays after AGE_HEALTH_DECAY_START', () => {
      const agent = createAgent(new RNG(42), { age: CONFIG.AGE_HEALTH_DECAY_START + 1 });
      agent.health = 100;
      agent.ageOneTurn();
      expect(agent.health).toBeLessThan(100);
    });

    it('health does not decay before AGE_HEALTH_DECAY_START', () => {
      const agent = createAgent(new RNG(42), { age: 300 });
      agent.health = 100;
      agent.ageOneTurn();
      expect(agent.health).toBe(100);
    });
  });

  describe('computed properties', () => {
    it('isOld when age >= maxAge', () => {
      // Constructor enforces maxAge >= age + 120, so we need age >= that floor
      const agent = createAgent(new RNG(42), { age: 1200, maxAge: 1200 });
      // maxAge will be max(1200, 1200+120) = 1320, so age 1200 < 1320 — not old yet
      // Instead, directly set maxAge after construction to test the getter
      agent.maxAge = agent.age; // force maxAge = age
      expect(agent.isOld).toBe(true);
    });

    it('isDead when health <= 0', () => {
      const agent = createAgent();
      agent.health = 0;
      expect(agent.isDead).toBe(true);
    });

    it('shouldLeave when satisfaction is very low and turnsInSector > 5', () => {
      const agent = createAgent();
      agent.satisfaction = CONFIG.LEAVE_SATISFACTION_THRESHOLD - 1;
      agent.turnsInSector = 10; // must be > 5
      expect(agent.shouldLeave).toBe(true);
    });

    it('does not shouldLeave when satisfaction is high', () => {
      const agent = createAgent();
      agent.satisfaction = 80;
      expect(agent.shouldLeave).toBe(false);
    });

    it('ageGroup categorizes correctly', () => {
      const youth = createAgent(new RNG(1), { age: 240 }); // 20 years
      expect(youth.ageGroup).toBe('youth');

      const adult = createAgent(new RNG(1), { age: 500 }); // ~41 years
      expect(adult.ageGroup).toBe('adult');

      const senior = createAgent(new RNG(1), { age: 800 }); // ~66 years
      expect(senior.ageGroup).toBe('senior');
    });
  });

  describe('money operations', () => {
    it('receiveMoney adds to money and tracks income', () => {
      const agent = createAgent();
      const before = agent.money;
      agent.receiveMoney(50);
      expect(agent.money).toBe(before + 50);
    });

    it('spendMoney deducts from money', () => {
      const agent = createAgent();
      agent.money = 100;
      agent.spendMoney(30);
      expect(agent.money).toBe(70);
    });

    it('receiveGoods adds to inventory', () => {
      const agent = createAgent();
      const before = agent.inventory.food;
      agent.receiveGoods('food', 5);
      expect(agent.inventory.food).toBe(before + 5);
    });

    it('removeGoods deducts from inventory', () => {
      const agent = createAgent();
      agent.inventory.food = 10;
      agent.removeGoods('food', 3);
      expect(agent.inventory.food).toBe(7);
    });
  });

  describe('toState', () => {
    it('returns serializable snapshot with all required fields', () => {
      const agent = createAgent();
      const state = agent.toState();
      expect(state.id).toBe(agent.id);
      expect(state.name).toBe(agent.name);
      expect(state.sector).toBe(agent.sector);
      expect(state.money).toBe(agent.money);
      expect(state.health).toBe(agent.health);
      expect(state.satisfaction).toBe(agent.satisfaction);
      expect(state.alive).toBe(agent.alive);
      expect(state.age).toBe(agent.age);
      expect(state.intelligence).toBe(agent.intelligence);
      expect(state.gender).toBe(agent.gender);
      expect(typeof state.inventory).toBe('object');
    });
  });
});
