/**
 * 안내 중인 목적지 (기획서 3장·F6).
 *  - QR 없이 결과를 보던 이용자가 기둥 QR을 찍으면, 입력했던 목적지를 그대로 유지한 채 좌·우 화면으로 바뀐다.
 *  - 환승역에서 그 역 기둥 QR을 다시 찍으면 목적지를 다시 넣지 않아도 다음 구간의 좌·우를 알려 준다.
 * 휴대폰 기본 카메라 앱으로 QR을 찍으면 새 탭이 열리므로 sessionStorage가 아니라 localStorage에 둔다.
 * 목적지만 저장하고(위치는 저장하지 않음), "다른 곳 찾기"·"안내 끝내기"·도착하면 지운다.
 */
import type { Candidate } from './search';

export const ACTIVE_DEST_KEY = 'dap_active_dest';
/** 이보다 오래된 목적지는 새 여행으로 보고 쓰지 않는다 (제안값, 현장 시험으로 조정) */
export const ACTIVE_DEST_TTL_MS = 90 * 60_000;

export interface ActiveDest {
  c: Candidate;
  at: number;
}

/** 저장된 값 → 아직 쓸 수 있는 목적지 (오래됐거나 형식이 틀리면 null) */
export function parseActiveDest(raw: string | null, now: number): Candidate | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ActiveDest;
    if (!v?.c?.id || !v.c.kind || !v.c.stationId || typeof v.at !== 'number') return null;
    if (now - v.at > ACTIVE_DEST_TTL_MS || v.at > now + 60_000) return null;
    return v.c;
  } catch {
    return null;
  }
}

/**
 * 기둥 QR을 찍었을 때 저장된 목적지로 바로 안내할 것인가.
 * 다른 도시의 표지거나, 이미 목적지 역에 와 있으면 이어 가지 않는다.
 */
export function shouldResume(c: Candidate | null, sign: { stationId: string; region: string }): c is Candidate {
  return !!c && c.region === sign.region && c.stationId !== sign.stationId;
}

export function loadActiveDest(): Candidate | null {
  try {
    return parseActiveDest(localStorage.getItem(ACTIVE_DEST_KEY), Date.now());
  } catch {
    return null;
  }
}

export function saveActiveDest(c: Candidate): void {
  try {
    localStorage.setItem(ACTIVE_DEST_KEY, JSON.stringify({ c, at: Date.now() } satisfies ActiveDest));
  } catch {
    /* 저장 못 하면 QR을 찍은 뒤 목적지를 다시 넣으면 된다 */
  }
}

export function clearActiveDest(): void {
  try {
    localStorage.removeItem(ACTIVE_DEST_KEY);
  } catch {}
}
