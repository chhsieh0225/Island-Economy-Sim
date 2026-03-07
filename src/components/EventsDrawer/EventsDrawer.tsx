import { lazy, memo, Suspense, useState } from 'react';
import type { AgentState, GameEvent, ActiveRandomEvent, MilestoneRecord } from '../../types';
import { useI18n } from '../../i18n/useI18n';
import styles from './EventsDrawer.module.css';

const EventLog = lazy(async () => {
  const module = await import('../EventLog/EventLog');
  return { default: module.EventLog };
});

const MilestonePanel = lazy(async () => {
  const module = await import('../MilestonePanel/MilestonePanel');
  return { default: module.MilestonePanel };
});

interface Props {
  events: GameEvent[];
  activeRandomEvents: ActiveRandomEvent[];
  milestones: MilestoneRecord[];
  agents: AgentState[];
  onAgentClick: (agent: AgentState) => void;
}

export const EventsDrawer = memo(function EventsDrawer({
  events,
  activeRandomEvents,
  milestones,
  agents,
  onAgentClick,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'events' | 'milestones'>('events');

  return (
    <div>
      <div className={styles.tabRow}>
        <button
          className={`${styles.tabBtn} ${tab === 'events' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('events')}
        >
          {t('tabs.events')}
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'milestones' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('milestones')}
        >
          {t('tabs.milestones')}
        </button>
      </div>

      <Suspense fallback={<div style={{ color: '#8892b0', fontSize: 12 }}>{t('common.loading')}</div>}>
        {tab === 'events' && (
          <EventLog events={events} activeRandomEvents={activeRandomEvents} />
        )}
        {tab === 'milestones' && (
          <MilestonePanel milestones={milestones} agents={agents} onAgentClick={onAgentClick} />
        )}
      </Suspense>
    </div>
  );
});
