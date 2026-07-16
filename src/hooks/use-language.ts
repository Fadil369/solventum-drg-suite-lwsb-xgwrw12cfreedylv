import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { translate, type TranslationKey, type Language } from '@/i18n/translations';
interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set({ language: get().language === 'en' ? 'ar' : 'en' }),
    }),
    {
      name: 'language-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
function applyDocumentDirection(language: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
}
// Sync <html dir/lang> immediately (covers the persisted/rehydrated value) and on every change.
applyDocumentDirection(useLanguageStore.getState().language);
useLanguageStore.subscribe((state) => applyDocumentDirection(state.language));
export function useLanguage() {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const toggleLanguage = useLanguageStore((s) => s.toggleLanguage);
  const t = (key: TranslationKey) => translate(key, language);
  return { language, setLanguage, toggleLanguage, t, isRtl: language === 'ar' };
}
