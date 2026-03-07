import { memo } from 'react';
import { useI18n } from '../../i18n/useI18n';
import styles from './DrawerNav.module.css';

export type DrawerType = 'stats' | 'policy' | 'market' | 'events' | 'encyclopedia' | 'settings';

interface Props {
  activeDrawer: DrawerType | null;
  onToggle: (drawer: DrawerType) => void;
}

const DRAWER_ITEMS: { id: DrawerType; icon: string; labelKey: string }[] = [
  { id: 'stats', icon: '\u{1F4CA}', labelKey: 'drawer.stats' },
  { id: 'policy', icon: '\u{1F3DB}', labelKey: 'drawer.policy' },
  { id: 'market', icon: '\u{1F3EA}', labelKey: 'drawer.market' },
  { id: 'events', icon: '\u{1F4DC}', labelKey: 'drawer.events' },
  { id: 'encyclopedia', icon: '\u{1F4D6}', labelKey: 'drawer.encyclopedia' },
  { id: 'settings', icon: '\u2699\uFE0F', labelKey: 'drawer.settings' },
];

export const DrawerNav = memo(function DrawerNav({ activeDrawer, onToggle }: Props) {
  const { t } = useI18n();

  return (
    <nav className={styles.nav}>
      {DRAWER_ITEMS.map(item => (
        <button
          key={item.id}
          className={`${styles.btn} ${activeDrawer === item.id ? styles.btnActive : ''}`}
          onClick={() => onToggle(item.id)}
          title={t(item.labelKey)}
          aria-label={t(item.labelKey)}
          aria-pressed={activeDrawer === item.id}
        >
          {item.icon}
          <span className={styles.tooltip}>{t(item.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
});
