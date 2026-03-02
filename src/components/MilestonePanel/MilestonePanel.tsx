import { useMemo } from 'react';
import type { AgentState, MilestoneRecord } from '../../types';
import styles from './MilestonePanel.module.css';

interface Props {
  milestones: MilestoneRecord[];
  agents: AgentState[];
  onAgentClick: (agent: AgentState) => void;
}

function badgeLabel(kind: MilestoneRecord['kind']): string {
  switch (kind) {
    case 'wealth': return '財富';
    case 'talent': return '天賦';
    case 'longevity': return '長壽';
    case 'career': return '職涯';
    case 'family': return '家族';
    case 'work': return '勞動';
  }
}

export function MilestonePanel({ milestones, agents, onAgentClick }: Props) {
  const agentMap = useMemo(() => {
    const map = new Map<number, AgentState>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const handleClick = (milestone: MilestoneRecord) => {
    if (milestone.agentId === undefined) return;
    const agent = agentMap.get(milestone.agentId);
    if (agent) {
      onAgentClick(agent);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>榮譽里程碑 Milestones</div>

      {milestones.length === 0 ? (
        <div className={styles.empty}>尚未解鎖里程碑，讓小島再跑幾回合看看。</div>
      ) : (
        <div className={styles.list}>
          {milestones.map(milestone => {
            const clickable = milestone.agentId !== undefined && agentMap.has(milestone.agentId);
            return (
              <button
                key={`${milestone.id}_${milestone.turn}`}
                className={`${styles.card} ${clickable ? styles.clickable : styles.static}`}
                onClick={() => handleClick(milestone)}
                disabled={!clickable}
                title={clickable ? '點擊查看居民詳情' : undefined}
              >
                <div className={styles.row}>
                  <span className={styles.badge}>{badgeLabel(milestone.kind)}</span>
                  <span className={styles.turn}>Turn {milestone.turn}</span>
                </div>
                <div className={styles.cardTitle}>{milestone.title}</div>
                <div className={styles.cardDesc}>{milestone.description}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
