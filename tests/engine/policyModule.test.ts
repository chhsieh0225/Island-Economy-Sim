import { describe, it, expect } from 'vitest';

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

describe('policyModule', () => {
  it('updating an existing queued policy preserves id and refreshes apply turn', () => {
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

    expect(result.updatedExisting).toBe(true);
    expect(result.nextPolicyId).toBe(21);
    expect(result.pendingPolicies.length).toBe(1);
    expect(result.pendingPolicies[0].id).toBe('policy_7');
    expect(result.pendingPolicies[0].applyTurn).toBe(7);
    expect(result.pendingPolicies[0].value).toBe(0.22);
    expect(result.policyTimeline[0].id).toBe('policy_7');
    expect(result.policyTimeline[0].status).toBe('pending');
    expect(pendingPolicies[0].value).toBe(0.14);
  });

  it('markPolicyTimelineApplied updates status without mutating original array', () => {
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

    expect(applied.length).toBe(1);
    expect(applied[0].status).toBe('applied');
    expect(applied[0].resolvedTurn).toBe(11);
    expect(timeline[0].status).toBe('pending');
  });
});
