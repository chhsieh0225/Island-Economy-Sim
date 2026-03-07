import { memo } from 'react';
import type { GameState } from '../../types';
import { getResidentialBlockCount } from '../IslandMap/agentAnimator';
import type { MapFeatureType } from '../../stores/uiStore';
import { useI18n } from '../../i18n/useI18n';
import styles from './MapFeaturePanel.module.css';

interface Props {
  feature: MapFeatureType | null;
  state: GameState;
  onClose: () => void;
  onJumpToPolicy: () => void;
  onJumpToMarket: () => void;
  onJumpToRoster: () => void;
}

interface FeatureDetail {
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'neutral' }>;
  actionLabel: string;
  onAction: () => void;
}

function stageAllowsSector(
  stage: GameState['economyStage'],
  sector: 'food' | 'goods' | 'services',
): boolean {
  if (sector === 'food') return true;
  if (sector === 'goods') return stage !== 'agriculture';
  return stage === 'service';
}

export const MapFeaturePanel = memo(function MapFeaturePanel({
  feature,
  state,
  onClose,
  onJumpToPolicy,
  onJumpToMarket,
  onJumpToRoster,
}: Props) {
  const { t } = useI18n();

  if (!feature) return null;

  const alive = state.agents.filter(a => a.alive);
  const population = alive.length;
  const totalSavings = alive.reduce((sum, agent) => sum + agent.savings, 0);
  const avgSavings = population > 0 ? totalSavings / population : 0;
  const savingsHouseholds = alive.filter(agent => agent.savings > 1).length;
  const residentialBlocks = getResidentialBlockCount(population);
  const youthCount = alive.filter(a => a.ageGroup === 'youth').length;
  const adultCount = alive.filter(a => a.ageGroup === 'adult').length;
  const seniorCount = alive.filter(a => a.ageGroup === 'senior').length;
  const lowSatCount = alive.filter(a => a.satisfaction < 45).length;

  const detail: FeatureDetail = (() => {
    if (feature === 'bank') {
      return {
        title: t('map.bank.title'),
        subtitle: t('map.bank.subtitle'),
        metrics: [
          { label: t('map.bank.totalSavings'), value: `$${totalSavings.toFixed(0)}` },
          { label: t('map.bank.perCapitaSavings'), value: `$${avgSavings.toFixed(1)}` },
          { label: t('map.bank.savingsHouseholds'), value: `${savingsHouseholds}/${population}` },
          { label: t('policy.policyRate'), value: `${(state.government.policyRate * 100).toFixed(2)}%` },
          { label: t('policy.liquiditySupport'), value: state.government.liquiditySupportActive ? t('policy.enabled') : t('policy.disabled') },
          { label: t('map.bank.treasuryLevel'), value: `$${state.government.treasury.toFixed(0)}` },
        ],
        actionLabel: t('map.goToPolicy'),
        onAction: onJumpToPolicy,
      };
    }

    if (feature === 'residential') {
      return {
        title: t('map.residential.title'),
        subtitle: t('map.residential.subtitle'),
        metrics: [
          { label: t('map.residential.blocks'), value: `${residentialBlocks} ${t('map.unit.blocks')}` },
          { label: t('map.residential.perBlock'), value: `${(population / Math.max(1, residentialBlocks)).toFixed(1)} ${t('map.unit.persons')}` },
          { label: t('dashboard.ageLayers'), value: `${youthCount}/${adultCount}/${seniorCount}` },
          { label: t('map.residential.lowSat'), value: `${lowSatCount} ${t('map.unit.persons')}`, tone: lowSatCount > population * 0.25 ? 'warn' : 'neutral' },
          { label: t('map.residential.avgSat'), value: `${(population > 0 ? alive.reduce((s, a) => s + a.satisfaction, 0) / population : 0).toFixed(1)}%` },
          { label: t('map.residential.avgHealth'), value: `${(population > 0 ? alive.reduce((s, a) => s + a.health, 0) / population : 0).toFixed(1)}%` },
        ],
        actionLabel: t('map.goToRoster'),
        onAction: onJumpToRoster,
      };
    }

    const sector: 'food' | 'goods' | 'services' = feature === 'farm'
      ? 'food'
      : feature;
    const unlocked = stageAllowsSector(state.economyStage, sector);
    const workers = alive.filter(a => a.sector === sector).length;
    const supply = state.market.supply[sector];
    const demand = state.market.demand[sector];
    const coverage = demand > 0.01 ? supply / demand : 1;
    const suitabilityPct = ((state.terrain.sectorSuitability[sector] - 1) * 100).toFixed(0);
    const sectorName = t(`sector.${sector}`);
    const titleKey = sector === 'food' ? 'map.sector.farm.title'
      : sector === 'goods' ? 'map.sector.goods.title'
        : 'map.sector.services.title';
    const subtitleKey = !unlocked ? 'map.sector.subtitle.locked' : `map.sector.subtitle.${sector}`;

    return {
      title: t(titleKey),
      subtitle: t(subtitleKey),
      metrics: [
        { label: t('map.sector.status'), value: unlocked ? t('map.sector.unlocked') : t('map.sector.locked'), tone: unlocked ? 'good' : 'warn' },
        { label: `${sectorName} ${t('map.sector.supply')}`, value: supply.toFixed(1) },
        { label: `${sectorName} ${t('map.sector.demand')}`, value: demand.toFixed(1) },
        {
          label: t('map.sector.coverage'),
          value: `${(coverage * 100).toFixed(0)}%`,
          tone: !unlocked ? 'neutral' : coverage >= 1 ? 'good' : 'warn',
        },
        { label: `${sectorName} ${t('map.sector.workers')}`, value: `${workers} ${t('map.unit.persons')}` },
        { label: `${sectorName} ${t('map.sector.price')}`, value: `$${state.market.prices[sector].toFixed(2)}` },
        { label: t('map.sector.suitability'), value: `${suitabilityPct.startsWith('-') ? '' : '+'}${suitabilityPct}%` },
      ],
      actionLabel: t('map.goToMarket'),
      onAction: onJumpToMarket,
    };
  })();

  return (
    <section className={styles.panel} aria-live="polite">
      <div className={styles.head}>
        <div>
          <div className={styles.title}>{detail.title}</div>
          <div className={styles.subtitle}>{detail.subtitle}</div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('map.closePanel')}>
          {t('common.close')}
        </button>
      </div>

      <div className={styles.metrics}>
        {detail.metrics.map(metric => (
          <div key={metric.label} className={styles.metric}>
            <div className={styles.metricLabel}>{metric.label}</div>
            <div
              className={`${styles.metricValue} ${
                metric.tone === 'good' ? styles.metricGood
                  : metric.tone === 'warn' ? styles.metricWarn
                    : ''
              }`}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} onClick={detail.onAction}>
          {detail.actionLabel}
        </button>
      </div>
    </section>
  );
});
