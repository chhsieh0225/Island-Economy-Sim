import assert from 'node:assert/strict';
import test from 'node:test';

import type { GovernmentState } from '../../src/types';
import type { PolicyExperimentCard } from '../../src/engine/modules/policyExperimentModule';
import { buildPolicyRecommendation } from '../../src/engine/modules/policyRecommendationModule';

function government(overrides?: Partial<GovernmentState>): GovernmentState {
  return {
    treasury: 120,
    taxRate: 0.2,
    subsidies: { food: 20, goods: 20, services: 20 },
    welfareEnabled: false,
    publicWorksActive: false,
    ...overrides,
  };
}

function card(overrides?: Partial<PolicyExperimentCard>): PolicyExperimentCard {
  return {
    id: 'policy_1',
    type: 'tax',
    summary: '稅率調整至 20%',
    value: 0.2,
    requestedTurn: 6,
    applyTurn: 7,
    windowEndTurn: 9,
    observedTurn: 9,
    status: 'complete',
    predictions: ['國庫收入增加', '消費與需求可能放緩'],
    metrics: {
      satisfactionDelta: -1.2,
      treasuryDelta: 12,
      gdpDeltaPercent: -3.1,
      populationDelta: -1,
    },
    ...overrides,
  };
}

test('policy recommendation: suggests tax cut when wellbeing declines after tax policy', () => {
  const recommendation = buildPolicyRecommendation(card(), government({ taxRate: 0.22 }));
  assert.notEqual(recommendation, null);
  if (!recommendation) return;
  assert.equal(recommendation.action.type, 'setTaxRate');
  assert.equal(recommendation.action.value, 0.2);
  assert.match(recommendation.impactHint, /預估\(延遲 1 回合後，生效 1-3 回合\)/);
  assert.match(recommendation.impactHint, /民心 \+/);
  assert.match(recommendation.impactHint, /國庫 -/);
});

test('policy recommendation: suggests enabling public works on growth drop', () => {
  const recommendation = buildPolicyRecommendation(
    card({
      type: 'subsidy',
      sector: 'goods',
      value: 25,
      metrics: {
        satisfactionDelta: 0.2,
        treasuryDelta: -10,
        gdpDeltaPercent: -2.8,
        populationDelta: 0,
      },
    }),
    government({ publicWorksActive: false }),
  );
  assert.notEqual(recommendation, null);
  if (!recommendation) return;
  assert.equal(recommendation.action.type, 'setPublicWorks');
  assert.equal(recommendation.action.value, true);
  assert.match(recommendation.impactHint, /成長 \+/);
  assert.match(recommendation.impactHint, /%/);
});

test('policy recommendation: pending card should not emit actionable recommendation', () => {
  const recommendation = buildPolicyRecommendation(
    card({ status: 'pending', metrics: null }),
    government(),
  );
  assert.equal(recommendation, null);
});
