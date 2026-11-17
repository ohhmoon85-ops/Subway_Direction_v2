'use client';
/**
 * 음성 입력(휴대폰 음성인식)과 소리로 읽어 주기.
 * 브라우저 기본 기능만 쓴다. 지원하지 않는 브라우저(일부 앱 안 브라우저)에서는 버튼을 숨긴다.
 */
import type { Lang } from './types';

export const SPEECH_LANG: Record<Lang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  es: 'es-ES',
  fr: 'fr-FR',
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return !!ctor();
}

/**
 * 한 번 듣고 후보 문장들을 돌려준다(가장 그럴듯한 것부터).
 * 취소하려면 돌려받은 stop()을 부른다.
 */
export function listenOnce(
  lang: Lang,
  handlers: { onInterim?: (text: string) => void; onResult: (alternatives: string[]) => void; onError: (code: string) => void; onEnd: () => void },
): { stop: () => void } {
  const C = ctor();
  if (!C) {
    handlers.onError('unsupported');
    handlers.onEnd();
    return { stop: () => {} };
  }
  const r = new C();
  r.lang = SPEECH_LANG[lang];
  r.interimResults = true;
  r.maxAlternatives = 3;
  r.continuous = false;
  let done = false;
  r.onresult = (e: any) => {
    const res = e.results[e.results.length - 1];
    if (res.isFinal) {
      done = true;
      const alts: string[] = [];
      for (let i = 0; i < res.length; i++) alts.push(String(res[i].transcript).trim());
      handlers.onResult(alts.filter(Boolean));
    } else handlers.onInterim?.(String(res[0].transcript));
  };
  r.onerror = (e: any) => handlers.onError(String(e?.error ?? 'error'));
  r.onend = () => {
    if (!done) handlers.onError('no-speech');
    handlers.onEnd();
  };
  try {
    r.start();
  } catch {
    handlers.onError('start-failed');
    handlers.onEnd();
  }
  return { stop: () => r.stop() };
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, lang: Lang) {
  if (!canSpeak() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  u.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').startsWith(SPEECH_LANG[lang].slice(0, 2)));
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
