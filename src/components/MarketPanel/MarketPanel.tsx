import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { MarketState } from '../../types';
import styles from './MarketPanel.module.css';

interface Props {
  market: MarketState;
}

const SECTOR_COLORS = { food: '#4caf50', goods: '#2196f3', services: '#ff9800' };
const SECTOR_LABELS = { food: '食物 Food', goods: '商品 Goods', services: '服務 Services' };

export function MarketPanel({ market }: Props) {
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
            </tr>
          ))}
        </tbody>
      </table>

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
    </div>
  );
}
