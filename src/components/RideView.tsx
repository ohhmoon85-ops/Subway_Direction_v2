'use client';
/**
 * S4 탑승 중 — 시간표(평균 역간 소요 시간) 기준 예상 위치, 내릴 역 한 정거장 전 알림.
 * - 화면 꺼짐 방지(Wake Lock)
 * - 진동 지원 기기는 진동, 아이폰 등 미지원 기기는 화면 점멸 + 큰 문자
 * - 실제와 어긋나면 이용자가 "+1"로 맞춘다
 * 실시간 도착 정보 연동(F13)은 2단계.
 */
import { useEffect, useRef, useState } from 'react';
import type { GuideView } from '@/lib/guide-view';
import { t, withStation } from '@/lib/i18n';
import { speak, stopSpeaking } from '@/lib/speech';
import type { Lang } from '@/lib/types';
import { Icon, LineBadge } from './Icon';

/** 노선별 평균 역간 소요(초). 시간표 공공데이터 연동 전 임시값 — 시범 운영에서 보정. */
const SEC_PER_STOP: Record<string, number> = { '1': 150, '2': 120, '3': 125, '4': 130 };

type WakeLockSentinelLike = { release: () => Promise<void> };

export function RideView({ g, lang, hearing, speakAlerts, onEnd, onPad }: { g: GuideView; lang: Lang; hearing: boolean; speakAlerts: boolean; onEnd: () => void; onPad: () => void }) {
  const [legIdx, setLegIdx] = useState(0);
  const [boardedAt, setBoardedAt] = useState(() => Date.now());
  const [adjust, setAdjust] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [alerted, setAlerted] = useState<number>(-1);
  const [flash, setFlash] = useState(false);
  const [canVibrate, setCanVibrate] = useState(true);
  const lock = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => setCanVibrate('vibrate' in navigator), []);

  // 화면 꺼짐 방지
  useEffect(() => {
    const req = async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (wl && document.visibilityState === 'visible') lock.current = await wl.request('screen');
      } catch {}
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock.current?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  const leg = g.legs[legIdx];
  const per = (SEC_PER_STOP[leg.lineId] ?? 130) * 1000;
  const passed = Math.max(0, Math.min(leg.stops, Math.floor((now - boardedAt) / per) + adjust));
  const remaining = leg.stops - passed;
  const isLastLeg = legIdx === g.legs.length - 1;
  const nextStation = leg.stations[Math.min(passed + 1, leg.stations.length - 1)];
  const alight = leg.stations.at(-1)!;
  const nextLegInfo = g.legs[legIdx + 1];

  // 한 정거장 전 알림 (구간마다 한 번)
  useEffect(() => {
    if (remaining === 1 && alerted !== legIdx) {
      setAlerted(legIdx);
      setFlash(true);
      if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
      if (speakAlerts) speak(`${t(lang, 'getOffNext')} ${t(lang, 'alightAt')}: ${alight.name}`, lang);
      setTimeout(() => setFlash(false), 5000);
    }
  }, [remaining, alerted, legIdx, speakAlerts, lang, alight.name]);

  // 도착·환승 지점에서 소리 안내
  const announced = useRef(-1);
  useEffect(() => {
    if (remaining === 0 && announced.current !== legIdx && speakAlerts) {
      announced.current = legIdx;
      const nl = g.legs[legIdx + 1];
      speak(nl ? t(lang, 'transferAt', { station: alight.name, line: nl.lineName }) : t(lang, 'arrived', { station: withStation(lang, alight.name) }), lang);
    }
  }, [remaining, legIdx, speakAlerts, g.legs, lang, alight.name]);
  useEffect(() => () => stopSpeaking(), []);

  const nextLeg = () => {
    setLegIdx((i) => i + 1);
    setBoardedAt(Date.now());
    setAdjust(0);
    setNow(Date.now());
  };

  const T = (k: Parameters<typeof t>[1], v?: Record<string, string | number>) => t(lang, k, v);
  const urgent = remaining === 1;

  return (
    <section className="col" aria-live="assertive">
      <div className={`card ride-hero ${urgent ? 'urgent' : ''} ${flash ? 'alert-flash' : ''}`}>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          <LineBadge num={leg.num} color={leg.color} size="sm" />
          <span className="small" style={{ fontWeight: 600 }}>
            {leg.lineName}
          </span>
        </div>
        {remaining === 0 ? (
          <>
            <Icon name="flag" size={48} stroke={1.5} />
            <h2 style={{ marginTop: 10 }}>{isLastLeg ? T('arrived', { station: withStation(lang, alight.name) }) : T('transferNow')}</h2>
          </>
        ) : (
          <>
            <p className="ride-big">{remaining}</p>
            <h2 style={{ marginTop: 6, fontSize: urgent && hearing ? '1.5em' : undefined }}>{urgent ? T('getOffNext') : T('remaining', { n: remaining })}</h2>
          </>
        )}
        <div className="progress" aria-hidden>
          <i style={{ width: `${(passed / leg.stops) * 100}%`, background: leg.color }} />
        </div>
        <div className="stops-rail" aria-hidden>
          <span>{leg.stations[0].name}</span>
          <span>{alight.name}</span>
        </div>
      </div>

      <section className="card facts" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {remaining > 0 && (
          <div className="fact">
            <Icon name="chevron" size={18} />
            <div>
              <span className="k">{T('nextIs')}</span>
              <span className="v" style={{ fontSize: '1.15em' }}>
                {nextStation.name}
                {lang !== 'ko' && <span className="muted" style={{ fontWeight: 500 }}> · {nextStation.ko}</span>}
              </span>
            </div>
          </div>
        )}
        <div className="fact">
          <Icon name="flag" size={18} />
          <div>
            <span className="k">{T('alightAt')}</span>
            <span className="v" style={{ fontSize: '1.15em' }}>
              {alight.name}
              {lang !== 'ko' && <span className="muted" style={{ fontWeight: 500 }}> · {alight.ko}</span>}
            </span>
          </div>
        </div>
      </section>

      {remaining === 0 && nextLegInfo && (
        <div className="card col">
          <p style={{ fontWeight: 700 }}>{T('transferAt', { station: alight.name, line: nextLegInfo.lineName })}</p>
          {/* 환승역에서는 휴대폰이 이용자가 어느 쪽을 보는지 모르므로 방면으로 안내하고, 그곳 기둥 QR을 찍게 한다 */}
          <p style={{ fontWeight: 600 }}>
            {nextLegInfo.loopDir
              ? T(nextLegInfo.loopDir)
              : T('trainTowards', { names: nextLegInfo.terminals.slice(0, 2).map((s) => s.name).join(', ') })}
          </p>
          <p className="muted small">{T('nextStop', { name: nextLegInfo.stations[1].name })}</p>
          <div className="note">
            <Icon name="qr" size={18} /> {T('transferRescan')}
          </div>
          <button className="btn primary block" onClick={nextLeg}>
            <Icon name="train" /> {T('boardedNext')}
          </button>
        </div>
      )}

      {remaining > 0 && (
        <div className="btns">
          <button className="btn" onClick={() => setAdjust((a) => a + 1)}>
            <Icon name="plus" size={18} /> {T('passedStop')}
          </button>
          <button className="btn" onClick={() => setAdjust((a) => a - 1)} disabled={passed === 0}>
            <Icon name="undo" size={18} /> {T('undo')}
          </button>
        </div>
      )}

      <div className="note" style={{ fontWeight: 500 }}>
        <Icon name="info" size={18} />
        <span className="small">
          {T('estimate')} {!canVibrate && <>{T('vibrateOff')}. </>}
          {T('keepOpen')}.
        </span>
      </div>

      <div className="btns">
        <button className="btn" onClick={onPad}>
          <Icon name="pen" size={18} /> {T('writingPad')}
        </button>
        <button className="btn" onClick={onEnd}>
          {T('endGuide')}
        </button>
      </div>
    </section>
  );
}
