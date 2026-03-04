import { useMemo, useState } from 'react';
import type { GameState } from '../../types';
import { buildLearningJourney } from '../../learning/journey';
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

export function LearningJourneyPanel({ state, tutorialToastsEnabled, onSetTutorialToasts }: Props) {
  const [activeQuestId, setActiveQuestId] = useState<string>('turn_3');
  const [activeNodeId, setActiveNodeId] = useState<string>('market_signal');
  const { quests, knowledgeNodes } = useMemo(() => buildLearningJourney(state), [state]);

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
        <div className={styles.title}>學習路徑 Learning Journey</div>
        <button
          className={`${styles.toastToggleBtn} ${tutorialToastsEnabled ? styles.toastToggleOn : styles.toastToggleOff}`}
          onClick={() => onSetTutorialToasts(!tutorialToastsEnabled)}
        >
          教學推播：{tutorialToastsEnabled ? '開' : '關'}
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>新手任務線</span>
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
              <span className={styles.questStatus}>{item.done ? '✓' : '○'}</span>
              <span className={styles.questName}>{item.title}</span>
              <span className={styles.questProgress}>{item.progressLabel}</span>
            </button>
          ))}
        </div>

        <div className={styles.detailCard}>
          <div className={styles.detailTitle}>{activeQuest.title}</div>
          <div className={styles.detailLine}>{activeQuest.objective}</div>
          <div className={styles.detailLine}>為什麼：{activeQuest.why}</div>
          <div className={styles.detailLine}>怎麼做：{activeQuest.action}</div>
          <div className={styles.detailBar}>
            <span style={{ width: `${Math.max(4, activeQuest.progress * 100)}%` }} />
          </div>
        </div>

        {nextQuest && (
          <div className={styles.nextHint}>
            下一步建議：{nextQuest.title}
          </div>
        )}
        {!nextQuest && (
          <div className={styles.nextHintDone}>
            新手任務線完成，已進入進階知識串連階段。
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>老手知識串連</span>
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
                <span className={styles.nodeChain}>{node.chain}</span>
                <span className={node.unlocked ? styles.nodeUnlocked : styles.nodeLocked}>
                  {node.unlocked ? '已解鎖' : '未解鎖'}
                </span>
              </div>
              <div className={styles.nodeTitle}>{node.title}</div>
            </button>
          ))}
        </div>

        {activeNode.unlocked ? (
          <div className={styles.detailCard}>
            <div className={styles.detailTitle}>{activeNode.title}</div>
            <div className={styles.detailLine}>概念：{activeNode.concept}</div>
            <div className={styles.detailLine}>你的小島訊號：{activeNode.gameSignal}</div>
            <div className={styles.detailLine}>現實對照：{activeNode.worldLink}</div>
            <div className={styles.detailLine}>下一個練習：{activeNode.nextPrompt}</div>
          </div>
        ) : (
          <div className={styles.lockHint}>
            先完成前面的任務或累積更多回合，會自動解鎖此知識節點。
          </div>
        )}
      </div>
    </div>
  );
}
