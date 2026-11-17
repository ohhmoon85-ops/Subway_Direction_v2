'use client';
/**
 * 화면 언어: 휴대폰 언어(navigator.languages) 하나로만 보여 준다.
 * 오른쪽 위 지구본으로 바꿀 수 있고, 고른 언어는 휴대폰(localStorage)에 기억한다.
 * 서버 첫 화면은 Accept-Language(같은 휴대폰 언어)로 그리므로 대부분 바뀌지 않고 그대로 열린다.
 */
import { useCallback, useEffect, useState } from 'react';
import { LANG_LABEL, isLang, langFromList, t } from '@/lib/i18n';
import { LANGS, type Lang } from '@/lib/types';
import { Icon } from './Icon';

const KEY = 'dap_lang';

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function useUserLang(initial: Lang): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    const want = storedLang() ?? langFromList(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
    if (want !== initial) setLangState(want);
  }, [initial]);

  useEffect(() => {
    document.documentElement.lang = lang;
    // 브라우저 탭 제목도 고른 언어로 (지구본으로 바꿨을 때 한글로 남지 않게)
    document.title = t(lang, 'appName');
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* 저장 못 해도 이번 화면에는 적용 */
    }
    // 다음에 서버가 첫 화면을 그릴 때도 같은 언어로
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return [lang, setLang];
}

/** 지구본 아이콘 하나. 누르면 휴대폰 기본 선택 창으로 언어를 고른다. */
export function LangPicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <label className="lang-btn" title={t(lang, 'language')}>
      <Icon name="globe" size={20} />
      <span className="sr-only">{t(lang, 'language')}</span>
      <select value={lang} onChange={(e) => onChange(e.target.value as Lang)} aria-label={t(lang, 'language')}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
