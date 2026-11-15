import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { kn } from '../constants/translations';
import { Language } from '../types';
type LanguageValue = { language: Language; setLanguage: (value: Language) => void; t: (value: string) => string };
const Context = createContext<LanguageValue | null>(null);
const LANGUAGE_KEY = 'aaharaconnect-language';
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>('en');
  const changed = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_KEY).then(saved => {
      if (active && !changed.current && (saved === 'en' || saved === 'kn')) setCurrentLanguage(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setLanguage = useCallback((next: Language) => {
    changed.current = true;
    setCurrentLanguage(next);
    void AsyncStorage.setItem(LANGUAGE_KEY, next).catch(() => {});
  }, []);
  const value = useMemo(() => ({ language, setLanguage, t: (value: string) => language === 'kn' ? kn[value] ?? value : value }), [language, setLanguage]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLanguage() { const value = useContext(Context); if (!value) throw new Error('LanguageProvider missing'); return value; }
