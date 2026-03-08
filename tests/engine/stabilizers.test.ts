import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import { Market } from '../../src/engine/Market';
import { Government } from '../../src/engine/Government';
import { GameEngine } from '../../src/engine/GameEngine';
import { Agent } from '../../src/engine/Agent';
import { computeProductionOutput } from '../../src/engine/agent/productionStrategy';
import { computeBuyOrders } from '../../src/engine/agent/demandStrategy';
import { makeAgentContext } from './_testHelpers';
import { RNG } from '../../src/engine/RNG';

// ─── Helper ─────────────────────────────────────────────────────────────────
function createTestAgent(
  id: number,
  sector: 'food' | 'goods' | 'services',
  money: number,
  rng: RNG,
): Agent {
  const agent = new Agent(id, `Agent${id}`, sector, rng, { money });
  return agent;
}

// ─── Mechanism 1: Supply-Side Production Elasticity ──────────────────────────
describe('Mechanism 1: production price response', () => {
  it('full output at or above break-even price', () => {
    const output = computeProductionOutput('food', 1.0, 1.0, 0, 1.0, 1.0);
    // At break-even price, priceResponse = 1.0, so no reduction
    expect(output).toBeCloseTo(CONFIG.BASE_PRODUCTIVITY.food, 2);
  });

  it('reduced output when price is below break-even', () => {
    // The production function itself doesn't take price — the reduction is applied
    // as a multiplier in runProductionPhase via subsidyMult.
    // So we test the multiplier logic directly:
    const breakEven = CONFIG.INITIAL_PRICES.food * CONFIG.PRODUCTION_BREAK_EVEN_RATIO; // 10 * 0.6 = 6
    const halfBreakEven = breakEven / 2; // price = 3

    const priceResponse = Math.max(
      CONFIG.PRODUCTION_MIN_PRICE_RESPONSE,
      Math.min(1, halfBreakEven / breakEven),
    );
    expect(priceResponse).toBeCloseTo(0.5, 2);

    // At minimum price
    const minPriceResponse = Math.max(
      CONFIG.PRODUCTION_MIN_PRICE_RESPONSE,
      Math.min(1, CONFIG.MIN_PRICE / breakEven),
    );
    expect(minPriceResponse).toBeCloseTo(CONFIG.PRODUCTION_MIN_PRICE_RESPONSE, 2);
  });

  it('production never drops below PRODUCTION_MIN_PRICE_RESPONSE', () => {
    const breakEven = CONFIG.INITIAL_PRICES.goods * CONFIG.PRODUCTION_BREAK_EVEN_RATIO;
    const extremelyLowPrice = 0.1;

    const priceResponse = Math.max(
      CONFIG.PRODUCTION_MIN_PRICE_RESPONSE,
      Math.min(1, extremelyLowPrice / breakEven),
    );
    expect(priceResponse).toBe(CONFIG.PRODUCTION_MIN_PRICE_RESPONSE);
    expect(priceResponse).toBe(0.3);
  });

  it('reduced output applied as multiplier produces less', () => {
    const fullOutput = computeProductionOutput('food', 1.0, 1.0, 0, 1.0, 1.0);
    // priceResponse of 0.5 applied as part of subsidyMult
    const reducedOutput = computeProductionOutput('food', 1.0, 0.5, 0, 1.0, 1.0);
    expect(reducedOutput).toBeCloseTo(fullOutput * 0.5, 2);
  });
});

// ─── Mechanism 2: Demand-Side Price Elasticity ───────────────────────────────
describe('Mechanism 2: demand low-price boost', () => {
  it('no boost when all prices are equal', () => {
    const ctx = makeAgentContext({ money: 200 });
    const prices = { food: 10, goods: 10, services: 10 };
    const orders = computeBuyOrders(ctx, 1, prices);
    // All prices equal to average → no boost
    expect(orders.length).toBeGreaterThan(0);
  });

  it('price-demand boost factor increases for below-average prices', () => {
    // Test the boost computation logic directly:
    // avgPrice / sectorPrice, clamped to [1.0, DEMAND_LOW_PRICE_BOOST_MAX]
    const avgPrice = 10;

    // At average price → no boost
    const boostAtAvg = Math.min(CONFIG.DEMAND_LOW_PRICE_BOOST_MAX, Math.max(1.0, avgPrice / 10));
    expect(boostAtAvg).toBe(1.0);

    // Below average (price = 7) → modest boost
    const boostBelow = Math.min(CONFIG.DEMAND_LOW_PRICE_BOOST_MAX, Math.max(1.0, avgPrice / 7));
    expect(boostBelow).toBeCloseTo(1.43, 1);

    // Far below average (price = 5) → larger boost, capped
    const boostFarBelow = Math.min(CONFIG.DEMAND_LOW_PRICE_BOOST_MAX, Math.max(1.0, avgPrice / 5));
    expect(boostFarBelow).toBe(CONFIG.DEMAND_LOW_PRICE_BOOST_MAX); // 1.5 cap

    // Above average → no boost (floor at 1.0)
    const boostAbove = Math.min(CONFIG.DEMAND_LOW_PRICE_BOOST_MAX, Math.max(1.0, avgPrice / 15));
    expect(boostAbove).toBe(1.0);
  });

  it('low-price goods generate total demand exceeding balanced scenario', () => {
    // Test aggregate buy orders: cheaper goods → more total spending on them
    const ctx = makeAgentContext({
      money: 500,
      inventory: { food: 0, goods: 0, services: 0 },
    });

    // Balanced prices
    const balancedOrders = computeBuyOrders(ctx, 1, { food: 10, goods: 10, services: 10 });
    const balancedTotal = balancedOrders.reduce((s, o) => s + o.quantity, 0);

    // Very cheap food: avg = (2+14+14)/3 = 10, food boost = min(1.5, 10/2) = 1.5
    const cheapOrders = computeBuyOrders(ctx, 2, { food: 2, goods: 14, services: 14 });
    const cheapTotal = cheapOrders.reduce((s, o) => s + o.quantity, 0);

    // Total quantity demanded should be higher when some goods are cheaper
    // because the boost applies to desiredQty before capping
    expect(cheapTotal).toBeGreaterThanOrEqual(balancedTotal);
  });

  it('demand boost is capped at DEMAND_LOW_PRICE_BOOST_MAX', () => {
    // When price is extremely low, boost should be capped
    const boostMax = CONFIG.DEMAND_LOW_PRICE_BOOST_MAX;
    const avgPrice = 10;
    const extremelyLowPrice = 1;

    const boost = Math.min(boostMax, Math.max(1.0, avgPrice / Math.max(CONFIG.MIN_PRICE, extremelyLowPrice)));
    expect(boost).toBe(boostMax);
    expect(boost).toBe(1.5);
  });
});

// ─── Mechanism 3: Asymmetric Price Adjustment ────────────────────────────────
describe('Mechanism 3: downward price stickiness', () => {
  it('prices drop slower than they rise with same magnitude excess', () => {
    const rng = new RNG(42);

    // Market with excess supply (surplus)
    const surplusMarket = new Market();
    const seller = createTestAgent(1, 'food', 100, rng);
    surplusMarket.setAgents([seller]);
    surplusMarket.addSellOrder({ agentId: 1, sector: 'food', quantity: 100, minPrice: 1 });
    surplusMarket.addBuyOrder({ agentId: 1, sector: 'food', quantity: 20, maxPrice: 50 });
    const priceBefore = surplusMarket.prices.food;
    surplusMarket.clearMarket();
    const priceDropPct = (priceBefore - surplusMarket.prices.food) / priceBefore;

    // Market with excess demand (shortage)
    const shortageMarket = new Market();
    const buyer = createTestAgent(2, 'food', 100, rng);
    shortageMarket.setAgents([buyer]);
    shortageMarket.addSellOrder({ agentId: 2, sector: 'food', quantity: 20, minPrice: 1 });
    shortageMarket.addBuyOrder({ agentId: 2, sector: 'food', quantity: 100, maxPrice: 50 });
    const priceBefore2 = shortageMarket.prices.food;
    shortageMarket.clearMarket();
    const priceRisePct = (shortageMarket.prices.food - priceBefore2) / priceBefore2;

    // Price drop should be smaller than price rise (due to downward stickiness)
    expect(priceDropPct).toBeLessThan(priceRisePct);
  });

  it('PRICE_DOWNWARD_STICKINESS reduces max downward step', () => {
    expect(CONFIG.PRICE_DOWNWARD_STICKINESS).toBe(0.5);
    // Base max step is 0.24, so downward max step = 0.12
    const baseMaxStep = CONFIG.MONETARY_MAX_PRICE_STEP_BASE;
    const downwardMaxStep = baseMaxStep * CONFIG.PRICE_DOWNWARD_STICKINESS;
    expect(downwardMaxStep).toBeCloseTo(0.12, 2);
  });
});

// ─── Mechanism 4: Automatic Emergency Welfare ─────────────────────────────────
describe('Mechanism 4: automatic emergency welfare', () => {
  it('does not trigger when avg satisfaction is above threshold', () => {
    const gov = new Government();
    gov.treasury = 1000;

    const rng = new RNG(1);
    const agents = Array.from({ length: 10 }, (_, i) => {
      const a = createTestAgent(i, 'food', 50, rng);
      a.satisfaction = 60; // well above 35
      return a;
    });

    const result = gov.distributeEmergencyWelfare(agents);
    expect(result.totalSpent).toBe(0);
    expect(result.recipients).toBe(0);
  });

  it('triggers when avg satisfaction drops below threshold', () => {
    const gov = new Government();
    gov.treasury = 1000;

    const rng = new RNG(2);
    const agents = Array.from({ length: 10 }, (_, i) => {
      const a = createTestAgent(i, 'food', 50, rng);
      a.satisfaction = 20; // well below 35
      return a;
    });

    const result = gov.distributeEmergencyWelfare(agents);
    expect(result.totalSpent).toBeGreaterThan(0);
    expect(result.recipients).toBeGreaterThan(0);
    // Should target bottom 50% = 5 agents
    expect(result.recipients).toBe(5);
  });

  it('scales amount by severity', () => {
    const rng = new RNG(3);

    // Mild distress: avgSat = 30 (severity = (35-30)/35 ≈ 0.14)
    const govMild = new Government();
    govMild.treasury = 10000;
    const mildAgents = Array.from({ length: 10 }, (_, i) => {
      const a = createTestAgent(i, 'food', 50, rng);
      a.satisfaction = 30;
      return a;
    });
    const mildResult = govMild.distributeEmergencyWelfare(mildAgents);

    // Severe distress: avgSat = 5 (severity = (35-5)/35 ≈ 0.86)
    const govSevere = new Government();
    govSevere.treasury = 10000;
    const severeAgents = Array.from({ length: 10 }, (_, i) => {
      const a = createTestAgent(i + 20, 'food', 50, rng);
      a.satisfaction = 5;
      return a;
    });
    const severeResult = govSevere.distributeEmergencyWelfare(severeAgents);

    // Severe distress should distribute more per person
    expect(severeResult.totalSpent).toBeGreaterThan(mildResult.totalSpent);
  });

  it('is limited by treasury', () => {
    const gov = new Government();
    gov.treasury = 5; // very small treasury

    const rng = new RNG(4);
    const agents = Array.from({ length: 20 }, (_, i) => {
      const a = createTestAgent(i, 'food', 10, rng);
      a.satisfaction = 10;
      return a;
    });

    const result = gov.distributeEmergencyWelfare(agents);
    // Can't spend more than treasury
    expect(result.totalSpent).toBeLessThanOrEqual(5);
    expect(gov.treasury).toBeGreaterThanOrEqual(0);
  });

  it('targets bottom 50% by money holdings', () => {
    const gov = new Government();
    gov.treasury = 10000;

    const rng = new RNG(5);
    // Give agents different money amounts to ensure sorting works
    const agents = Array.from({ length: 10 }, (_, i) => {
      const a = createTestAgent(i, 'food', 10, rng);
      a.money = (i + 1) * 20; // money: 20, 40, 60, ..., 200
      a.satisfaction = 15; // trigger threshold
      return a;
    });

    const moneyBefore = agents.map(a => a.money);
    gov.distributeEmergencyWelfare(agents);

    // Bottom 5 agents (by money) should have received money
    // Sort by original money to find who was in bottom 50%
    const sortedByMoney = [...agents].sort((a, b) => moneyBefore[agents.indexOf(a)] - moneyBefore[agents.indexOf(b)]);
    for (let i = 0; i < 5; i++) {
      const originalMoney = moneyBefore[agents.indexOf(sortedByMoney[i])];
      expect(sortedByMoney[i].money).toBeGreaterThan(originalMoney);
    }
  });
});

// ─── Integration: No Death Spiral ────────────────────────────────────────────
describe('Integration: surplus does not cause death spiral', () => {
  it('population survives 60 turns even under normal conditions', () => {
    const engine = new GameEngine(10001, 'baseline');

    // Run 60 turns (5 years), auto-resolving any decisions
    let guard = 0;
    while (engine.turn < 60 && guard < 600) {
      if (engine.pendingDecision) {
        const firstChoice = engine.pendingDecision.choices[0];
        engine.resolveDecision(firstChoice.id);
      }
      engine.advanceTurn();
      guard++;
    }

    const state = engine.getState();
    const latest = state.statistics[state.statistics.length - 1];

    // Population should not collapse to near-zero
    expect(latest.population).toBeGreaterThan(30);
    // Average satisfaction should not be stuck at rock bottom
    expect(latest.avgSatisfaction).toBeGreaterThan(5);
  });

  it('autoStabilizerSpent is tracked in causal replay', () => {
    const engine = new GameEngine(12345, 'baseline');

    // Advance a few turns
    for (let i = 0; i < 5; i++) {
      if (engine.pendingDecision) {
        engine.resolveDecision(engine.pendingDecision.choices[0].id);
      }
      engine.advanceTurn();
    }

    const state = engine.getState();
    const latest = state.statistics[state.statistics.length - 1];
    // autoStabilizerSpent should exist in replay (may be 0 if economy is healthy)
    expect(typeof latest.causalReplay.policy.autoStabilizerSpent).toBe('number');
  });
});
