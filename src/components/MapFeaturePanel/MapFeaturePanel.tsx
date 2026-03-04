import type { GameState } from '../../types';
import { getResidentialBlockCount } from '../IslandMap/agentAnimator';
import type { MapFeatureType } from '../IslandMap/IslandMap';
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

export function MapFeaturePanel({
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
  const foodWorkers = alive.filter(a => a.sector === 'food').length;
  const foodSupply = state.market.supply.food;
  const foodDemand = state.market.demand.food;
  const foodCoverage = foodDemand > 0.01 ? foodSupply / foodDemand : 1;
  const foodCoveragePct = (foodCoverage * 100).toFixed(0);
  const foodSuitabilityPct = ((state.terrain.sectorSuitability.food - 1) * 100).toFixed(0);

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

    return {
      title: '🌾 農地生產面板',
      subtitle: '基礎民生由農地穩定供應，缺口會快速打擊民心。',
      metrics: [
        { label: '食物供給', value: foodSupply.toFixed(1) },
        { label: '食物需求', value: foodDemand.toFixed(1) },
        { label: '供需覆蓋率', value: `${foodCoveragePct}%`, tone: foodCoverage >= 1 ? 'good' : 'warn' },
        { label: '農業從業人口', value: `${foodWorkers} 人` },
        { label: '食物價格', value: `$${state.market.prices.food.toFixed(2)}` },
        { label: '地貌適性', value: `${foodSuitabilityPct.startsWith('-') ? '' : '+'}${foodSuitabilityPct}%` },
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
}
