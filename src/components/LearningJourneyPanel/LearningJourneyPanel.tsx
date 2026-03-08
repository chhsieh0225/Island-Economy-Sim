import { useMemo, useState, memo } from 'react';
import type { GameState } from '../../types';
import { buildLearningJourney } from '../../learning/journey';
import { useI18n } from '../../i18n/useI18n';
import styles from './LearningJourneyPanel.module.css';

interface Props {
  state: GameState;
  tutorialToastsEnabled: boolean;
  onSetTutorialToasts: (enabled: boolean) => void;
}

function firstIncomplete(items: ReturnType<typeof buildLearningJourney>['quests']) {
  const next = items.find(item => !item.done);
  return next ?? null;
}

export const LearningJourneyPanel = memo(function LearningJourneyPanel({ state, tutorialToastsEnabled, onSetTutorialToasts }: Props) {
  const { t, locale } = useI18n();
  const zh = locale === 'zh-TW';
  const [activeQuestId, setActiveQuestId] = useState<string>('turn_3');
  const [activeNodeId, setActiveNodeId] = useState<string>('market_signal');
  const { coach, quests, knowledgeNodes } = useMemo(() => buildLearningJourney(state), [state]);

  const completedQuestCount = quests.filter(item => item.done).length;
  const activeQuest = quests.find(item => item.id === activeQuestId) ?? quests[0];
  const nextQuest = firstIncomplete(quests);

  const unlockedNodes = knowledgeNodes.filter(node => node.unlocked);
  const activeNode =
    knowledgeNodes.find(node => node.id === activeNodeId && node.unlocked)
    ?? unlockedNodes[unlockedNodes.length - 1]
    ?? knowledgeNodes[0];

  return (
    <div className={styles.panel}>
      <div className={styles.titleRow}>
        <div className={styles.title}>{t('learning.title')}</div>
        <button
          className={`${styles.toastToggleBtn} ${tutorialToastsEnabled ? styles.toastToggleOn : styles.toastToggleOff}`}
          onClick={() => onSetTutorialToasts(!tutorialToastsEnabled)}
        >
          {t('learning.toastLabel')}: {tutorialToastsEnabled ? t('learning.toastOn') : t('learning.toastOff')}
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>{t('learning.coach')}</span>
          <span>{zh ? coach.phaseLabel : coach.phaseLabelEn}</span>
        </div>
        <div className={styles.coachGoal}>{zh ? coach.phaseGoal : coach.phaseGoalEn}</div>
        <div className={styles.coachDiagnosis}>{zh ? coach.diagnosis : coach.diagnosisEn}</div>

        <div className={styles.coachKeywords}>
          {(zh ? coach.keywords : coach.keywordsEn).map(word => (
            <span key={word} className={styles.keywordChip}>{word}</span>
          ))}
        </div>

        <div className={styles.coachBlockTitle}>{t('learning.turnInterpretation')}</div>
        <div className={styles.coachNarrative}>
          {(zh ? coach.turnNarrative : coach.turnNarrativeEn).map(line => (
            <div key={line} className={styles.coachLine}>{line}</div>
          ))}
        </div>

        <div className={styles.coachBlockTitle}>{t('learning.nextSteps')}</div>
        <div className={styles.coachActionList}>
          {coach.actions.map((action, index) => (
            <div key={action.id} className={styles.coachActionItem}>
              <div className={styles.coachActionHead}>
                <span className={styles.coachActionIndex}>{index + 1}</span>
                <span className={styles.coachActionTitle}>{zh ? action.title : action.titleEn}</span>
              </div>
              <div className={styles.coachLine}>{t('learning.reason')}: {zh ? action.rationale : action.rationaleEn}</div>
              {(zh ? action.steps : action.stepsEn).map(step => (
                <div key={step} className={styles.coachStep}>- {step}</div>
              ))}
              <div className={styles.coachSignal}>{t('learning.expectedSignal')}: {zh ? action.expectedSignal : action.expectedSignalEn}</div>
            </div>
          ))}
        </div>

        <div className={styles.coachBlockTitle}>{t('learning.watchlist')}</div>
        <div className={styles.watchList}>
          {(zh ? coach.watchlist : coach.watchlistEn).map(item => (
            <div key={item} className={styles.watchItem}>{item}</div>
          ))}
        </div>

        <div className={styles.coachFoot}>
          <div>{t('learning.pitfall')}: {zh ? coach.pitfall : coach.pitfallEn}</div>
          <div>{t('learning.economicsLink')}: {zh ? coach.economicsLink : coach.economicsLinkEn}</div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>{t('learning.quests')}</span>
          <span>{completedQuestCount}/{quests.length}</span>
        </div>
        <div className={styles.progressBar}>
          <span style={{ width: `${(completedQuestCount / quests.length) * 100}%` }} />
        </div>
        <div className={styles.questList}>
          {quests.map(item => (
            <button
              key={item.id}
              className={`${styles.questBtn} ${activeQuest.id === item.id ? styles.questBtnActive : ''} ${item.done ? styles.questBtnDone : ''}`}
              onClick={() => setActiveQuestId(item.id)}
            >
              <span className={styles.questStatus}>{item.done ? '\u2713' : '\u25CB'}</span>
              <span className={styles.questName}>{zh ? item.title : item.titleEn}</span>
              <span className={styles.questProgress}>{zh ? item.progressLabel : item.progressLabelEn}</span>
            </button>
          ))}
        </div>

        <div className={styles.detailCard}>
          <div className={styles.detailTitle}>{zh ? activeQuest.title : activeQuest.titleEn}</div>
          <div className={styles.detailLine}>{zh ? activeQuest.objective : activeQuest.objectiveEn}</div>
          <div className={styles.detailLine}>{t('learning.questWhy')}: {zh ? activeQuest.why : activeQuest.whyEn}</div>
          <div className={styles.detailLine}>{t('learning.questAction')}: {zh ? activeQuest.action : activeQuest.actionEn}</div>
          <div className={styles.detailBar}>
            <span style={{ width: `${Math.max(4, activeQuest.progress * 100)}%` }} />
          </div>
        </div>

        {nextQuest && (
          <div className={styles.nextHint}>
            {t('learning.nextSuggestion')}: {zh ? nextQuest.title : nextQuest.titleEn}
          </div>
        )}
        {!nextQuest && (
          <div className={styles.nextHintDone}>
            {t('learning.questsComplete')}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>{t('learning.advanced')}</span>
          <span>{unlockedNodes.length}/{knowledgeNodes.length}</span>
        </div>
        <div className={styles.nodeList}>
          {knowledgeNodes.map(node => (
            <button
              key={node.id}
              className={`${styles.nodeBtn} ${activeNode.id === node.id ? styles.nodeBtnActive : ''}`}
              onClick={() => {
                if (!node.unlocked) return;
                setActiveNodeId(node.id);
              }}
              disabled={!node.unlocked}
            >
              <div className={styles.nodeTitleRow}>
                <span className={styles.nodeChain}>{zh ? node.chain : node.chainEn}</span>
                <span className={node.unlocked ? styles.nodeUnlocked : styles.nodeLocked}>
                  {node.unlocked ? t('learning.unlocked') : t('learning.locked')}
                </span>
              </div>
              <div className={styles.nodeTitle}>{zh ? node.title : node.titleEn}</div>
            </button>
          ))}
        </div>

        {activeNode.unlocked ? (
          <div className={styles.detailCard}>
            <div className={styles.detailTitle}>{zh ? activeNode.title : activeNode.titleEn}</div>
            <div className={styles.detailLine}>{t('learning.concept')}: {zh ? activeNode.concept : activeNode.conceptEn}</div>
            <div className={styles.detailLine}>{t('learning.gameSignal')}: {zh ? activeNode.gameSignal : activeNode.gameSignalEn}</div>
            <div className={styles.detailLine}>{t('learning.worldLink')}: {zh ? activeNode.worldLink : activeNode.worldLinkEn}</div>
            <div className={styles.detailLine}>{t('learning.nextPrompt')}: {zh ? activeNode.nextPrompt : activeNode.nextPromptEn}</div>
          </div>
        ) : (
          <div className={styles.lockHint}>
            {t('learning.lockHint')}
          </div>
        )}
      </div>
    </div>
  );
});
