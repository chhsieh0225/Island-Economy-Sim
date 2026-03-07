import type { GameEvent, PendingPolicyChange } from '../../types';
import type { Government } from '../Government';
import { te } from '../engineI18n';

interface ApplyPendingPoliciesInput {
  turn: number;
  pendingPolicies: PendingPolicyChange[];
  government: Government;
  markPolicyApplied: (policy: PendingPolicyChange) => void;
  addEvent: (type: GameEvent['type'], message: string) => void;
}

export function applyPendingPoliciesPhase({
  turn,
  pendingPolicies,
  government,
  markPolicyApplied,
  addEvent,
}: ApplyPendingPoliciesInput): PendingPolicyChange[] {
  if (pendingPolicies.length === 0) return pendingPolicies;

  const due: PendingPolicyChange[] = [];
  const future: PendingPolicyChange[] = [];
  for (const policy of pendingPolicies) {
    if (policy.applyTurn <= turn) {
      due.push(policy);
    } else {
      future.push(policy);
    }
  }

  for (const policy of due) {
    switch (policy.type) {
      case 'tax':
        government.setTaxRate(policy.value as number);
        break;
      case 'taxMode':
        government.setTaxMode(policy.value as 'flat' | 'progressive');
        break;
      case 'subsidy':
        if (policy.sector) {
          government.setSubsidy(policy.sector, policy.value as number);
        }
        break;
      case 'welfare':
        government.setWelfare(policy.value as boolean);
        break;
      case 'publicWorks':
        government.setPublicWorks(policy.value as boolean);
        break;
      case 'policyRate':
        government.setPolicyRate(policy.value as number);
        break;
      case 'liquiditySupport':
        government.setLiquiditySupport(policy.value as boolean);
        break;
      case 'stockpile':
        government.setStockpileEnabled(policy.value as boolean);
        break;
    }

    markPolicyApplied(policy);
    addEvent('positive', te('engine.policyApplied', { summary: policy.summary }));
  }

  return future;
}
