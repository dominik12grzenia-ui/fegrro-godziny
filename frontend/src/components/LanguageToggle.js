import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export const LanguageToggle = ({ className = '' }) => {
  const { lang, setLang, supported } = useLanguage();
  return (
    <div
      className={`inline-flex items-center bg-[#1E2A44] border border-[#3D5378] rounded-full overflow-hidden ${className}`}
      data-testid="language-toggle"
      role="group"
      aria-label="Wybór jezyka / Вибір мови"
    >
      {supported.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            data-testid={`lang-btn-${l.code}`}
            aria-pressed={active}
            className={
              'px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ' +
              (active ? 'bg-[#4F6343] text-white' : 'text-[#F1F5F9] hover:text-white')
            }
            title={l.label}
          >
            {l.flag}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageToggle;
