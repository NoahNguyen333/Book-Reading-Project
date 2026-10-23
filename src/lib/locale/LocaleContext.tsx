'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, translations, TranslationKey } from './translations';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKey;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const STORAGE_KEY = 'app_locale';
const COOKIE_KEY = 'NEXT_LOCALE';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');

  // Initialize from localStorage or cookie on mount
  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (savedLocale === 'vi' || savedLocale === 'en') {
        setLocaleState(savedLocale);
      } else {
        // Check cookie
        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_KEY + '=([^;]+)'));
        const cookieLocale = match ? (match[2] as Locale) : null;
        if (cookieLocale === 'vi' || cookieLocale === 'en') {
          setLocaleState(cookieLocale);
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.cookie = `${COOKIE_KEY}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      // Also update html lang attribute
      document.documentElement.lang = newLocale;
    } catch {
      // Ignore storage errors
    }
  };

  const t = translations[locale] as TranslationKey;

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextType {
  const context = useContext(LocaleContext);
  if (!context) {
    // Graceful fallback if used outside provider (e.g. testing)
    return {
      locale: 'vi',
      setLocale: () => {},
      t: translations.vi as TranslationKey,
    };
  }
  return context;
}
