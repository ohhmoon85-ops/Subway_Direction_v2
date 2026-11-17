'use client';
/** 필담 화면: 역무원·주변 사람에게 보여 줄 한국어 큰 글씨 (청각 지원 F7) */
import { useEffect, useRef } from 'react';
import { t, withStation } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { Icon } from './Icon';

export function WritingPad({ lang, destKo, destLocal, onClose }: { lang: Lang; destKo: string; destLocal: string; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="pad" role="dialog" aria-modal="true" aria-label={t(lang, 'writingPad')}>
      <div className="row between">
        <span style={{ fontSize: 15, color: '#555' }}>{t(lang, 'padHelp')}</span>
        <button ref={ref} onClick={onClose} aria-label={t(lang, 'close')} style={{ border: 0, background: '#f0f0ee', borderRadius: 999, width: 44, height: 44, display: 'grid', placeItems: 'center', color: '#000' }}>
          <Icon name="close" size={22} />
        </button>
      </div>
      <p className="pad-text" lang="ko">
        {t('ko', 'padUser', { station: withStation('ko', destKo) })}
      </p>
      {lang !== 'ko' && <p style={{ fontSize: 19, color: '#444', borderTop: '1px solid #e5e5e2', paddingTop: 14 }}>{t(lang, 'padUser', { station: withStation(lang, destLocal) })}</p>}
    </div>
  );
}
