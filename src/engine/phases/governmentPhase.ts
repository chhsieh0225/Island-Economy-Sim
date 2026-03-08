import { CONFIG } from '../../config';
import { te } from '../engineI18n';
import type { GameEvent } from '../../types';
import type { Agent } from '../Agent';
import type { Government } from '../Government';
import type { TurnGovernmentSummary } from '../modules/turnPipelineModule';

export interface GovernmentPhaseInput {
  agents: Agent[];
  government: Government;
  stockpileTreasurySnapshot: number;
  addEvent: (type: GameEvent['type'], message: string) => void;
}

export function runGovernmentPhase(input: GovernmentPhaseInput): TurnGovernmentSummary {
  const { agents, government, stockpileTreasurySnapshot, addEvent } = input;
  const aliveCount = agents.filter(a => a.alive).length;
  const treasuryStart = government.treasury;

  // ── Fiscal injection (money creation) ──────────────────────────────────
  // Simplified monetary expansion: government creates new money each turn,
  // proportional to population. This is the primary money-creation channel.
  const fiscalInjection = aliveCount * CONFIG.FISCAL_INJECTION_PER_CAPITA;
  if (fiscalInjection > 0) {
    government.treasury += fiscalInjection;
    addEvent('info', te('engine.fiscalInjection', {
      amount: fiscalInjection.toFixed(0),
      perCapita: CONFIG.FISCAL_INJECTION_PER_CAPITA.toFixed(1),
    }));
  }

  const rate = government.taxRate;
  const prevTreasuryTax = government.treasury;
  const taxCollected = government.collectTaxes(agents);
  if (taxCollected > 0) {
    const newTreasuryTax = government.treasury;
    addEvent('info', te('engine.taxCollected', { rate: (rate * 100).toFixed(0), amount: taxCollected.toFixed(0), before: prevTreasuryTax.toFixed(0), after: newTreasuryTax.toFixed(0) }));
  }

  const prevTreasuryWelfare = government.treasury;
  const welfareResult = government.distributeWelfare(agents);
  const welfareSpent = welfareResult.totalSpent;
  const welfareRecipients = welfareResult.recipients;
  if (welfareSpent > 0) {
    const afterTreasuryWelfare = government.treasury;
    addEvent('info', te('engine.welfarePaid', { count: welfareRecipients, before: prevTreasuryWelfare.toFixed(0), after: afterTreasuryWelfare.toFixed(0) }));
  }

  const prevTreasuryPW = government.treasury;
  const pwPaid = government.payPublicWorks();
  const publicWorksSpent = pwPaid ? CONFIG.PUBLIC_WORKS_COST_PER_TURN : 0;
  if (pwPaid) {
    addEvent('info', te('engine.publicWorks', { cost: CONFIG.PUBLIC_WORKS_COST_PER_TURN }));
  } else if (government.publicWorksActive === false && prevTreasuryPW < CONFIG.PUBLIC_WORKS_COST_PER_TURN && prevTreasuryPW > 0) {
    // Public works was auto-disabled due to insufficient funds
    addEvent('warning', te('engine.publicWorksDisabled', { treasury: prevTreasuryPW.toFixed(0), cost: CONFIG.PUBLIC_WORKS_COST_PER_TURN }));
  }

  const prevTreasuryLiquidity = government.treasury;
  let liquidityInjected = 0;
  let liquidityRecipients = 0;
  if (government.liquiditySupportActive) {
    const eligible = agents
      .filter(a => a.alive)
      .sort((a, b) => (a.money + a.savings) - (b.money + b.savings));
    const targetCount = Math.max(1, Math.floor(eligible.length * CONFIG.MONETARY_LIQUIDITY_TARGET_PERCENTILE));
    for (const agent of eligible.slice(0, targetCount)) {
      const transfer = Math.min(CONFIG.MONETARY_LIQUIDITY_TRANSFER_PER_AGENT, government.treasury);
      if (transfer <= 0) break;
      agent.receiveMoney(transfer);
      agent.satisfaction = Math.min(100, agent.satisfaction + CONFIG.MONETARY_LIQUIDITY_SAT_BOOST);
      government.treasury -= transfer;
      liquidityInjected += transfer;
      liquidityRecipients++;
    }

    if (liquidityInjected > 0) {
      addEvent(
        'info',
        te('engine.liquidityInjected', { count: liquidityRecipients, before: prevTreasuryLiquidity.toFixed(0), after: government.treasury.toFixed(0) }),
      );
    } else if (prevTreasuryLiquidity <= 0.1) {
      addEvent('warning', te('engine.liquidityBroke'));
    }
  }

  // Automatic fiscal stabilizer: emergency welfare when economy is in distress
  const autoStabilizerResult = government.distributeEmergencyWelfare(agents);
  const autoStabilizerSpent = autoStabilizerResult.totalSpent;
  if (autoStabilizerSpent > 0) {
    addEvent('info', te('engine.autoStabilizer', { count: autoStabilizerResult.recipients, amount: autoStabilizerSpent.toFixed(0) }));
  }

  // Strategic stockpile: compute trade amounts, maintenance & spoilage
  // Treasury now = snapshot + stockpileChange + tax - welfare - pw - liquidity - auto
  // Isolate stockpileChange by subtracting all known fiscal operations:
  const treasuryAfterGov = government.treasury;
  const treasuryChangeFromMarket = treasuryAfterGov - stockpileTreasurySnapshot
    - fiscalInjection - taxCollected + welfareSpent + publicWorksSpent + liquidityInjected + autoStabilizerSpent;
  // If negative, government spent money buying; if positive, government earned from selling
  const stockpileBuySpent = Math.max(0, -treasuryChangeFromMarket);
  const stockpileSellRevenue = Math.max(0, treasuryChangeFromMarket);

  const stockpileMaintenance = government.payStockpileMaintenance();
  government.applySpoilage();

  if (stockpileBuySpent > 0.1) {
    addEvent('info', te('engine.stockpileBuy', { amount: stockpileBuySpent.toFixed(0) }));
  }
  if (stockpileSellRevenue > 0.1) {
    addEvent('info', te('engine.stockpileSell', { amount: stockpileSellRevenue.toFixed(0) }));
  }
  if (stockpileMaintenance > 0 && government.stockpileEnabled) {
    // Only log if still enabled (not auto-disabled due to insufficient funds)
  }

  const treasuryDelta = government.treasury - treasuryStart;
  const perCapitaCashDelta = aliveCount > 0
    ? (welfareSpent + liquidityInjected + autoStabilizerSpent - taxCollected) / aliveCount
    : 0;
  return {
    fiscalInjection,
    taxCollected,
    welfareSpent,
    welfareRecipients,
    publicWorksSpent,
    liquidityInjected,
    liquidityRecipients,
    autoStabilizerSpent,
    stockpileBuySpent,
    stockpileSellRevenue,
    stockpileMaintenance,
    policyRate: government.policyRate,
    treasuryDelta,
    perCapitaCashDelta,
  };
}
