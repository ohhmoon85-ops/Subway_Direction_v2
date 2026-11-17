'use client';
/**
 * [QR 찍기] — 승강장 기둥의 QR 표지를 찍어 표지 모드(왼쪽·오른쪽 안내)로 들어간다.
 *  - 브라우저에 QR 읽기 기능(BarcodeDetector)이 있으면 카메라 화면을 열어 바로 읽는다 (안드로이드 크롬 등).
 *  - 없으면(아이폰 사파리 등) 휴대폰 기본 카메라 앱으로 찍으라고 안내한다. 기본 카메라 앱도 QR을 읽어 이 사이트를 연다.
 * 이 사이트의 표지 주소(/s/…)만 연다. 다른 QR이면 열지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { Icon } from './Icon';

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

function makeDetector(): Detector | null {
  const C = (globalThis as any).BarcodeDetector;
  if (!C) return null;
  try {
    return new C({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/** 이 사이트의 표지 주소면 같은 사이트 안의 경로를, 아니면 null */
export function signPathFromQr(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return null;
    return /^\/s\/[^/]+$/.test(u.pathname) ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export function QrScanBox({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card scan-box col" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <span className="scan-icon" aria-hidden>
          <Icon name="qr" size={22} />
        </span>
        <p style={{ fontWeight: 600 }}>{t(lang, 'scanBoxTitle')}</p>
      </div>
      <button className="btn block" onClick={() => setOpen(true)}>
        <Icon name="qr" size={18} /> {t(lang, 'scanQr')}
      </button>
      {open && <QrScanner lang={lang} onClose={() => setOpen(false)} />}
    </section>
  );
}

function QrScanner({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'nocamera' | 'notours'>('starting');

  useEffect(() => {
    const detector = makeDetector();
    if (!detector || !navigator.mediaDevices?.getUserMedia) {
      setState('nocamera');
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState('scanning');
        const tick = async () => {
          if (!alive || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            for (const c of codes) {
              const path = signPathFromQr(c.rawValue, location.origin);
              if (path) {
                alive = false;
                location.href = path;
                return;
              }
              setState('notours');
            }
          } catch {
            /* 다음 프레임에서 다시 */
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch {
        if (alive) setState('nocamera');
      }
    })();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label={t(lang, 'scanQr')}>
      <div className="row between">
        <strong>{t(lang, 'scanQr')}</strong>
        <button className="scanner-close" onClick={onClose} aria-label={t(lang, 'close')}>
          <Icon name="close" size={22} />
        </button>
      </div>
      {state === 'nocamera' ? (
        <div className="note" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
          <Icon name="info" size={18} /> {t(lang, 'scanNoCamera')}
        </div>
      ) : (
        <>
          <div className="scanner-view">
            <video ref={video} playsInline muted />
            <span className="scanner-frame" aria-hidden />
          </div>
          <p className="center">{state === 'notours' ? t(lang, 'scanNotOurs') : t(lang, 'scanHint')}</p>
        </>
      )}
    </div>
  );
}
