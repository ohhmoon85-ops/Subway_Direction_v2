'use client';
/**
 * S4 탑승 중 — 남은 역 수와 내릴 역 알림 (기획 4단계).
 * - 현재 위치(와이파이·기지국 측위, 지하에서도 잡히는 경우가 많음)를 경로 위의 역에 맞춰 몇 번째 역인지 정한다.
 *   위치가 안 잡히면 마지막으로 확인한 역 + 평균 역간 시간으로 추정한다. 위치는 서버로 보내지 않는다.
 * - 환승이 없으면 "강남까지 N개 역", 환승이 있으면 "환승역 정자까지 N개 역" + 최종 도착까지 모두 몇 개 역
 * - 내릴 역(환승역·도착역) 한 정거장 전과 도착했을 때 진동, 아이폰 등 진동 미지원 기기는 화면 점멸 + 큰 문자
 * - 화면 꺼짐 방지(Wake Lock). 웹 페이지는 화면이 꺼지면 멈추므로 화면을 켜 두도록 안내한다.
 * - 실제와 어긋나면 이용자가 "+1"로 맞춘다
 */
import { useEffect, useRef, useState } from 'react';
import type { GuideView } from '@/lib/guide-view';
import { t, withStation } from '@/lib/i18n';
import { saveFix } from '@/lib/location';
import { indexOnRoute, maxReachable, passedStops, type TrackAnchor } from '@/lib/ride-track';
import { speak, stopSpeaking } from '@/lib/speech';
import type { Lang } from '@/lib/types';
import { Icon, LineBadge } from './Icon';

/** 노선별 평균 역간 소요(초). 시간표 공공데이터 연동 전 임시값 — 시범 운영에서 보정. */
const SEC_PER_STOP: Record<string, number> = { '1': 150, '2': 120, '3': 125, '4': 130 };

type WakeLockSentinelLike = { release: () => Promise<void> };

export function RideView({ g, lang, hearing, speakAlerts, onEnd, onPad }: { g: GuideView; lang: Lang; hearing: boolean; speakAlerts: boolean; onEnd: () => void; onPad: () => void }) {
  const [legIdx, setLegIdx] = useState(0);
  /** 마지막으로 확인한 위치 (탄 역 / 현재 위치 / 이용자가 버튼으로 맞춘 위치) */
  const [anchor, setAnchor] = useState<TrackAnchor>(() => ({ index: 0, at: Date.now(), source: 'start' }));
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
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
  const secPerStop = SEC_PER_STOP[leg.lineId] ?? 130;

  // 현재 위치를 계속 받아 경로 위의 역에 맞춘다 (구간이 바뀌면 다시)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const coords = leg.stations.map((s) => s.c);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
        saveFix({ ...fix, source: 'now' }); // 내린 뒤 다음 안내의 출발역 찾기에도 쓰인다 (휴대폰에만 저장)
        const a = anchorRef.current;
        const idx = indexOnRoute(coords, fix, a.index, maxReachable(a, fix.at, leg.stops));
        if (idx !== null) setAnchor({ index: idx, at: fix.at, source: 'gps' });
        setNow(Date.now());
      },
      () => {
        /* 권한 없음·신호 없음: 시간 추정으로 계속 */
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [leg]);

  const { passed, byLocation } = passedStops(anchor, now, leg.stops, secPerStop);
  const remaining = leg.stops - passed;
  const isLastLeg = legIdx === g.legs.length - 1;
  /** 최종 도착역까지 남은 역 수 (이번 구간 남은 역 + 다음 구간들) */
  const totalLeft = remaining + g.legs.slice(legIdx + 1).reduce((n, l) => n + l.stops, 0);
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

  // 환승역·도착역에 도착했을 때 한 번 더 진동 (구간마다 한 번)
  const arrivedBuzz = useRef(-1);
  useEffect(() => {
    if (remaining === 0 && arrivedBuzz.current !== legIdx) {
      arrivedBuzz.current = legIdx;
      if ('vibrate' in navigator) navigator.vibrate([800, 300, 800]);
    }
  }, [remaining, legIdx]);

  // 도착·환승 지점에서 소리 안내
  const announced = useRef(-1);
  useEffect(() => {
    if (remaining === 0 && announced.current !== legIdx && speakAlerts) {
      announced.current = legIdx;
      const nl = g.legs[legIdx + 1];
      speak(nl ? t(lang, 'arrivedTransfer', { station: alight.name, line: nl.lineName }) : t(lang, 'arrived', { station: withStation(lang, alight.name) }), lang);
    }
  }, [remaining, legIdx, speakAlerts, g.legs, lang, alight.name]);
  useEffect(() => () => stopSpeaking(), []);

  const nextLeg = () => {
    setLegIdx((i) => i + 1);
    setAnchor({ index: 0, at: Date.now(), source: 'start' });
    setNow(Date.now());
  };
  /** 이용자가 "+1"·"되돌리기"로 맞춘 위치를 새 기준으로 */
  const adjustBy = (d: number) => {
    setAnchor({ index: Math.max(0, Math.min(leg.stops, passed + d)), at: Date.now(), source: 'manual' });
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
            <h2 style={{ marginTop: 10 }}>
              {isLastLeg || !nextLegInfo ? T('arrived', { station: withStation(lang, alight.name) }) : T('arrivedTransfer', { station: alight.name, line: nextLegInfo.lineName })}
            </h2>
          </>
        ) : (
          <>
            <p className="ride-big">{remaining}</p>
            <h2 style={{ marginTop: 6, fontSize: urgent && hearing ? '1.5em' : undefined }}>
              {urgent ? T('getOffNext') : T(isLastLeg ? 'leftToDest' : 'leftToTransfer', { n: remaining, station: alight.name })}
            </h2>
            {urgent && <p className="ride-sub">{T(isLastLeg ? 'leftToDest' : 'leftToTransfer', { n: remaining, station: alight.name })}</p>}
            {nextLegInfo && (
              <>
                <p className="ride-sub">
                  <LineBadge num={nextLegInfo.num} color={nextLegInfo.color} size="sm" /> {T('transferAt', { station: alight.name, line: nextLegInfo.lineName })}
                </p>
                <p className="ride-sub muted">{T('totalLeft', { n: totalLeft, station: withStation(lang, g.dest.name) })}</p>
              </>
            )}
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
            <span className="k">{isLastLeg ? T('alightAt') : T('transferStation')}</span>
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
          <button className="btn" onClick={() => adjustBy(1)}>
            <Icon name="plus" size={18} /> {T('passedStop')}
          </button>
          <button className="btn" onClick={() => adjustBy(-1)} disabled={passed === 0}>
            <Icon name="undo" size={18} /> {T('undo')}
          </button>
        </div>
      )}

      <div className="note" style={{ fontWeight: 500 }} role="status">
        <Icon name={byLocation ? 'locate' : 'info'} size={18} />
        <span className="small">
          {byLocation ? T('trackGps') : T('trackTime')} {!canVibrate && <>{T('vibrateOff')}. </>}
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
