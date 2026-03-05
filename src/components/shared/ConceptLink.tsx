import { memo } from 'react';
import { ENCYCLOPEDIA } from '../../data/encyclopedia';
import { useUiStore } from '../../stores/uiStore';

interface Props {
  entryId: string;
  children?: React.ReactNode;
}

export const ConceptLink = memo(function ConceptLink({ entryId, children }: Props) {
  const entry = ENCYCLOPEDIA.find(e => e.id === entryId);
  if (!entry) return <>{children ?? entryId}</>;

  const handleClick = () => {
    useUiStore.getState().setRightTab('encyclopedia');
    // Scroll to entry after tab switch renders
    requestAnimationFrame(() => {
      const el = document.getElementById(`enc-${entryId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <button
      onClick={handleClick}
      style={{
        background: 'none',
        border: 'none',
        color: '#64ffda',
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
        font: 'inherit',
        fontSize: 'inherit',
        padding: 0,
        display: 'inline',
      }}
      title={`${entry.title} — ${entry.titleEn}`}
    >
      {children ?? entry.title}
    </button>
  );
});
