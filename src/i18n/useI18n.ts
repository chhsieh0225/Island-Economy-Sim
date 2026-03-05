import { useLocaleStore, t, tBi, tSector, tSectorBi } from './i18n';
import type { Locale } from './i18n';

/**
 * React hook for locale-reactive rendering.
 * Components using this hook will re-render when the locale changes.
 */
export function useI18n() {
  const locale = useLocaleStore(s => s.locale);
  const setLocale = useLocaleStore(s => s.setLocale);
  return { locale, setLocale, t, tBi, tSector, tSectorBi };
}

export type { Locale };
