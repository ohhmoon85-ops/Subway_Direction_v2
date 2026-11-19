/**
 * 탑승 중 위치 추적 (기획 4단계: 환승역·도착역에 다다르면 알림).
 *
 * 지하에서도 휴대폰 위치는 역·열차의 와이파이와 기지국으로 잡히는 경우가 많다(카카오맵과 같은 방식).
 * 받은 위치를 "이번 구간의 역 순서" 위에 맞춰, 지금 몇 번째 역까지 왔는지 정한다.
 *  - 위치는 휴대폰 안에서만 쓰고 서버로 보내지 않는다.
 *  - 부정확하거나 경로에서 먼 위치, 열차가 갈 수 없을 만큼 앞서 나간 위치는 버린다.
 *  - 뒤로 돌아가지 않는다 (마지막으로 확인한 역보다 앞쪽만).
 * 숫자는 제안값이며 현장 시험으로 조정한다.
 */
import { distanceM } from './location';

/** 이보다 부정확한 위치(m)는 쓰지 않는다 */
export const TRACK_MAX_ACCURACY_M = 500;
/** 경로(역과 역을 잇는 선)에서 이만큼 + 오차보다 멀면 경로 밖 위치로 보고 버린다 */
export const TRACK_OFF_ROUTE_M = 300;
/** 다음 역에 이만큼(m) 가까우면 그 역에 도착한 것으로 본다 */
export const TRACK_ARRIVE_M = 150;
/** 열차가 한 역을 가는 데 걸리는 가장 짧은 시간 — 이보다 빨리 앞서 나가면 튀는 위치로 본다 */
export const TRACK_MIN_SEC_PER_STOP = 45;
/** 마지막으로 받아들인 위치가 이보다 오래되면 시간 추정으로 넘어간다 */
export const TRACK_FRESH_MS = 90_000;

export interface TrackFix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

export interface TrackAnchor {
  /** 확인된 위치: 출발역에서 몇 개 역을 지났는가 (0 = 출발역) */
  index: number;
  /** 그 위치를 확인한 시각 */
  at: number;
  source: 'start' | 'gps' | 'manual';
}

type Coord = [number, number] | undefined;

/** 점 p를 선분 a–b에 내린 위치 (0~1)와 거리(m). 짧은 거리라 평면으로 근사한다. */
function project(p: [number, number], a: [number, number], b: [number, number]): { t: number; d: number } {
  const k = Math.cos((a[0] * Math.PI) / 180);
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const q: [number, number] = [ay + t * dy, (ax + t * dx) / k];
  return { t, d: distanceM(p, q) };
}

/**
 * 위치 하나 → 이번 구간에서 지난 역 수. 쓸 수 없는 위치면 null.
 * coords: 구간의 역 좌표 (탄 역 → 내릴 역), minIndex~maxIndex: 이 범위 안에서만 찾는다.
 */
export function indexOnRoute(coords: Coord[], fix: TrackFix, minIndex: number, maxIndex: number): number | null {
  if (!(fix.accuracy <= TRACK_MAX_ACCURACY_M)) return null;
  const last = coords.length - 1;
  const lo = Math.max(0, Math.min(minIndex, last));
  const hi = Math.max(lo, Math.min(maxIndex, last));
  const p: [number, number] = [fix.lat, fix.lng];
  let best: { i: number; t: number; d: number } | null = null;
  for (let i = lo; i <= hi; i++) {
    const a = coords[i];
    if (!a) continue;
    const b = i < hi ? coords[i + 1] : undefined;
    const r = b ? project(p, a, b) : { t: 0, d: distanceM(p, a) };
    if (!best || r.d < best.d) best = { i, ...r };
  }
  if (!best || best.d > TRACK_OFF_ROUTE_M + fix.accuracy) return null;
  const next = coords[best.i + 1];
  if (best.i < hi && next && distanceM(p, next) <= Math.max(TRACK_ARRIVE_M, fix.accuracy / 2)) return best.i + 1;
  return best.i;
}

/** 이 시각까지 열차가 갈 수 있는 가장 먼 역 (튀는 위치를 거르기 위해) */
export function maxReachable(anchor: TrackAnchor, now: number, stops: number): number {
  return Math.min(stops, anchor.index + 1 + Math.floor(Math.max(0, now - anchor.at) / (TRACK_MIN_SEC_PER_STOP * 1000)));
}

/**
 * 지금 지난 역 수: 최근 위치가 있으면 그 위치, 없으면 마지막 확인 위치 + 경과 시간으로 추정.
 */
export function passedStops(anchor: TrackAnchor, now: number, stops: number, secPerStop: number): { passed: number; byLocation: boolean } {
  const fresh = anchor.source === 'gps' && now - anchor.at <= TRACK_FRESH_MS;
  if (fresh) return { passed: Math.min(stops, anchor.index), byLocation: true };
  const extra = Math.floor(Math.max(0, now - anchor.at) / (secPerStop * 1000));
  return { passed: Math.max(0, Math.min(stops, anchor.index + extra)), byLocation: false };
}
