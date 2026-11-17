'use client';
/**
 * 이용자 화면 (기획서 5장, 화면 세 개): S1 어디로 가세요? → S2 안내 결과 → (탑승 중)
 *
 * 출발역은 S1 상단에 표시하고, 틀렸을 때만 이용자가 "바꾸기"를 누른다.
 *  - QR 표지로 들어온 경우: 표지가 곧 현재 역. 표지 기준 왼쪽·오른쪽까지 안내.
 *    (위치 권한이 이미 허용된 휴대폰이면 표지 역과 실제 위치가 맞는지도 조용히 확인)
 *  - 표지 없이 들어온 경우(/go): 들어오자마자 위치(현재 → 직전)로 가장 가까운 역을 출발역으로 정한다.
 *    위치가 부정확하거나·근처에 역이 여럿이거나·오래된 직전 위치일 때만 후보 2~3개를 보여 고르게 한다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearActiveDest, loadActiveDest, saveActiveDest, shouldResume } from '@/lib/active-dest';
import type { GuideView } from '@/lib/guide-view';
import { guideSentence, towardsText, trainText } from '@/lib/guide-text';
export { guideSentence };
import { badgeText, joinNames, t, withStation } from '@/lib/i18n';
import type { Candidate } from '@/lib/search';
import { fixAgeMs, loadSavedFix, locate, originDecision, permissionState, rememberQuietly, signMismatchKm, stationCandidates, type Fix, type StationPoint } from '@/lib/location';
import type { CityPick, LineBadgeInfo } from '@/lib/nearby';
import { canListen, canSpeak, listenOnce, speak, stopSpeaking } from '@/lib/speech';
import type { Lang, SignMapping } from '@/lib/types';
import { DirArrow, Icon, LineBadge } from './Icon';
import { LangPicker, useUserLang } from './LangPicker';
import { QrScanBox } from './QrScan';
import { RideView } from './RideView';
import { WritingPad } from './WritingPad';

export interface SignClientInfo {
  id: string;
  /** 표지의 좌·우 매핑 (오프라인 계산용. 표지 인쇄물에도 적힌 공개 정보) */
  mappings: SignMapping[];
  /** 표지가 붙은 역 */
  stationId: string;
  sig: string;
  v: number;
  station: Record<Lang, string>;
  stationKo: string;
  spot: Record<Lang, string>;
  photo?: string;
  lines: { id: string; num: string; abbr: string; color: string; name: Record<Lang, string> }[];
  notice?: Partial<Record<Lang, string>>;
  coord?: [number, number];
  /** 표지 역의 권역 */
  region: string;
}

export interface Origin {
  id: string;
  name: string;
  ko: string;
  lines: string[];
  distance?: number;
  region?: string;
  /** 목록에서 이름 아래 한 줄 (검색 결과: 권역·다른 언어 이름) */
  note?: string;
}

type Prefs = { hearing: boolean; hc: boolean; big: boolean };

/** 오프라인 계산 (F10): 노선 데이터와 계산 코드를 별도 파일로 나눠 필요할 때·미리 받아 둔다 */
const loadOffline = () => import('@/lib/offline');

/** 서버 검색, 망이 끊기면 휴대폰에 저장된 데이터로 */
async function searchApi(
  q: string,
  lang: Lang,
  opts: { region?: string; full?: boolean; onlyStation?: boolean },
): Promise<{ results: Candidate[]; offline: boolean }> {
  const p = new URLSearchParams({ q, lang });
  if (opts.region) p.set('region', opts.region);
  if (opts.full) p.set('full', '1');
  if (opts.onlyStation) p.set('only', 'station');
  try {
    const res = await fetch(`/api/search?${p}`);
    if (!res.ok) throw new Error(String(res.status));
    return { results: (await res.json()).results ?? [], offline: false };
  } catch {
    const o = await loadOffline();
    return { results: o.offlineSearch(q, lang, opts.region, opts.onlyStation), offline: true };
  }
}
type TFn = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => string;

/** 노선 배지 (글자·색은 lines.json) — 서버 화면에서 내려준다 */
const BadgeCtx = createContext<{ meta: Record<string, LineBadgeInfo>; lang: Lang }>({ meta: {}, lang: 'ko' });

function Badges({ lines }: { lines: string[] }) {
  const { meta, lang } = useContext(BadgeCtx);
  return (
    <>
      {[...new Set(lines)].map((id) => (meta[id] ? <LineBadge key={id} num={badgeText(lang, meta[id])} color={meta[id].color} size="sm" label={meta[id].name[lang]} /> : null))}
    </>
  );
}

type LocState = 'idle' | 'locating' | 'denied' | 'none';

/** 최근 간 곳 (휴대폰에만 저장, 언어별로 표시) */
type RecentItem = { lang: Lang; c: Candidate };
const RECENT_KEY = 'dap_recent';

function loadRecent(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x?.c?.id && x?.c?.kind && x?.lang) : [];
  } catch {
    return [];
  }
}

function saveRecent(c: Candidate, lang: Lang): RecentItem[] {
  const key = `${c.kind}:${c.id}`;
  const next = [{ lang, c }, ...loadRecent().filter((x) => `${x.c.kind}:${x.c.id}` !== key)].slice(0, 9);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function loadPrefs(): Prefs {
  try {
    return { hearing: false, hc: false, big: false, ...JSON.parse(localStorage.getItem('dap_prefs') ?? '{}') };
  } catch {
    return { hearing: false, hc: false, big: false };
  }
}

function send(type: string, data: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ type, ...data });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    else fetch('/api/event', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {
    /* 통계 실패는 무시 */
  }
}

export function GuideApp({
  sign,
  initialLang,
  popular,
  points = [],
  cities = [],
  initialOrigin,
  startByLine = false,
  badges = {},
}: {
  sign?: SignClientInfo;
  initialLang: Lang;
  popular: Record<Lang, Candidate[]>;
  /** 표지 없이 시작할 때: 휴대폰에서 가까운 역을 찾을 역 좌표 */
  points?: StationPoint[];
  /** 표지 없이 시작할 때: 도시 → 노선 → 역 고르기 */
  cities?: CityPick[];
  initialOrigin?: Origin;
  startByLine?: boolean;
  /** 노선 ID → 배지 글자·색 */
  badges?: Record<string, LineBadgeInfo>;
}) {
  const locationMode = !sign;
  const [lang, setLang] = useUserLang(initialLang);
  const [prefs, setPrefs] = useState<Prefs>({ hearing: false, hc: false, big: false });
  const [origin, setOrigin] = useState<Origin | null>(initialOrigin ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dest, setDest] = useState<Candidate | null>(null);
  const [guide, setGuide] = useState<GuideView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'guide' | 'ride'>('home');
  const [pad, setPad] = useState(false);
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [farKm, setFarKm] = useState<number | null>(null);
  const [speechOk, setSpeechOk] = useState({ listen: false, speak: false });
  // 표지 없이 시작할 때의 출발역 찾기 (기획서 5장: 찾으면 바로 S1, 예외일 때만 후보를 보여 고르게)
  const [locState, setLocState] = useState<LocState>(!sign && !initialOrigin && !startByLine ? 'locating' : 'idle');
  const [located, setLocated] = useState<{ fix: Fix; rough: boolean } | null>(null);
  const [choices, setChoices] = useState<Origin[] | null>(null);
  const [changing, setChanging] = useState(startByLine);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  /** 기둥 QR을 찍기 전에 입력했던 목적지로 바로 안내 중 (기획서 3장) */
  const [resumed, setResumed] = useState(false);
  /** 망이 끊겨 휴대폰에 저장된 노선 데이터로 계산했는가 */
  const [offline, setOffline] = useState(false);
  const reqId = useRef(0);
  const T: TFn = useCallback((k, v) => t(lang, k, v), [lang]);
  const scanKey = sign?.id ?? 'LOCATION';

  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const toOrigin = useCallback(
    (id: string, distance?: number): Origin | null => {
      const p = byId.get(id);
      return p ? { id: p.id, name: p.names[lang] ?? p.ko, ko: p.ko, lines: p.lines, region: p.region, distance } : null;
    },
    [byId, lang],
  );
  // 언어를 바꾸면 출발역 이름도 그 언어로
  const originView = origin ? (toOrigin(origin.id, origin.distance) ?? origin) : null;
  /** 출발역의 권역 — 같은 이름 다른 도시면 이 권역을 먼저 (기획서 7장) */
  const region = sign?.region ?? originView?.region;

  const findMe = useCallback(async () => {
    setLocState('locating');
    const r = await locate();
    if (!r.fix) {
      setLocState(r.denied ? 'denied' : 'none');
      setChanging(true);
      return;
    }
    const now = Date.now();
    const d = originDecision(r.fix, stationCandidates(points, r.fix, now), now);
    setLocated({ fix: r.fix, rough: r.rough });
    setLocState('idle');
    if (d.kind === 'auto') {
      setOrigin(toOrigin(d.stationId, d.distance));
      setChoices(null);
      setChanging(false);
    } else {
      setOrigin(null);
      setChoices(d.choices.map((c) => toOrigin(c.id, c.distance)).filter((o): o is Origin => !!o));
      setChanging(false);
    }
  }, [points, toOrigin]);

  // 표지 없이 들어오면 곧바로 위치를 찾는다 ("내 위치로 시작"을 누르고 온 것이므로). 권한을 꺼 둔 경우만 직접 선택.
  useEffect(() => {
    if (sign || initialOrigin || startByLine) return;
    permissionState().then((s) => {
      if (s === 'denied') {
        setLocState('denied');
        setChanging(true);
      } else findMe();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickOrigin = (o: Origin) => {
    setOrigin(o);
    setChoices(null);
    setChanging(false);
  };

  useEffect(() => setRecent(loadRecent()), []);

  useEffect(() => {
    setPrefs(loadPrefs());
    setSpeechOk({ listen: canListen(), speak: canSpeak() });
    const key = `dap_scan_${scanKey}`;
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        send('scan', { signId: scanKey, lang: initialLang, hearing: loadPrefs().hearing });
      }
    } catch {
      send('scan', { signId: scanKey, lang: initialLang });
    }
  }, [scanKey, initialLang]);

  // QR 표지(A 방식): 표지가 현재 역을 확정하고, 위치는 대조용 (기획서 2·3장).
  // 위치 권한이 이미 허용돼 있을 때만 조용히 확인한다 (새로 묻지 않음). 지하라 안 잡히면 5분 안의 직전 위치로.
  useEffect(() => {
    if (!sign?.coord) return;
    let alive = true;
    rememberQuietly().then((fix) => {
      const f = fix ?? loadSavedFix();
      if (!alive || !f) return;
      const km = signMismatchKm(sign.coord!, f, Date.now());
      if (km !== null) setFarKm(km);
    });
    return () => {
      alive = false;
    };
  }, [sign?.coord]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.classList.toggle('hc', prefs.hc);
    root.classList.toggle('big', prefs.big);
    try {
      localStorage.setItem('dap_prefs', JSON.stringify(prefs));
    } catch {}
  }, [lang, prefs]);

  // 자동완성 (200ms 지연)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchApi(q, lang, { region });
        if (id === reqId.current) setResults(r.results);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, lang, region]);

  // 화면을 연 뒤 잠시 후 오프라인 계산 파일을 미리 받아 둔다 → 서비스 워커가 저장 (지하에서 망이 끊겨도 안내)
  useEffect(() => {
    const timer = setTimeout(() => loadOffline().catch(() => {}), 2500);
    return () => clearTimeout(timer);
  }, []);

  const fetchGuide = useCallback(
    async (c: Candidate, l: Lang) => {
      setError(null);
      const from = sign ? { signId: sign.id, sig: sign.sig, v: sign.v } : { originStationId: origin?.id };
      const destBody = { kind: c.kind, id: c.id, label: c.label };
      let res: Response | null = null;
      try {
        res = await fetch('/api/guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...from, dest: destBody, lang: l, hearing: prefs.hearing }),
        });
      } catch {
        res = null; // 망 끊김
      }
      if (!res || res.status >= 500) {
        // 오프라인(또는 서버 장애): 같은 계산을 휴대폰에서. 표지는 화면을 열 때 이미 서명 확인됨.
        const stationId = sign?.stationId ?? origin?.id;
        if (!stationId) return null;
        const o = await loadOffline().catch(() => null);
        const r = o?.offlineGuide({ stationId, signId: sign?.id, mappings: sign?.mappings }, destBody, l);
        if (!r || !r.ok) {
          setGuide(null);
          setError(t(l, r?.error === 'other_region' ? 'otherRegion' : 'noRoute'));
          return null;
        }
        setOffline(true);
        setGuide(r.view);
        return r.view;
      }
      setOffline(false);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setGuide(null);
        setError(t(l, err?.error === 'other_region' ? 'otherRegion' : 'noRoute'));
        return null;
      }
      const g: GuideView = await res.json();
      setGuide(g);
      return g;
    },
    [sign, origin?.id, prefs.hearing],
  );

  const choose = async (c: Candidate, byVoice = false) => {
    setDest(c);
    setFeedback(null);
    setView('guide');
    setGuide(null);
    setVoiceUsed(byVoice);
    setRecent(saveRecent(c, lang));
    saveActiveDest(c);
    window.scrollTo({ top: 0 });
    const g = await fetchGuide(c, lang);
    if (g?.sameStation) clearActiveDest(); // 도착
    // 음성으로 물었으면 소리로 답한다 (청각 지원 모드에서는 소리 없이)
    if (g && byVoice && !prefs.hearing) speak(guideSentence(g, lang, locationMode), lang);
  };

  const runSearch = async (q: string, byVoice: boolean): Promise<Candidate[]> => {
    const r = await searchApi(q, lang, { region, full: true });
    const list: Candidate[] = r.results;
    if (list.length === 0) send('search_fail', { signId: scanKey, lang, query: q, value: byVoice ? 'voice' : 'text' });
    return list;
  };

  const submitSearch = async () => {
    const q = query.trim();
    if (!q) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const list = await runSearch(q, false);
      if (id !== reqId.current) return;
      setResults(list);
      if (list.length === 1) choose(list[0]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  /** 음성 인식 결과(후보 문장 여러 개) → 가장 먼저 역·장소가 찾아지는 문장 */
  const onVoice = async (alts: string[]) => {
    for (const alt of alts) {
      const q = alt.replace(/[.?!。？！]+$/, '').replace(/(으로|로|에|까지)\s*(가고\s*싶어요?|가요|갈래요|가 주세요)?$/, '').trim();
      if (!q) continue;
      const id = ++reqId.current;
      const list = await runSearch(q, true);
      if (id !== reqId.current) return;
      if (list.length) {
        setQuery(q);
        setResults(list);
        const [a, b] = list;
        const clear = a.score >= 80 && (!b || a.score - b.score >= 15 || b.stationId === a.stationId);
        if (clear) choose(a, true);
        return;
      }
    }
    setQuery(alts[0] ?? '');
    setResults([]);
  };

  // 안내 중 언어를 바꾸면 다시 받아 온다
  useEffect(() => {
    if (dest && view !== 'home') fetchGuide(dest, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // 기둥 QR로 들어왔고, 직전에(QR 없이 또는 앞 구간 표지에서) 입력한 목적지가 있으면 다시 묻지 않고 바로 좌·우 안내
  useEffect(() => {
    if (!sign) return;
    const c = loadActiveDest();
    if (shouldResume(c, sign)) {
      setResumed(true);
      choose(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sign?.id]);

  const reset = () => {
    clearActiveDest();
    setResumed(false);
    stopSpeaking();
    setView('home');
    setDest(null);
    setGuide(null);
    setQuery('');
    setResults(null);
  };

  const togglePref = (k: keyof Prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const notice = sign?.notice ? (sign.notice[lang] ?? sign.notice.ko ?? Object.values(sign.notice)[0]) : undefined;
  const ready = !!sign || (!!origin && !changing);
  const badgeCtx = useMemo(() => ({ meta: badges, lang }), [badges, lang]);

  return (
    <BadgeCtx.Provider value={badgeCtx}>
    <main className="wrap" lang={lang}>
      <header className="col" style={{ gap: 10 }}>
        <div className="topbar">
          <a className="brand grow" href="/">
            <span className="brand-mark" aria-hidden>
              <i />
              <i />
            </span>
            {T('appName')}
          </a>
          <LangPicker lang={lang} onChange={setLang} />
        </div>
        <div className="chips" role="group" aria-label={`${T('hearing')} · ${T('bigText')} · ${T('contrast')}`}>
          <button className="chip" aria-pressed={prefs.hearing} onClick={() => togglePref('hearing')}>
            <Icon name="ear" size={15} /> {T('hearing')}
          </button>
          <button className="chip" aria-pressed={prefs.big} onClick={() => togglePref('big')}>
            <Icon name="type" size={15} /> {T('bigText')}
          </button>
          <button className="chip" aria-pressed={prefs.hc} onClick={() => togglePref('hc')}>
            <Icon name="contrast" size={15} /> {T('contrast')}
          </button>
        </div>
      </header>

      {/* S1 출발 위치 */}
      {sign ? (
        <section className="card sign-head" aria-label={`${sign.station[lang]} · ${sign.spot[lang]}`}>
          {sign.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sign-photo" src={sign.photo} alt="" />
          ) : (
            <div className="sign-photo" aria-hidden>
              <span className="mini">
                <i />
                <i />
              </span>
            </div>
          )}
          <div className="grow">
            <div className="sign-title">{withStation(lang, sign.station[lang])}</div>
            {lang !== 'ko' && <div className="ko-sub">{sign.stationKo}</div>}
            <div className="sign-sub">
              {sign.lines.map((l) => (
                <LineBadge key={l.id} num={badgeText(lang, l)} color={l.color} size="sm" label={l.name[lang]} />
              ))}
              <span>{sign.spot[lang]}</span>
            </div>
            <div className="verified">
              <Icon name="check" size={13} stroke={2.25} /> {T('checkSign')}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* S1 상단: 출발역 · 바꾸기 */}
          {originView && (
            <section className="card sign-head">
              <div className="sign-photo" aria-hidden>
                <Icon name="locate" size={26} />
              </div>
              <div className="grow">
                <div className="eyebrow">{T('fromStation', { station: '' }).replace(/[:：]\s*$/, '')}</div>
                <div className="sign-title">{withStation(lang, originView.name)}</div>
                {lang !== 'ko' && <div className="ko-sub">{originView.ko}</div>}
                <div className="sign-sub">
                  <Badges lines={originView.lines} />
                  {originView.distance !== undefined && located && <span className="muted">{fixLabel(located.fix, located.rough, T)}</span>}
                </div>
              </div>
              {view === 'home' && (
                <button className="text-btn small" onClick={() => setChanging((v) => !v)} aria-expanded={changing}>
                  {T('changeOrigin')}
                </button>
              )}
            </section>
          )}

          {/* 위치를 찾는 중 */}
          {!originView && !choices && locState === 'locating' && (
            <section className="card sign-head" role="status">
              <div className="sign-photo" aria-hidden>
                <Icon name="locate" size={26} />
              </div>
              <div className="grow sign-title">{T('locating')}</div>
            </section>
          )}

          {/* 예외일 때만: 후보 2~3개 중 한 번 누르기 */}
          {choices && !changing && (
            <section className="card col" style={{ gap: 8 }} aria-labelledby="confirmOrigin">
              <h2 id="confirmOrigin" className="section-label" style={{ margin: 0 }}>
                {T('confirmOrigin')}
              </h2>
              {located && (
                <p className="muted small">
                  <Icon name="locate" size={14} /> {fixLabel(located.fix, located.rough, T)}
                </p>
              )}
              <OriginList list={choices} lang={lang} T={T} onPick={pickOrigin} />
              <button className="text-btn small" onClick={() => setChanging(true)}>
                {T('changeOrigin')}
              </button>
            </section>
          )}

          {(changing || (!originView && !choices && locState !== 'locating')) && view === 'home' && (
            <OriginPanel
              lang={lang}
              T={T}
              onPick={pickOrigin}
              onLocate={findMe}
              locState={locState}
              cities={cities}
              toOrigin={toOrigin}
              startByLine={startByLine}
            />
          )}
        </>
      )}

      {farKm !== null && (
        <div className="note warn" role="alert">
          <Icon name="alert" size={18} /> {T('farFromSign', { km: farKm })}
        </div>
      )}

      {notice && (
        <div className="card notice-card" role="status">
          <Icon name="bell" size={18} />
          <div>
            <div className="eyebrow">{T('notice')}</div>
            <p>{notice}</p>
          </div>
        </div>
      )}

      {ready && view === 'home' && (
        <Home
          lang={lang}
          T={T}
          query={query}
          setQuery={setQuery}
          results={results}
          loading={loading}
          popular={popular[lang].filter((c) => !region || !c.region || c.region === region)}
          recent={recent
            .filter((r) => r.lang === lang && (!region || !r.c.region || r.c.region === region))
            .slice(0, 3)
            .map((r) => r.c)}
          onChoose={(c) => choose(c)}
          onSubmit={submitSearch}
          canVoice={speechOk.listen}
          onVoice={onVoice}
        />
      )}

      {view === 'guide' && (
        <>
          {error && (
            <div className="note warn" role="alert">
              <Icon name="alert" size={18} /> {error}
            </div>
          )}
          {offline && (
            <div className="note" role="status">
              <Icon name="info" size={18} /> {T('offlineNote')}
            </div>
          )}
          {resumed && (
            <div className="note" role="status">
              <Icon name="flag" size={18} /> {T('keptDest')}
            </div>
          )}
          {!guide && !error && <p className="center muted">{T('searching')}</p>}
          {guide && <GuideCard g={guide} lang={lang} T={T} locationMode={locationMode} />}
          {guide && !guide.sameStation && (
            <div className="col" style={{ gap: 10 }}>
              <button
                className="btn primary block"
                onClick={() => {
                  stopSpeaking();
                  setView('ride');
                  send('board', { signId: scanKey, lang, hearing: prefs.hearing });
                  window.scrollTo({ top: 0 });
                }}
              >
                <Icon name="train" /> {T('boarded')}
              </button>
              <div className="btns">
                {speechOk.speak && !prefs.hearing ? (
                  <button className="btn" onClick={() => speak(guideSentence(guide, lang, locationMode), lang)}>
                    <Icon name="volume" size={18} /> {T('listen')}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setPad(true)}>
                    <Icon name="pen" size={18} /> {T('writingPad')}
                  </button>
                )}
                <button className="btn" onClick={reset}>
                  <Icon name="search" size={18} /> {T('searchAgain')}
                </button>
              </div>
              {speechOk.speak && !prefs.hearing && (
                <button className="btn block" onClick={() => setPad(true)}>
                  <Icon name="pen" size={18} /> {T('writingPad')}
                </button>
              )}
            </div>
          )}
          {guide?.sameStation && (
            <button className="btn block" onClick={reset}>
              <Icon name="search" size={18} /> {T('searchAgain')}
            </button>
          )}
          {guide && (
            <div className="feedback" aria-live="polite">
              {feedback ? (
                <span>{T('thanks')}</span>
              ) : (
                <>
                  <span>{T('helpful')}</span>
                  <span className="seg">
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setFeedback(v);
                          send('feedback', { signId: scanKey, lang, value: v, dest: guide.dest.id });
                        }}
                      >
                        {T(v)}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </div>
          )}
        </>
      )}

      {view === 'ride' && guide && (
        <RideView g={guide} lang={lang} hearing={prefs.hearing} speakAlerts={voiceUsed && !prefs.hearing && speechOk.speak} onEnd={reset} onPad={() => setPad(true)} />
      )}

      {pad && guide && <WritingPad lang={lang} destKo={guide.dest.ko} destLocal={guide.dest.name} onClose={() => setPad(false)} />}

      <footer className="foot">
        {T('appName')}
        {sign ? ` · ${sign.id}` : ''}
      </footer>
    </main>
    </BadgeCtx.Provider>
  );
}

/** 위치를 어디서 얻었는지 한 줄로: "현재 위치 · 오차 약 40m", "5분 전 위치" */
function fixLabel(fix: Fix, rough: boolean, T: TFn): string {
  if (fix.source === 'now') return T(rough ? 'fixRough' : 'fixNow', { n: Math.round(fix.accuracy / 10) * 10 || 10 });
  const min = Math.floor(fixAgeMs(fix, Date.now()) / 60_000);
  return min < 1 ? T('fixJustNow') : T('fixAgo', { n: min });
}

/**
 * 출발역 바꾸기 (S1 상단 "바꾸기", 또는 위치를 쓸 수 없을 때): 역 이름 검색 · 노선에서 고르기 · 내 위치로 다시 찾기.
 * 가까운 역 계산은 휴대폰에서 한다 (위치를 서버로 보내지 않음).
 */
function OriginPanel({
  lang,
  T,
  onPick,
  onLocate,
  locState,
  cities,
  toOrigin,
  startByLine,
}: {
  lang: Lang;
  T: TFn;
  onPick: (o: Origin) => void;
  onLocate: () => void;
  locState: LocState;
  cities: CityPick[];
  toOrigin: (id: string, distance?: number) => Origin | null;
  startByLine: boolean;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Origin[] | null>(null);
  const [byLine, setByLine] = useState(startByLine);

  useEffect(() => {
    const s = q.trim();
    if (!s) return setFound(null);
    const timer = setTimeout(async () => {
      const r = await searchApi(s, lang, { onlyStation: true });
      setFound(r.results.map((c) => ({ id: c.stationId, name: c.label, ko: c.stationKo, lines: c.lines, region: c.region, note: c.sub || undefined })));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, lang]);

  return (
    <section className="card col" style={{ gap: 10 }} aria-labelledby="changeOrigin">
      <h2 id="changeOrigin" className="section-label" style={{ margin: 0 }}>
        {T('changeOrigin')}
      </h2>
      {locState === 'denied' && (
        <div className="note warn">
          <Icon name="alert" size={18} /> {T('locationDenied')}
        </div>
      )}
      {locState === 'none' && (
        <div className="note warn">
          <Icon name="alert" size={18} /> {T('noRecentFix')}
        </div>
      )}
      <label className="search-field">
        <Icon name="search" size={20} />
        <input className="search-input" type="search" placeholder={T('originPlaceholder')} aria-label={T('originPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      {found && found.length > 0 && <OriginList list={found} lang={lang} T={T} onPick={onPick} />}
      {cities.length > 0 && (
        <details open={byLine} onToggle={(e) => setByLine((e.target as HTMLDetailsElement).open)}>
          <summary className="section-label" style={{ cursor: 'pointer' }}>
            {T('pickByLine')}
          </summary>
          {byLine && <LinePicker cities={cities} lang={lang} T={T} toOrigin={toOrigin} onPick={onPick} />}
        </details>
      )}
      <button className="btn block" onClick={onLocate} disabled={locState === 'locating'}>
        <Icon name="locate" /> {locState === 'locating' ? T('locating') : T('useLocation')}
      </button>
      <p className="muted small" style={{ padding: '0 4px' }}>
        {T('entranceTip')} {T('locationNote')}
      </p>
    </section>
  );
}

function OriginList({ list, lang, T, onPick }: { list: Origin[]; lang: Lang; T: TFn; onPick: (o: Origin) => void }) {
  return (
    <ul className="list">
      {list.map((o) => (
        <li key={o.id}>
          <button className="list-btn" onClick={() => onPick(o)}>
            <span className="badges" aria-hidden>
              <Badges lines={o.lines} />
            </span>
            <span className="grow">
              <span className="title">{withStation(lang, o.name)}</span>
              <span className="sub">
                {o.note ?? (lang !== 'ko' ? o.ko : '')}
                {o.distance !== undefined ? `${o.note || lang !== 'ko' ? ' · ' : ''}${T('meters', { n: o.distance })}` : ''}
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 권역 → 노선 → 역 고르기 (위치를 쓰지 않는 이용자, 위치가 없을 때). 노선 색은 lines.json. */
function LinePicker({
  cities,
  lang,
  T,
  toOrigin,
  onPick,
}: {
  cities: CityPick[];
  lang: Lang;
  T: TFn;
  toOrigin: (id: string) => Origin | null;
  onPick: (o: Origin) => void;
}) {
  const [cityId, setCityId] = useState(cities[0].id);
  const [lineId, setLineId] = useState<string | null>(null);
  const city = cities.find((c) => c.id === cityId) ?? cities[0];
  const line = city.lines.find((l) => l.id === lineId);
  const stations = line ? line.stations.map((id) => toOrigin(id)).filter((o): o is Origin => !!o) : [];

  return (
    <div className="col" style={{ gap: 10, marginTop: 10 }}>
      <div className="chips" role="group" aria-label={T('pickCity')}>
        {cities.map((c) => (
          <button key={c.id} className="chip" aria-pressed={c.id === cityId} onClick={() => (setCityId(c.id), setLineId(null))}>
            {c.name[lang]}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label={T('pickLine')}>
        {city.lines.map((l) => (
          <button key={l.id} className="chip" aria-pressed={l.id === lineId} onClick={() => setLineId(l.id)}>
            <LineBadge num={badgeText(lang, l)} color={l.color} size="sm" /> {l.name[lang]}
          </button>
        ))}
      </div>
      {line && (
        <>
          <p className="section-label">{T('pickStation')}</p>
          <OriginList list={stations} lang={lang} T={T} onPick={onPick} />
        </>
      )}
    </div>
  );
}

function Home({
  lang,
  T,
  query,
  setQuery,
  results,
  loading,
  popular,
  recent,
  onChoose,
  onSubmit,
  canVoice,
  onVoice,
}: {
  lang: Lang;
  T: TFn;
  query: string;
  setQuery: (s: string) => void;
  results: Candidate[] | null;
  loading: boolean;
  popular: Candidate[];
  recent: Candidate[];
  onChoose: (c: Candidate) => void;
  onSubmit: () => void;
  canVoice: boolean;
  onVoice: (alts: string[]) => void;
}) {
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const exactMany = results && results.length > 1 && results[0].score >= 100 && results[1].score >= 100;

  const startVoice = () => {
    if (listening) return stopRef.current();
    stopSpeaking();
    setVoiceErr(false);
    setListening(true);
    const h = listenOnce(lang, {
      onInterim: (text) => setQuery(text),
      onResult: (alts) => onVoice(alts),
      onError: (code) => {
        if (code !== 'aborted') setVoiceErr(true);
      },
      onEnd: () => setListening(false),
    });
    stopRef.current = h.stop;
  };

  return (
    <section className="col" aria-labelledby="whereTo">
      <form
        className="col"
        role="search"
        style={{ gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <h1 id="whereTo">{T('whereTo')}</h1>
        <div className="row" style={{ gap: 8 }}>
          <label className="search-field grow">
            <Icon name="search" size={20} />
            <input
              className="search-input"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder={listening ? T('listening') : T('placeholder')}
              aria-label={T('placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && !listening && (
              <button type="button" className="text-btn" onClick={() => setQuery('')} aria-label={T('close')}>
                <Icon name="close" size={18} />
              </button>
            )}
          </label>
          {canVoice && (
            <button type="button" className={`mic-btn ${listening ? 'on' : ''}`} onClick={startVoice} aria-pressed={listening} aria-label={T('speak')}>
              <Icon name="mic" size={24} />
            </button>
          )}
        </div>
        {listening && (
          <p className="listening" role="status">
            <span className="pulse" aria-hidden /> {T('listening')}
          </p>
        )}
      </form>

      {voiceErr && !listening && (
        <div className="note">
          <Icon name="mic" size={18} /> {T('voiceFail')}
        </div>
      )}

      {loading && !results && <p className="muted small">{T('searching')}</p>}

      {results && results.length === 0 && !loading && (
        <div className="note">
          <Icon name="info" size={18} /> {T('noResults')}
        </div>
      )}

      {results && results.length > 0 && (
        <>
          {exactMany && <p className="section-label">{T('pickOne')}</p>}
          <ul className="list" aria-live="polite">
            {results.map((c) => (
              <li key={`${c.kind}:${c.id}`}>
                <CandidateButton c={c} T={T} onChoose={onChoose} />
              </li>
            ))}
          </ul>
        </>
      )}

      {!results && recent.length > 0 && (
        <>
          <p className="section-label">{T('recent')}</p>
          <ul className="list">
            {recent.map((c) => (
              <li key={`r:${c.kind}:${c.id}`}>
                <CandidateButton c={c} T={T} onChoose={onChoose} />
              </li>
            ))}
          </ul>
        </>
      )}

      {!results && popular.some((c) => !recent.some((r) => r.kind === c.kind && r.id === c.id)) && (
        <>
          <p className="section-label">{T('popular')}</p>
          <ul className="list">
            {popular.filter((c) => !recent.some((r) => r.kind === c.kind && r.id === c.id)).map((c) => (
              <li key={`${c.kind}:${c.id}`}>
                <CandidateButton c={c} T={T} onChoose={onChoose} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CandidateButton({ c, T, onChoose }: { c: Candidate; T: TFn; onChoose: (c: Candidate) => void }) {
  return (
    <button className="list-btn" onClick={() => onChoose(c)}>
      <span className="badges" aria-hidden>
        <Badges lines={c.lines} />
      </span>
      <span className="grow">
        <span className="title">{c.label}</span>
        <span className="sub">
          {c.kind !== 'station' && <span className="kind">{T(c.kind)}</span>}
          {c.sub}
          {c.exit ? ` · ${T('exitN', { n: c.exit })}` : ''}
        </span>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}

export function GuideCard({ g, lang, T, locationMode }: { g: GuideView; lang: Lang; T: TFn; locationMode: boolean }) {
  const first = g.legs[0];
  const alight = first?.stations.at(-1);
  const sentence = guideSentence(g, lang, locationMode);
  const nth = first ? T('nth', { n: first.stops }) : '';

  if (g.sameStation) {
    return (
      <div className="card center col" role="status">
        <Icon name="flag" size={28} className="muted" />
        <h2>{sentence}</h2>
        {g.place?.exit && <p style={{ fontSize: '1.6em', fontWeight: 800 }}>{T('exitN', { n: g.place.exit })}</p>}
      </div>
    );
  }
  if (!first || !alight) {
    return (
      <div className="note warn">
        <Icon name="alert" size={18} /> {T('noRoute')}
      </div>
    );
  }

  const next = first.stations[1];
  const side = first.side; // 기둥 QR로 들어와 이 승강장에서 타는 경우에만 있다 (guide-view.ts)
  // 바로 다음 역에서 내리면 "다음 역: ○○"는 내릴 역과 같은 말이라 빼고 "다음 역에서 내리세요"만 (고칠 점 2)
  const nextSmall =
    first.stops > 1 ? (
      <p className="next-small">
        {T('nextStop', { name: next.name })}
        {lang !== 'ko' && <span className="ko-inline"> · {next.ko}</span>}
      </p>
    ) : null;
  // 환승이 있으면 내릴 역은 환승역: "환승역" 표시 + 갈아탈 노선 + 최종 도착역 (고칠 점 1)
  const second = g.legs[1];
  const destBlock = second ? (
    <>
      <p className="dest-name">
        <span className="xfer-tag">{T('transferStation')}</span> {alight.name}
      </p>
      {lang !== 'ko' && <p className="dest-ko">{alight.ko}</p>}
      <p className="xfer-line">
        <Icon name="repeat" size={18} /> <LineBadge num={second.num} color={second.color} size="sm" />{' '}
        {T('transferAt', { station: alight.name, line: second.lineName })}
      </p>
      <p className="final-dest">
        <Icon name="flag" size={18} /> {T('finalDestBig', { station: withStation(lang, g.dest.name) })}
        {lang !== 'ko' && <span className="ko-inline"> · {g.dest.ko}</span>}
      </p>
    </>
  ) : (
    <>
      <p className="dest-name">{alight.name}</p>
      {lang !== 'ko' && <p className="dest-ko">{alight.ko}</p>}
    </>
  );

  return (
    <>
      {side ? (
        /* A-1 기둥 QR: 화살표와 왼쪽/오른쪽이 가장 크게, 표지와 같은 색 (파랑 ◀ 왼쪽 / 오른쪽 ▶ 주황) */
        <section className={`dir pillar ${side}`} aria-label={sentence} role="region">
          <p className="sr-only" role="status">
            {sentence}
          </p>
          <div aria-hidden className="col" style={{ gap: 0 }}>
            <div className={`side-hero ${side}`}>
              <DirArrow side={side} className="arrow-xl" />
              <span className="side-xl">{T(side)}</span>
            </div>
            <p className="face-this">{T('faceThisSign')}</p>
            <div className="rule" />
            <p className="dir-line">
              {towardsText(first, lang)} · {T('getOffNth', { nth })}
            </p>
            {destBlock}
            {nextSmall}
          </div>
        </section>
      ) : !locationMode && (g.moveToLine || g.oppositePlatform) ? (
        /* A-1 기둥 QR이지만 이 기둥의 승강장에서는 갈 수 없음 → 좌우 대신 승강장 이동 */
        <section className="dir neutral" aria-label={sentence} role="region">
          <p className="sr-only" role="status">
            {sentence}
          </p>
          <div aria-hidden className="col" style={{ gap: 0 }}>
            <p className="wrong-platform">
              <Icon name="alert" size={22} /> {T('wrongPlatform')}
            </p>
            <p className="move-title" style={{ marginTop: 10 }}>
              <LineBadge num={first.num} color={first.color} />{' '}
              {g.oppositePlatform ? T('goOppositePlatform', { dir: towardsText(first, lang) }) : T('goToPlatform', { line: first.lineName, dir: towardsText(first, lang) })}
            </p>
            <div className="rule" />
            <p className="dir-line">{T('getOffNth', { nth })}</p>
            {destBlock}
            {nextSmall}
          </div>
        </section>
      ) : (
        /* A-2 내 위치 · 노선 고르기: 좌우 없이 방면 중심 */
        <section className="dir neutral" aria-label={sentence} role="region">
          <p className="sr-only" role="status">
            {sentence}
          </p>
          <div aria-hidden className="col" style={{ gap: 0 }}>
            <span className="line-tag">
              <LineBadge num={first.num} color={first.color} /> {first.lineName}
            </span>
            <p className="train-xl">{trainText(first, lang)}</p>
            <div className="rule" />
            <p className="dir-line">{T('getOffNth', { nth })}</p>
            {destBlock}
            {nextSmall}
          </div>
        </section>
      )}

      {/* 내 위치·노선 고르기: 기둥 QR을 찍으면 좌우를 알려 준다 */}
      {locationMode && <QrScanBox lang={lang} />}

      {first.oppositeStops !== undefined && (
        <div className="note">
          <Icon name="repeat" size={18} /> {T('otherWay', { n: first.oppositeStops })}
        </div>
      )}

      {first.serviceHint && (
        <div className="note warn">
          <Icon name="train" size={18} /> {T('onlyTrains', { names: joinNames(lang, first.serviceHint.map((s) => s.name)) })}
        </div>
      )}
      {first.localOnly && (
        <div className="note">
          <Icon name="info" size={18} /> {T('localOnly')}
        </div>
      )}

      {/* 경로 타임라인 */}
      <section className="card">
        <ol className="timeline">
          {g.legs.map((leg, i) => {
            const end = leg.stations.at(-1)!;
            return (
              <li key={i} className="tl" style={{ ['--c' as string]: leg.color }}>
                <span className="rail">
                  <span className="node" />
                </span>
                <div className="col" style={{ gap: 4 }}>
                  <p className="t">
                    {i === 0 ? withStation(lang, leg.stations[0].name) : T('transferAt', { station: leg.stations[0].name, line: leg.lineName })}
                  </p>
                  <p className="s">
                    {leg.lineName}
                    {towardsText(leg, lang) ? ` · ${towardsText(leg, lang)}` : ''} · {i === 0 ? T('stops', { n: leg.stops }) : T('getOffNth', { nth: T('nth', { n: leg.stops }) })}
                  </p>
                  {i > 0 && leg.serviceHint && <p className="s">{T('onlyTrains', { names: joinNames(lang, leg.serviceHint.map((s) => s.name)) })}</p>}
                  {i > 0 && leg.localOnly && <p className="s">{T('localOnly')}</p>}
                  {i < g.legs.length - 1 && (
                    <p className="s">
                      {T('getOffAt', { station: end.name })}
                      {lang !== 'ko' ? ` (${end.ko})` : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          <li className="tl" style={{ ['--c' as string]: g.legs.at(-1)!.color }}>
            <span className="rail">
              <span className="node end" />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <p className="t">
                {T('finalDest', { station: withStation(lang, g.dest.name) })}
                {lang !== 'ko' ? <span className="muted" style={{ fontWeight: 500 }}> · {g.dest.ko}</span> : null}
              </p>
              {g.place && (
                <p className="s row" style={{ gap: 4 }}>
                  <Icon name="pin" size={14} /> {g.place.name}
                  {g.place.exit ? ` · ${T('exitN', { n: g.place.exit })}` : ''}
                </p>
              )}
              <p className="s">
                {T('totalStops', { n: g.totalStops })}
                {g.transfers > 0 ? ` · ${T('transfers', { n: g.transfers })}` : ''}
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* 기둥 QR: 환승역부터는 방면·몇 번째 역으로만 안내하고, 그곳 기둥 QR을 다시 찍게 한다 */}
      {!locationMode && g.transfers > 0 && (
        <div className="note">
          <Icon name="qr" size={18} /> {T('transferRescan')}
        </div>
      )}
    </>
  );
}
