import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { AgentState, SectorType } from '../../types';
import styles from './AgentInspector.module.css';

interface Props {
  agent: AgentState;
  onClose: () => void;
}

const SECTOR_LABELS: Record<SectorType, string> = {
  food: '食物業',
  goods: '商品業',
  services: '服務業',
};

export function AgentInspector({ agent, onClose }: Props) {
  const incomeData = agent.incomeHistory.map((v, i) => ({ turn: i, income: v }));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <span className={styles.name}>{agent.name}</span>
            <span className={`${styles.sectorBadge} ${styles[agent.sector]}`}>
              {SECTOR_LABELS[agent.sector]}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!agent.alive && <div className={styles.dead}>此人已離開或死亡</div>}

        <div className={styles.grid}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>金錢 Money</div>
            <div className={styles.statValue}>${agent.money.toFixed(1)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>生產力 Productivity</div>
            <div className={styles.statValue}>{agent.productivity.toFixed(2)}x</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>健康 Health</div>
            <div className={styles.statValue}>{agent.health.toFixed(0)}%</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>滿意度 Satisfaction</div>
            <div className={styles.statValue}>{agent.satisfaction.toFixed(0)}%</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>低收入回合</div>
            <div className={styles.statValue}>{agent.lowIncomeTurns}/3</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>在職回合</div>
            <div className={styles.statValue}>{agent.turnsInSector}</div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>庫存 Inventory</div>
          {(['food', 'goods', 'services'] as const).map(sector => (
            <div key={sector} className={styles.inventoryRow}>
              <span>{SECTOR_LABELS[sector]}</span>
              <span>{agent.inventory[sector].toFixed(2)}</span>
            </div>
          ))}
        </div>

        {incomeData.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>收入歷史 Income</div>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={incomeData}>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#64ffda"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
