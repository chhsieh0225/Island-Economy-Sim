import { useMemo } from 'react';
import type { AgentState, MilestoneRecord } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './MilestonePanel.module.css';

interface Props {
  milestones: MilestoneRecord[];
  agents: AgentState[];
  onAgentClick: (agent: AgentState) => void;
}

export function MilestonePanel({ milestones, agents, onAgentClick }: Props) {
  const { t } = useI18n();
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
      <div className={styles.title}>{t('milestone.title')}</div>

      {milestones.length === 0 ? (
        <div className={styles.empty}>{t('milestone.empty')}</div>
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
                title={clickable ? t('milestone.clickToView') : undefined}
              >
                <div className={styles.row}>
                  <span className={styles.badge}>{t(`milestone.badge.${milestone.kind}`)}</span>
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
