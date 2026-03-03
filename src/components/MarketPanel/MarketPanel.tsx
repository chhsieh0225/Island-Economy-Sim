import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { IslandTerrainState, MarketState, SectorType } from '../../types';
import styles from './MarketPanel.module.css';

interface Props {
  market: MarketState;
  terrain: IslandTerrainState;
}

const SECTOR_COLORS = { food: '#4caf50', goods: '#2196f3', services: '#ff9800' };
const SECTOR_LABELS = { food: '食物 Food', goods: '商品 Goods', services: '服務 Services' };

function SupplyDemandChart({ market }: { market: MarketState }) {
  const sectors: { key: SectorType; label: string; color: string }[] = [
    { key: 'food', label: '食物', color: '#4caf50' },
    { key: 'goods', label: '商品', color: '#2196f3' },
    { key: 'services', label: '服務', color: '#ff9800' },
  ];

  return (
    <div className={styles.sdContainer}>
      {sectors.map(({ key, label, color }) => {
        const supply = market.supply[key];
        const demand = market.demand[key];
        const price = market.prices[key];
        const maxQ = Math.max(supply, demand, 1) * 1.3;
        const maxP = price * 2;

        // Supply curve: price increases with quantity (upward sloping)
        // Demand curve: price decreases with quantity (downward sloping)
        const supplyX1 = 30, supplyY1 = 120;
        const supplyX2 = 30 + (supply / maxQ) * 140, supplyY2 = 120 - (price / maxP) * 100;
        const demandX1 = 30, demandY1 = 20;
        const demandX2 = 30 + (demand / maxQ) * 140, demandY2 = 120 - (price / maxP) * 100;

        // Equilibrium point
        const eqX = 30 + (Math.min(supply, demand) / maxQ) * 140;
        const eqY = 120 - (price / maxP) * 100;

        const englishLabel = label === '食物' ? 'Food' : label === '商品' ? 'Goods' : 'Services';

        return (
          <div key={key} className={styles.sdChart}>
            <div className={styles.sdLabel} style={{ color }}>{label} {englishLabel}</div>
            <svg viewBox="0 0 200 140" className={styles.sdSvg}>
              {/* Axes */}
              <line x1="30" y1="120" x2="180" y2="120" stroke="#233554" strokeWidth="1" />
              <line x1="30" y1="120" x2="30" y2="10" stroke="#233554" strokeWidth="1" />
              <text x="180" y="135" fill="#8892b0" fontSize="9" textAnchor="end">數量 Q</text>
              <text x="10" y="15" fill="#8892b0" fontSize="9">價格 P</text>

              {/* Supply curve (upward) */}
              <line x1={supplyX1} y1={supplyY1} x2={supplyX2} y2={supplyY2} stroke="#4caf50" strokeWidth="2" strokeDasharray="4,2" />
              <text x={supplyX2 + 4} y={supplyY2} fill="#4caf50" fontSize="8">S</text>

              {/* Demand curve (downward) */}
              <line x1={demandX1} y1={demandY1} x2={demandX2} y2={demandY2} stroke="#f44336" strokeWidth="2" strokeDasharray="4,2" />
              <text x={demandX2 + 4} y={demandY2} fill="#f44336" fontSize="8">D</text>

              {/* Equilibrium point */}
              <circle cx={eqX} cy={eqY} r="4" fill={color} stroke="#fff" strokeWidth="1" />

              {/* Price/Quantity labels */}
              <text x={eqX} y={eqY - 8} fill={color} fontSize="8" textAnchor="middle">${price.toFixed(1)}</text>

              {/* Supply/Demand values */}
              <text x="35" y="135" fill="#4caf50" fontSize="8">S:{supply.toFixed(0)}</text>
              <text x="100" y="135" fill="#f44336" fontSize="8">D:{demand.toFixed(0)}</text>
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export function MarketPanel({ market, terrain }: Props) {
  const chartData = useMemo(() => {
    const len = market.priceHistory.food.length;
    const data = [];
    const start = Math.max(0, len - 50); // Show last 50 turns
    for (let i = start; i < len; i++) {
      data.push({
        turn: i,
        food: market.priceHistory.food[i],
        goods: market.priceHistory.goods[i],
        services: market.priceHistory.services[i],
      });
    }
    return data;
  }, [market.priceHistory]);

  const [chartView, setChartView] = useState<'history' | 'sd'>('history');

  const priceTrend = (sector: keyof typeof SECTOR_COLORS) => {
    const h = market.priceHistory[sector];
    if (h.length < 2) return '';
    const diff = h[h.length - 1] - h[h.length - 2];
    const pct = ((diff / h[h.length - 2]) * 100).toFixed(1);
    if (diff > 0.1) return `+${pct}%`;
    if (diff < -0.1) return `${pct}%`;
    return '0%';
  };

  const trendClass = (sector: keyof typeof SECTOR_COLORS) => {
    const h = market.priceHistory[sector];
    if (h.length < 2) return '';
    const diff = h[h.length - 1] - h[h.length - 2];
    return diff > 0.1 ? styles.up : diff < -0.1 ? styles.down : '';
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>市場價格 Market Prices</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>產業</th>
            <th>價格</th>
            <th>趨勢</th>
            <th>供給</th>
            <th>需求</th>
            <th>成交量</th>
            <th>地貌</th>
          </tr>
        </thead>
        <tbody>
          {(['food', 'goods', 'services'] as const).map(sector => (
            <tr key={sector}>
              <td className={styles[sector]}>{SECTOR_LABELS[sector]}</td>
              <td>${market.prices[sector].toFixed(1)}</td>
              <td className={trendClass(sector)}>{priceTrend(sector)}</td>
              <td>{market.supply[sector].toFixed(1)}</td>
              <td>{market.demand[sector].toFixed(1)}</td>
              <td>{market.volume[sector].toFixed(1)}</td>
              <td className={terrain.sectorSuitability[sector] >= 1 ? styles.terrainUp : styles.terrainDown}>
                {(terrain.sectorSuitability[sector] >= 1 ? '+' : '') + ((terrain.sectorSuitability[sector] - 1) * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.chartToggle}>
        <button
          className={chartView === 'history' ? styles.chartToggleActive : styles.chartToggleBtn}
          onClick={() => setChartView('history')}
        >
          📈 價格歷史
        </button>
        <button
          className={chartView === 'sd' ? styles.chartToggleActive : styles.chartToggleBtn}
          onClick={() => setChartView('sd')}
        >
          📊 供需圖
        </button>
      </div>

      {chartView === 'history' ? (
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
              <XAxis dataKey="turn" stroke="#8892b0" fontSize={10} />
              <YAxis stroke="#8892b0" fontSize={10} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #233554', borderRadius: 4 }}
                labelStyle={{ color: '#ccd6f6' }}
              />
              <Legend />
              <Line type="monotone" dataKey="food" stroke={SECTOR_COLORS.food} name="食物" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="goods" stroke={SECTOR_COLORS.goods} name="商品" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="services" stroke={SECTOR_COLORS.services} name="服務" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <SupplyDemandChart market={market} />
      )}
    </div>
  );
}
