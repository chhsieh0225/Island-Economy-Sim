import assert from 'node:assert/strict';
import test from 'node:test';

import type { PendingPolicyChange, PolicyTimelineEntry } from '../../src/types';
import {
  getPolicySideEffects,
  markPolicyTimelineApplied,
  queuePolicyChange,
} from '../../src/engine/modules/policyModule';

function makePendingPolicy(overrides: Partial<PendingPolicyChange>): PendingPolicyChange {
  return {
    id: 'policy_1',
    type: 'tax',
    requestedTurn: 3,
    applyTurn: 4,
    value: 0.1,
    summary: 'old',
    sideEffects: ['old'],
    ...overrides,
  };
}

function makePendingTimelineEntry(policy: PendingPolicyChange): PolicyTimelineEntry {
  return {
    id: policy.id,
    type: policy.type,
    requestedTurn: policy.requestedTurn,
    applyTurn: policy.applyTurn,
    status: 'pending',
    value: policy.value,
    sector: policy.sector,
    summary: policy.summary,
    sideEffects: [...policy.sideEffects],
  };
}

test('policy module: updating an existing queued policy preserves id and refreshes apply turn', () => {
  const existing = makePendingPolicy({
    id: 'policy_7',
    type: 'tax',
    requestedTurn: 1,
    applyTurn: 2,
    value: 0.14,
    summary: '稅率調整至 14%',
    sideEffects: ['刺激消費與交易', '國庫累積速度下降'],
  });
  const pendingPolicies: PendingPolicyChange[] = [existing];
  const timeline: PolicyTimelineEntry[] = [makePendingTimelineEntry(existing)];

  const result = queuePolicyChange({
    turn: 6,
    policyDelayTurns: 1,
    nextPolicyId: 20,
    pendingPolicies,
    policyTimeline: timeline,
    change: {
      type: 'tax',
      value: 0.22,
      summary: '稅率調整至 22%',
      sideEffects: getPolicySideEffects('tax', 0.22),
    },
  });

  assert.equal(result.updatedExisting, true);
  assert.equal(result.nextPolicyId, 21);
  assert.equal(result.pendingPolicies.length, 1);
  assert.equal(result.pendingPolicies[0].id, 'policy_7');
  assert.equal(result.pendingPolicies[0].applyTurn, 7);
  assert.equal(result.pendingPolicies[0].value, 0.22);
  assert.equal(result.policyTimeline[0].id, 'policy_7');
  assert.equal(result.policyTimeline[0].status, 'pending');
  assert.equal(pendingPolicies[0].value, 0.14);
});

test('policy module: markPolicyTimelineApplied updates status without mutating original array', () => {
  const pending = makePendingPolicy({
    id: 'policy_3',
    type: 'subsidy',
    sector: 'food',
    requestedTurn: 10,
    applyTurn: 11,
    value: 30,
    summary: '食物業補貼調整至 30%',
    sideEffects: ['目標產業產量上升', '可能造成跨產業失衡'],
  });
  const timeline: PolicyTimelineEntry[] = [makePendingTimelineEntry(pending)];

  const applied = markPolicyTimelineApplied({
    policyTimeline: timeline,
    policy: pending,
    resolvedTurn: 11,
  });

  assert.equal(applied.length, 1);
  assert.equal(applied[0].status, 'applied');
  assert.equal(applied[0].resolvedTurn, 11);
  assert.equal(timeline[0].status, 'pending');
});

