import type {
  PendingPolicyChange,
  PendingPolicyType,
  PolicyTimelineEntry,
  SectorType,
} from '../../types';
import { te } from '../engineI18n';

interface QueuePolicyChangeInput {
  turn: number;
  policyDelayTurns: number;
  nextPolicyId: number;
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  change: {
    type: PendingPolicyType;
    value: number | boolean | string;
    sector?: SectorType;
    summary: string;
    sideEffects: string[];
  };
}

interface QueuePolicyChangeResult {
  nextPolicyId: number;
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  scheduledPolicy: PendingPolicyChange;
  updatedExisting: boolean;
}

interface MarkPolicyAppliedInput {
  policyTimeline: PolicyTimelineEntry[];
  policy: PendingPolicyChange;
  resolvedTurn: number;
}

const POLICY_TIMELINE_LIMIT = 80;

function buildPendingTimelineEntry(policy: PendingPolicyChange): PolicyTimelineEntry {
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

function upsertPendingTimeline(
  policyTimeline: PolicyTimelineEntry[],
  policy: PendingPolicyChange,
): PolicyTimelineEntry[] {
  const nextEntry = buildPendingTimelineEntry(policy);
  const existingIdx = policyTimeline.findIndex(entry => entry.id === policy.id);
  const nextTimeline = [...policyTimeline];

  if (existingIdx >= 0) {
    nextTimeline[existingIdx] = nextEntry;
    return nextTimeline;
  }

  nextTimeline.unshift(nextEntry);
  if (nextTimeline.length > POLICY_TIMELINE_LIMIT) {
    nextTimeline.pop();
  }
  return nextTimeline;
}

export function queuePolicyChange({
  turn,
  policyDelayTurns,
  nextPolicyId,
  pendingPolicies,
  policyTimeline,
  change,
}: QueuePolicyChangeInput): QueuePolicyChangeResult {
  let scheduledPolicy: PendingPolicyChange = {
    id: `policy_${nextPolicyId}`,
    type: change.type,
    requestedTurn: turn,
    applyTurn: turn + policyDelayTurns,
    value: change.value,
    sector: change.sector,
    summary: change.summary,
    sideEffects: [...change.sideEffects],
  };

  const nextCounter = nextPolicyId + 1;
  const nextPending = [...pendingPolicies];
  const existingIdx = nextPending.findIndex(
    p => p.type === change.type && p.sector === change.sector,
  );
  const updatedExisting = existingIdx >= 0;

  if (updatedExisting) {
    scheduledPolicy = {
      ...scheduledPolicy,
      id: nextPending[existingIdx].id,
    };
    nextPending[existingIdx] = scheduledPolicy;
  } else {
    nextPending.push(scheduledPolicy);
  }

  return {
    nextPolicyId: nextCounter,
    pendingPolicies: nextPending,
    policyTimeline: upsertPendingTimeline(policyTimeline, scheduledPolicy),
    scheduledPolicy,
    updatedExisting,
  };
}

export function markPolicyTimelineApplied({
  policyTimeline,
  policy,
  resolvedTurn,
}: MarkPolicyAppliedInput): PolicyTimelineEntry[] {
  const existingIdx = policyTimeline.findIndex(entry => entry.id === policy.id);
  const nextTimeline = [...policyTimeline];

  if (existingIdx >= 0) {
    nextTimeline[existingIdx] = {
      ...nextTimeline[existingIdx],
      status: 'applied',
      resolvedTurn,
      applyTurn: policy.applyTurn,
      value: policy.value,
      summary: policy.summary,
      sideEffects: [...policy.sideEffects],
    };
    return nextTimeline;
  }

  nextTimeline.unshift({
    id: policy.id,
    type: policy.type,
    requestedTurn: policy.requestedTurn,
    applyTurn: policy.applyTurn,
    resolvedTurn,
    status: 'applied',
    value: policy.value,
    sector: policy.sector,
    summary: policy.summary,
    sideEffects: [...policy.sideEffects],
  });
  return nextTimeline;
}

export function getPolicySideEffects(type: PendingPolicyType, value: number | boolean | string): string[] {
  switch (type) {
    case 'taxMode':
      return value === 'progressive'
        ? [te('engine.side.taxMode.prog1'), te('engine.side.taxMode.prog2')]
        : [te('engine.side.taxMode.flat1'), te('engine.side.taxMode.flat2')];
    case 'tax': {
      const numeric = value as number;
      if (numeric >= 0.25) {
        return [te('engine.side.tax.high1'), te('engine.side.tax.high2')];
      }
      return [te('engine.side.tax.low1'), te('engine.side.tax.low2')];
    }
    case 'subsidy':
      return [te('engine.side.subsidy1'), te('engine.side.subsidy2')];
    case 'welfare':
      return value
        ? [te('engine.side.welfare.on1'), te('engine.side.welfare.on2')]
        : [te('engine.side.welfare.off1'), te('engine.side.welfare.off2')];
    case 'publicWorks':
      return value
        ? [te('engine.side.pw.on1'), te('engine.side.pw.on2')]
        : [te('engine.side.pw.off1'), te('engine.side.pw.off2')];
    case 'policyRate': {
      const numeric = value as number;
      if (numeric >= 0.045) {
        return [te('engine.side.rate.high1'), te('engine.side.rate.high2')];
      }
      if (numeric <= 0.015) {
        return [te('engine.side.rate.low1'), te('engine.side.rate.low2')];
      }
      return [te('engine.side.rate.neutral1'), te('engine.side.rate.neutral2')];
    }
    case 'liquiditySupport':
      return value
        ? [te('engine.side.liquidity.on1'), te('engine.side.liquidity.on2')]
        : [te('engine.side.liquidity.off1'), te('engine.side.liquidity.off2')];
    case 'stockpile':
      return value
        ? [te('engine.side.stockpile.on1'), te('engine.side.stockpile.on2')]
        : [te('engine.side.stockpile.off1'), te('engine.side.stockpile.off2')];
  }
}
