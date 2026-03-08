import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { AgentState, SectorType } from '../../types';
import { buildAgentDialogue } from '../../data/agentDialogue';
import { useI18n } from '../../i18n/useI18n';
import styles from './AgentInspector.module.css';

interface Props {
  agent: AgentState;
  onClose: () => void;
}

export function AgentInspector({ agent, onClose }: Props) {
  const { t, locale } = useI18n();
  const en = locale === 'en';
  const incomeData = agent.incomeHistory.map((v, i) => ({ turn: i, income: v }));
  const lifeEvents = [...agent.lifeEvents].reverse();
  const ageYears = Math.floor(agent.age / 12);
  const ageMonths = agent.age % 12;
  const maxAgeYears = Math.floor(agent.maxAge / 12);
  const lifeProgress = Math.min(100, (agent.age / agent.maxAge) * 100);

  const sectorLabel = (s: SectorType) => t(`sector.${s}`) + t('agent.sectorSuffix');

  const genderIcon = agent.gender === 'M' ? '♂' : '♀';
  const genderLabel = agent.gender === 'M' ? t('agent.gender.male') : t('agent.gender.female');
  const ageGroupLabel = t(`ageGroup.${agent.ageGroup}`);
  const goalLabel = t(`agent.goal.${agent.goalType}`);

  const iqColor = agent.intelligence >= 115 ? '#4caf50'
    : agent.intelligence >= 85 ? '#ccd6f6'
    : '#ff9800';

  const luckDisplay = agent.baseLuck >= 0
    ? `+${(agent.baseLuck * 100).toFixed(0)}%`
    : `${(agent.baseLuck * 100).toFixed(0)}%`;
  const netIncomeDisplay = agent.lastNetIncome >= 0
    ? `+$${agent.lastNetIncome.toFixed(1)}`
    : `-$${Math.abs(agent.lastNetIncome).toFixed(1)}`;

  const causeLabel = agent.causeOfDeath === 'age' ? t('agent.causeOfDeath.age')
    : agent.causeOfDeath === 'health' ? t('agent.causeOfDeath.health')
    : agent.causeOfDeath === 'left' ? t('agent.causeOfDeath.left')
    : t('agent.causeOfDeath.unknown');

  const lifeBarText = t('agent.lifeBar')
    .replace('{ageY}', String(ageYears))
    .replace('{ageM}', String(ageMonths))
    .replace('{maxY}', String(maxAgeYears));

  const dialogue = buildAgentDialogue({
    sector: agent.sector,
    goalType: agent.goalType,
    age: agent.age,
    money: agent.money,
    health: agent.health,
    satisfaction: agent.satisfaction,
    alive: agent.alive,
    savings: agent.savings,
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={agent.name} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <span className={styles.genderIcon}>{genderIcon}</span>
            <span className={styles.name}>{agent.name}</span>
            <span className={`${styles.sectorBadge} ${styles[agent.sector]}`}>
              {sectorLabel(agent.sector)}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.dialogueBubble}>
          <span className={styles.moodEmoji}>{dialogue.moodEmoji}</span>
          <div className={styles.dialogueContent}>
            <div className={styles.speech}>{en ? dialogue.speechEn : dialogue.speech}</div>
            <div className={styles.thought}>{en ? dialogue.thoughtEn : dialogue.thought}</div>
          </div>
        </div>

        <div className={styles.lifeBar}>
          <div className={styles.lifeBarLabel}>{lifeBarText}</div>
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
            <div className={styles.statLabel}>{t('agent.stat.gender')}</div>
            <div className={styles.statValue}>{genderIcon} {genderLabel}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.age')}</div>
            <div className={styles.statValue}>{ageYears} {t('agent.ageSuffix')}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.ageGroup')}</div>
            <div className={styles.statValue}>{ageGroupLabel}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.iq')}</div>
            <div className={styles.statValue} style={{ color: iqColor }}>{agent.intelligence}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.luck')}</div>
            <div className={styles.statValue} style={{ color: agent.baseLuck >= 0 ? '#4caf50' : '#f44336' }}>
              {luckDisplay}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.money')}</div>
            <div className={styles.statValue}>${agent.money.toFixed(1)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.savings')}</div>
            <div className={styles.statValue}>${agent.savings.toFixed(1)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.netIncome')}</div>
            <div
              className={styles.statValue}
              style={{ color: agent.lastNetIncome >= 0 ? '#4caf50' : '#ff7043' }}
            >
              {netIncomeDisplay}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.productivity')}</div>
            <div className={styles.statValue}>{agent.productivity.toFixed(2)}x</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.health')}</div>
            <div className={styles.statValue}>{agent.health.toFixed(0)}%</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.satisfaction')}</div>
            <div className={styles.statValue}>{agent.satisfaction.toFixed(0)}%</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.turnsInSector')}</div>
            <div className={styles.statValue}>{agent.turnsInSector}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.family')}</div>
            <div className={styles.statValue}>#{agent.familyId}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t('agent.stat.goal')}</div>
            <div className={styles.statValue}>{goalLabel}</div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>{t('agent.section.inventory')}</div>
          {(['food', 'goods', 'services'] as const).map(sector => (
            <div key={sector} className={styles.inventoryRow}>
              <span>{sectorLabel(sector)}</span>
              <span>{agent.inventory[sector].toFixed(2)}</span>
            </div>
          ))}
        </div>

        {incomeData.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('agent.section.incomeHistory')}</div>
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

        <div className={styles.section}>
          <div className={styles.sectionTitle}>{t('agent.section.lifeEvents')}</div>
          {lifeEvents.length === 0 ? (
            <div className={styles.lifeEventEmpty}>{t('agent.lifeEvents.empty')}</div>
          ) : (
            <div className={styles.lifeEventList}>
              {lifeEvents.map((event, idx) => (
                <div key={idx} className={styles.lifeEventItem}>
                  <span className={styles.lifeEventTurn}>[{event.turn}]</span>
                  <span className={styles.lifeEventText}>{event.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
