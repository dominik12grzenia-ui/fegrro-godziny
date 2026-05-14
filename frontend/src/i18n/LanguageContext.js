import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STRINGS, SUPPORTED_LANGS } from './strings';

const STORAGE_KEY = 'fegrro_lang';

const LanguageContext = createContext(null);

const getInitialLang = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.find((l) => l.code === stored)) return stored;
  } catch {}
  return 'pl';
};

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(getInitialLang);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    try { document.documentElement.lang = lang === 'uk' ? 'uk' : 'pl'; } catch {}
  }, [lang]);

  const t = useCallback((key, vars) => {
    const entry = STRINGS[key];
    if (!entry) {
      // Niewytlumaczony klucz - wroc oryginalny PL fallback z klucza
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Brak tlumaczenia dla klucza: ${key}`);
      }
      return key;
    }
    let s = entry[lang] || entry.pl || key;
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      });
    }
    return s;
  }, [lang]);

  const value = { lang, setLang, t, supported: SUPPORTED_LANGS };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback gdy provider nie owrazil - dziala dla strony admina/magazyniera
    return {
      lang: 'pl',
      setLang: () => {},
      t: (key) => {
        const e = STRINGS[key];
        return (e && e.pl) || key;
      },
      supported: SUPPORTED_LANGS,
    };
  }
  return ctx;
};
