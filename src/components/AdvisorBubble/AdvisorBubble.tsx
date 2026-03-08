import { memo, useCallback } from 'react';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useGameStore } from '../../stores/gameStore';
import { useI18n } from '../../i18n/useI18n';
import type { AdvisorAction, AdvisorPriority, AdvisorSuggestion } from '../../engine/modules/advisorModule';
import type { SectorType } from '../../types';
import styles from './AdvisorBubble.module.css';

/* ────────────────────────────────────────────────────────────────────────────
 * AdvisorBubble — floating bottom-left policy advisor
 *
 * Shows up to 2 proactive suggestions with one-click action buttons.
 * Collapsed state shows just an icon + count badge.
 * ──────────────────────────────────────────────────────────────────────────── */

const PRIORITY_ICON: Record<AdvisorPriority, string> = {
  critical: '\u26A0\uFE0F',   // ⚠️
  warning: '\uD83D\uDCA1',    // 💡
  info: '\u2139\uFE0F',       // ℹ️
};

function applyMutation(action: AdvisorAction['mutation']): void {
  const store = useGameStore.getState();
  switch (action.type) {
    case 'setTaxRate':
      store.setTaxRate(action.value);
      break;
    case 'setSubsidy':
      store.setSubsidy(action.sector as SectorType, action.value);
      break;
    case 'setWelfare':
      store.setWelfare(action.value);
      break;
    case 'setPublicWorks':
      store.setPublicWorks(action.value);
      break;
    case 'setLiquiditySupport':
      store.setLiquiditySupport(action.value);
      break;
    case 'setStockpile':
      store.setStockpile(action.value);
      break;
    case 'setTaxMode':
      store.setTaxMode(action.value);
      break;
    case 'setPolicyRate':
      store.setPolicyRate(action.value);
      break;
  }
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let result = template;
  for (const [k, v] of Object.entries(params)) {
    result = result.replaceAll(`{${k}}`, String(v));
  }
  return result;
}

/* ── Single suggestion card ─────────────────────────────────────────────── */

const SuggestionCard = memo(function SuggestionCard({ suggestion }: { suggestion: AdvisorSuggestion }) {
  const { t } = useI18n();
  const dismiss = useAdvisorStore(s => s.dismiss);

  const handleDismiss = useCallback(() => {
    dismiss(suggestion.category);
  }, [dismiss, suggestion.category]);

  const priorityClass =
    suggestion.priority === 'critical' ? styles.cardCritical
      : suggestion.priority === 'warning' ? styles.cardWarning
        : styles.cardInfo;

  // Translate sector names in messageParams
  const resolvedParams = suggestion.messageParams
    ? Object.fromEntries(
      Object.entries(suggestion.messageParams).map(([k, v]) => {
        if (k === 'sector' && typeof v === 'string') {
          return [k, t(`sector.${v}`)];
        }
        return [k, v];
      }),
    )
    : undefined;

  const message = interpolate(t(suggestion.messageKey), resolvedParams);
  const hint = interpolate(t(suggestion.hintKey), resolvedParams);

  return (
    <div className={`${styles.card} ${priorityClass}`}>
      <div className={styles.cardHeader}>
        <span className={styles.priorityIcon}>{PRIORITY_ICON[suggestion.priority]}</span>
        <span className={styles.cardTitle}>{message}</span>
        <button className={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss">×</button>
      </div>
      <div className={styles.cardHint}>{hint}</div>
      {suggestion.actions.length > 0 && (
        <div className={styles.actions}>
          {suggestion.actions.map((action, i) => {
            const resolvedActionParams = action.labelParams
              ? Object.fromEntries(
                Object.entries(action.labelParams).map(([k, v]) => {
                  if (k === 'sector' && typeof v === 'string') {
                    return [k, t(`sector.${v}`)];
                  }
                  return [k, v];
                }),
              )
              : undefined;
            const label = interpolate(t(action.labelKey), resolvedActionParams);
            return (
              <button
                key={i}
                className={styles.actionBtn}
                onClick={() => applyMutation(action.mutation)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ── Main component ─────────────────────────────────────────────────────── */

export const AdvisorBubble = memo(function AdvisorBubble() {
  const suggestions = useAdvisorStore(s => s.suggestions);
  const collapsed = useAdvisorStore(s => s.collapsed);
  const toggleCollapsed = useAdvisorStore(s => s.toggleCollapsed);
  const { t } = useI18n();

  if (suggestions.length === 0) return null;

  const topPriority = suggestions[0].priority;
  const badgeClass =
    topPriority === 'critical' ? styles.badgeCritical
      : topPriority === 'warning' ? styles.badgeWarning
        : styles.badgeInfo;

  if (collapsed) {
    return (
      <div className={styles.wrapper}>
        <button className={styles.toggleBtn} onClick={toggleCollapsed}>
          <span>{t('advisor.title')}</span>
          <span className={`${styles.badge} ${badgeClass}`}>{suggestions.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggleBtn} onClick={toggleCollapsed}>
        <span>{t('advisor.title')}</span>
        <span className={`${styles.badge} ${badgeClass}`}>{suggestions.length}</span>
      </button>
      {suggestions.map(s => (
        <SuggestionCard key={s.id} suggestion={s} />
      ))}
    </div>
  );
});
