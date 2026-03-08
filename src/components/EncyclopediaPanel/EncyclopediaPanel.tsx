import { memo, useState, useMemo, useCallback } from 'react';
import { ENCYCLOPEDIA, type EncyclopediaEntry } from '../../data/encyclopedia';
import { useI18n } from '../../i18n/useI18n';
import styles from './EncyclopediaPanel.module.css';

const CATEGORY_ORDER: EncyclopediaEntry['category'][] = ['concept', 'model', 'indicator', 'policy'];

function EntryCard({ entry, onNavigate }: { entry: EncyclopediaEntry; onNavigate: (id: string) => void }) {
  const { t, locale } = useI18n();
  const zh = locale === 'zh-TW';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.card}>
      <button className={styles.cardHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.cardTitle}>{zh ? entry.title : entry.titleEn}</span>
        {zh && <span className={styles.cardTitleEn}>{entry.titleEn}</span>}
        <span className={`${styles.cardChevron} ${expanded ? styles.cardChevronOpen : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className={styles.cardBody}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>{t('encyclopedia.section.intuition')}</div>
            <p className={styles.sectionText}>{zh ? entry.intuition : entry.intuitionEn}</p>
          </div>

          {entry.formula && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('encyclopedia.section.formula')}</div>
              <code className={styles.formula}>{entry.formula}</code>
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionLabel}>{t('encyclopedia.section.gameConnection')}</div>
            <p className={styles.sectionText}>{zh ? entry.gameConnection : entry.gameConnectionEn}</p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>{t('encyclopedia.section.realWorld')}</div>
            <p className={styles.sectionText}>{zh ? entry.realWorldExample : entry.realWorldExampleEn}</p>
          </div>

          {entry.relatedIds.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('encyclopedia.section.related')}</div>
              <div className={styles.relatedLinks}>
                {entry.relatedIds.map(id => {
                  const related = ENCYCLOPEDIA.find(e => e.id === id);
                  if (!related) return null;
                  return (
                    <button
                      key={id}
                      className={styles.relatedLink}
                      onClick={() => onNavigate(id)}
                    >
                      {zh ? related.title : related.titleEn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const EncyclopediaPanel = memo(function EncyclopediaPanel() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<EncyclopediaEntry['category'] | 'all'>('all');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let entries = ENCYCLOPEDIA;
    if (activeCategory !== 'all') {
      entries = entries.filter(e => e.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      entries = entries.filter(
        e =>
          e.title.toLowerCase().includes(q) ||
          e.titleEn.toLowerCase().includes(q) ||
          e.intuition.toLowerCase().includes(q) ||
          e.gameConnection.toLowerCase().includes(q),
      );
    }
    return entries;
  }, [search, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<EncyclopediaEntry['category'], EncyclopediaEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [filtered]);

  const handleNavigate = useCallback((id: string) => {
    const entry = ENCYCLOPEDIA.find(e => e.id === id);
    if (entry) {
      setActiveCategory('all');
      setSearch('');
      setHighlightId(id);
      setTimeout(() => {
        const el = document.getElementById(`enc-${id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setHighlightId(null), 1500);
      }, 50);
    }
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder={t('encyclopedia.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.categoryTabs}>
          <button
            className={`${styles.catTab} ${activeCategory === 'all' ? styles.catTabActive : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            {t('encyclopedia.category.all')}
          </button>
          {CATEGORY_ORDER.map(cat => (
            <button
              key={cat}
              className={`${styles.catTab} ${activeCategory === cat ? styles.catTabActive : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {t(`encyclopedia.category.${cat}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.entries}>
        {filtered.length === 0 && (
          <div className={styles.empty}>{t('encyclopedia.empty')}</div>
        )}
        {CATEGORY_ORDER.filter(cat => grouped.has(cat)).map(cat => (
          <div key={cat} className={styles.group}>
            <div className={styles.groupLabel}>{t(`encyclopedia.category.${cat}`)}</div>
            {grouped.get(cat)!.map(entry => (
              <div
                key={entry.id}
                id={`enc-${entry.id}`}
                className={highlightId === entry.id ? styles.highlight : undefined}
              >
                <EntryCard entry={entry} onNavigate={handleNavigate} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
