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
  const ageYears = Math.floor(agent.age / 12);
  const ageMonths = agent.age % 12;
  const maxAgeYears = Math.floor(agent.maxAge / 12);
  const lifeProgress = Math.min(100, (agent.age / agent.maxAge) * 100);

  const genderIcon = agent.gender === 'M' ? '♂' : '♀';
  const genderLabel = agent.gender === 'M' ? '男' : '女';

  const iqColor = agent.intelligence >= 115 ? '#4caf50'
    : agent.intelligence >= 85 ? '#ccd6f6'
    : '#ff9800';

  const luckDisplay = agent.baseLuck >= 0
    ? `+${(agent.baseLuck * 100).toFixed(0)}%`
    : `${(agent.baseLuck * 100).toFixed(0)}%`;

  const causeLabel = agent.causeOfDeath === 'age' ? '因年老去世'
    : agent.causeOfDeath === 'health' ? '因病去世'
    : agent.causeOfDeath === 'left' ? '已離開小島'
    : '此人已離開或死亡';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <span className={styles.genderIcon}>{genderIcon}</span>
            <span className={styles.name}>{agent.name}</span>
            <span className={`${styles.sectorBadge} ${styles[agent.sector]}`}>
              {SECTOR_LABELS[agent.sector]}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.lifeBar}>
          <div className={styles.lifeBarLabel}>
            {ageYears}歲{ageMonths}月 / {maxAgeYears}歲
          </div>
          <div className={styles.lifeBarTrack}>
            <div
              className={styles.lifeBarFill}
              style={{
                width: `${lifeProgress}%`,
                background: lifeProgress > 80 ? '#f44336' : lifeProgress > 60 ? '#ff9800' : '#64ffda',
              }}
            />
          </div>
        </div>

        {!agent.alive && <div className={styles.dead}>{causeLabel}</div>}

        <div className={styles.grid}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>性別 Gender</div>
            <div className={styles.statValue}>{genderIcon} {genderLabel}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>年齡 Age</div>
            <div className={styles.statValue}>{ageYears} 歲</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>智力 IQ</div>
            <div className={styles.statValue} style={{ color: iqColor }}>{agent.intelligence}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>運氣 Luck</div>
            <div className={styles.statValue} style={{ color: agent.baseLuck >= 0 ? '#4caf50' : '#f44336' }}>
              {luckDisplay}
            </div>
          </div>
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
