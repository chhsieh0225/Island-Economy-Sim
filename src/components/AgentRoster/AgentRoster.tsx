import { useState, useMemo, memo } from 'react';
import type { AgentState, SectorType } from '../../types';
import styles from './AgentRoster.module.css';

interface Props {
  agents: AgentState[];
  onAgentClick: (agent: AgentState) => void;
}

const SECTOR_COLORS: Record<SectorType, string> = {
  food: '#4caf50',
  goods: '#2196f3',
  services: '#ff9800',
};

type SortKey = 'name' | 'money' | 'health' | 'satisfaction' | 'age' | 'intelligence';

export const AgentRoster = memo(function AgentRoster({ agents, onAgentClick }: Props) {
  const [filterSector, setFilterSector] = useState<SectorType | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showDeparted, setShowDeparted] = useState(false);

  const alive = useMemo(() => {
    let list = agents.filter(a => a.alive);
    if (filterSector !== 'all') {
      list = list.filter(a => a.sector === filterSector);
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name, 'zh-Hant');
        case 'money': return b.money - a.money;
        case 'health': return a.health - b.health;
        case 'satisfaction': return a.satisfaction - b.satisfaction;
        case 'age': return b.age - a.age;
        case 'intelligence': return b.intelligence - a.intelligence;
      }
    });
    return list;
  }, [agents, filterSector, sortKey]);

  const departed = useMemo(() => agents.filter(a => !a.alive), [agents]);

  const aliveCount = agents.filter(a => a.alive).length;
  const totalCount = agents.length;

  const deathLabel = (agent: AgentState) => {
    if (agent.causeOfDeath === 'age') return '年老';
    if (agent.causeOfDeath === 'health') return '病故';
    if (agent.causeOfDeath === 'left') return '離開';
    return '離世';
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>居民名冊 Residents</span>
        <span className={styles.count}>{aliveCount}/{totalCount}</span>
      </div>

      <div className={styles.filterRow}>
        <select
          className={styles.select}
          value={filterSector}
          onChange={e => setFilterSector(e.target.value as SectorType | 'all')}
        >
          <option value="all">全部 All</option>
          <option value="food">食物 Food</option>
          <option value="goods">商品 Goods</option>
          <option value="services">服務 Services</option>
        </select>
        <select
          className={styles.select}
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
        >
          <option value="name">姓名</option>
          <option value="money">財富</option>
          <option value="health">健康</option>
          <option value="satisfaction">滿意度</option>
          <option value="age">年齡</option>
          <option value="intelligence">智力</option>
        </select>
      </div>

      <div className={styles.list}>
        {alive.map(agent => (
          <div
            key={agent.id}
            className={styles.row}
            onClick={() => onAgentClick(agent)}
          >
            <span className={styles.genderIcon}>{agent.gender === 'M' ? '♂' : '♀'}</span>
            <span className={styles.dot} style={{ background: SECTOR_COLORS[agent.sector] }} />
            <span className={styles.name}>{agent.name}</span>
            <span className={styles.age}>{Math.floor(agent.age / 12)}歲</span>
            <span className={styles.iq}>IQ {agent.intelligence}</span>
            <span className={styles.money}>${agent.money.toFixed(0)}</span>
            <div className={styles.barStack}>
              <div className={styles.miniBar}>
                <div
                  className={styles.miniBarFill}
                  style={{
                    width: `${agent.health}%`,
                    background: agent.health > 60 ? '#4caf50' : agent.health > 30 ? '#ff9800' : '#f44336',
                  }}
                />
              </div>
              <div className={styles.miniBar}>
                <div
                  className={styles.miniBarFill}
                  style={{
                    width: `${agent.satisfaction}%`,
                    background: agent.satisfaction > 60 ? '#64ffda' : agent.satisfaction > 30 ? '#ffb74d' : '#ef5350',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {departed.length > 0 && (
        <div className={styles.departedSection}>
          <button
            className={styles.departedToggle}
            onClick={() => setShowDeparted(!showDeparted)}
          >
            {showDeparted ? '▼' : '▶'} 已離開 Departed ({departed.length})
          </button>
          {showDeparted && (
            <div className={styles.departedList}>
              {departed.map(agent => (
                <div
                  key={agent.id}
                  className={`${styles.row} ${styles.rowDead}`}
                  onClick={() => onAgentClick(agent)}
                >
                  <span className={styles.genderIcon}>{agent.gender === 'M' ? '♂' : '♀'}</span>
                  <span className={styles.dot} style={{ background: '#555' }} />
                  <span className={styles.name}>{agent.name}</span>
                  <span className={styles.deathCause}>{deathLabel(agent)} · {Math.floor(agent.age / 12)}歲</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
