import type {
  PendingPolicyChange,
  PendingPolicyType,
  PolicyTimelineEntry,
  SectorType,
} from '../../types';

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
        ? ['高收入者負擔更多稅賦', '低收入者稅負減輕，有助降低不平等']
        : ['所有人稅率一致，簡單透明', '高收入者稅負較輕，不平等可能加劇'];
    case 'tax': {
      const numeric = value as number;
      if (numeric >= 0.25) {
        return ['國庫收入增加', '消費與需求可能放緩'];
      }
      return ['刺激消費與交易', '國庫累積速度下降'];
    }
    case 'subsidy':
      return ['目標產業產量上升', '可能造成跨產業失衡'];
    case 'welfare':
      return value
        ? ['底層居民現金改善', '國庫支出增加']
        : ['減少財政支出', '弱勢風險升高'];
    case 'publicWorks':
      return value
        ? ['全體生產力短期提升', '每回合固定消耗國庫']
        : ['停止固定支出', '失去公共建設加成'];
    case 'policyRate': {
      const numeric = value as number;
      if (numeric >= 0.045) {
        return ['抑制價格波動與通膨', '消費與成長動能偏弱'];
      }
      if (numeric <= 0.015) {
        return ['刺激消費與交易需求', '價格壓力可能上升'];
      }
      return ['接近中性利率', '兼顧穩定與成長'];
    }
    case 'liquiditySupport':
      return value
        ? ['向低資產家戶注入流動性', '短期穩定民心但增加國庫支出']
        : ['停止注入以保留財政空間', '弱勢現金壓力可能回升'];
  }
}
