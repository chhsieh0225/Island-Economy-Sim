import { memo } from 'react';
import type { GameState } from '../../types';
import { getResidentialBlockCount } from '../IslandMap/agentAnimator';
import type { MapFeatureType } from '../../stores/uiStore';
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

function sectorTitle(sector: 'food' | 'goods' | 'services'): string {
  if (sector === 'food') return '🌾 農地生產面板';
  if (sector === 'goods') return '🏭 工坊生產面板';
  return '🏢 服務業面板';
}

function sectorSubtitle(sector: 'food' | 'goods' | 'services', unlocked: boolean): string {
  if (!unlocked) {
    return '該產業在目前發展階段尚未完全解鎖，先專注基礎供需。';
  }
  if (sector === 'food') return '基礎民生由農地穩定供應，缺口會快速打擊民心。';
  if (sector === 'goods') return '商品業支撐中間財與就業，供應不足會抑制成長。';
  return '服務業直接連動生活品質與滿意度，成熟後影響更大。';
}

function sectorLabel(sector: 'food' | 'goods' | 'services'): string {
  if (sector === 'food') return '食物';
  if (sector === 'goods') return '商品';
  return '服務';
}

export const MapFeaturePanel = memo(function MapFeaturePanel({
  feature,
  state,
  onClose,
  onJumpToPolicy,
  onJumpToMarket,
  onJumpToRoster,
}: Props) {
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
        title: '🏦 銀行政策與存款',
        subtitle: '影響家戶安全感、流動性與消費動能。',
        metrics: [
          { label: '總存款', value: `$${totalSavings.toFixed(0)}` },
          { label: '人均存款', value: `$${avgSavings.toFixed(1)}` },
          { label: '存款家戶', value: `${savingsHouseholds}/${population}` },
          { label: '政策利率', value: `${(state.government.policyRate * 100).toFixed(2)}%` },
          { label: '流動性支持', value: state.government.liquiditySupportActive ? '啟用' : '停用' },
          { label: '國庫水位', value: `$${state.government.treasury.toFixed(0)}` },
        ],
        actionLabel: '前往政策面板',
        onAction: onJumpToPolicy,
      };
    }

    if (feature === 'residential') {
      return {
        title: '🏘️ 住宅區概況',
        subtitle: '人口成長會擴張住宅區塊，反映聚落演進。',
        metrics: [
          { label: '住宅區塊', value: `${residentialBlocks} 區` },
          { label: '平均每區', value: `${(population / Math.max(1, residentialBlocks)).toFixed(1)} 人` },
          { label: '年齡層', value: `${youthCount}/${adultCount}/${seniorCount}` },
          { label: '低滿意居民', value: `${lowSatCount} 人`, tone: lowSatCount > population * 0.25 ? 'warn' : 'neutral' },
          { label: '平均滿意度', value: `${(population > 0 ? alive.reduce((s, a) => s + a.satisfaction, 0) / population : 0).toFixed(1)}%` },
          { label: '平均健康', value: `${(population > 0 ? alive.reduce((s, a) => s + a.health, 0) / population : 0).toFixed(1)}%` },
        ],
        actionLabel: '前往居民名冊',
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
    const sectorName = sectorLabel(sector);

    return {
      title: sectorTitle(sector),
      subtitle: sectorSubtitle(sector, unlocked),
      metrics: [
        { label: '產業狀態', value: unlocked ? '已開放' : '未開放', tone: unlocked ? 'good' : 'warn' },
        { label: `${sectorName}供給`, value: supply.toFixed(1) },
        { label: `${sectorName}需求`, value: demand.toFixed(1) },
        {
          label: '供需覆蓋率',
          value: `${(coverage * 100).toFixed(0)}%`,
          tone: !unlocked ? 'neutral' : coverage >= 1 ? 'good' : 'warn',
        },
        { label: `${sectorName}從業人口`, value: `${workers} 人` },
        { label: `${sectorName}價格`, value: `$${state.market.prices[sector].toFixed(2)}` },
        { label: '地貌適性', value: `${suitabilityPct.startsWith('-') ? '' : '+'}${suitabilityPct}%` },
      ],
      actionLabel: '前往市場面板',
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
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="關閉地圖細節面板">
          關閉
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
