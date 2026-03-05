import { create } from 'zustand';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';

export type Locale = 'zh-TW' | 'en';

type FlatMessages = Record<string, string>;

const MESSAGES: Record<Locale, FlatMessages> = {
  'zh-TW': zhTW as FlatMessages,
  en: en as FlatMessages,
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

function readSavedLocale(): Locale {
  try {
    const raw = window.localStorage.getItem('econ_sim_locale');
    if (raw === 'en') return 'en';
  } catch { /* ignore */ }
  return 'zh-TW';
}

export const useLocaleStore = create<I18nState>((set) => ({
  locale: readSavedLocale(),
  setLocale: (locale) => {
    set({ locale });
    try { window.localStorage.setItem('econ_sim_locale', locale); } catch { /* ignore */ }
  },
}));

/** Get translated string for the current locale. Falls back to key if not found. */
export function t(key: string): string {
  const locale = useLocaleStore.getState().locale;
  return MESSAGES[locale]?.[key] ?? MESSAGES['zh-TW']?.[key] ?? key;
}

/** Get bilingual string "中文 English". Useful for labels that should show both. */
export function tBi(key: string): string {
  const zh = MESSAGES['zh-TW']?.[key] ?? key;
  const enVal = MESSAGES.en?.[key] ?? key;
  if (zh === enVal) return zh;
  return `${zh} ${enVal}`;
}

/** Get sector label for the current locale */
export function tSector(sector: string): string {
  return t(`sector.${sector}`);
}

/** Get bilingual sector label */
export function tSectorBi(sector: string): string {
  return tBi(`sector.${sector}`);
}
