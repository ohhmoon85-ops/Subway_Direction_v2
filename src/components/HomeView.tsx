'use client';
/**
 * 첫 화면(S0) — QR을 안 찍고 사이트를 열었을 때만.
 * 휴대폰 언어 하나로만 보여 준다 (여러 언어를 나란히 쓰지 않음). 언어는 오른쪽 위 지구본으로.
 */
import { t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { Icon, LineBadge } from './Icon';
import { LangPicker, useUserLang } from './LangPicker';
import { LocationKeeper } from './LocationKeeper';

export interface DemoSign {
  id: string;
  href: string;
  station: Record<Lang, string>;
  stationKo: string;
  spot: Record<Lang, string>;
  num: string;
  color: string;
}

export function HomeView({
  initialLang,
  demos,
  demoError,
  regionLine,
}: {
  initialLang: Lang;
  demos: DemoSign[] | null;
  demoError: boolean;
  /** "서울·수도권 · 부산 · 대구 · 광주 · 대전" (언어별, 서버에서 만들어 내려줌) */
  regionLine: Record<Lang, string>;
}) {
  const [lang, setLang] = useUserLang(initialLang);
  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const [title1, title2] = T('heroTitle').split('\n');

  return (
    <main className="wrap" lang={lang}>
      <div className="topbar">
        <span className="brand grow">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
          </span>
          {T('appName')}
        </span>
        <LangPicker lang={lang} onChange={setLang} />
      </div>

      <section className="hero" style={{ marginTop: 8 }}>
        <h1>
          {title1}
          {title2 && (
            <>
              <br />
              {title2}
            </>
          )}
        </h1>
        <p>{T('heroBody')}</p>
      </section>

      <LocationKeeper />
      <a className="cta" href="/go">
        <Icon name="locate" size={28} />
        <span className="grow">
          <span className="t">{T('startByLocation')}</span>
          <span className="s">{T('startByLocationSub')}</span>
        </span>
        <Icon name="chevron" size={20} />
      </a>

      <a className="list-btn card" href="/go?pick=line" style={{ padding: '14px 16px' }}>
        <span className="badges" aria-hidden>
          <Icon name="train" size={22} />
        </span>
        <span className="grow">
          <span className="title">{T('pickByLineTitle')}</span>
          <span className="sub">{regionLine[lang]}</span>
        </span>
        <Icon name="chevron" size={18} />
      </a>

      {demoError && (
        <div className="note warn">
          <Icon name="alert" size={18} /> {T('configError')}
        </div>
      )}
      {demos && demos.length > 0 && (
        <details className="col" style={{ gap: 8 }}>
          <summary className="section-label" style={{ cursor: 'pointer' }}>
            {T('demoTitle')}
          </summary>
          <ul className="list">
            {demos.map((s) => (
              <li key={s.id}>
                <a className="list-btn" href={s.href}>
                  <span className="badges">
                    <LineBadge num={s.num} color={s.color} size="sm" />
                  </span>
                  <span className="grow">
                    <span className="title">{s.station[lang]}</span>
                    <span className="sub">
                      {lang !== 'ko' ? `${s.stationKo} · ` : ''}
                      {s.spot[lang]}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </a>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ padding: '0 4px' }}>
            {T('demoNote')}
          </p>
        </details>
      )}

      <footer className="foot">
        <a href="/admin" style={{ textDecoration: 'none' }}>
          {T('admin')}
        </a>
      </footer>
    </main>
  );
}
