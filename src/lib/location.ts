/**
 * 현재 역 확인 (기획서 3장) — 휴대폰 안에서만 쓰는 위치 규칙.
 *
 * 지하에서는 GPS가 안 잡히므로 지상에서 마지막으로 받은 위치(직전 위치)를 휴대폰에 저장해 두었다가 쓴다.
 * 위치는 서버로 보내지 않고, 가까운 역 계산도 휴대폰에서 한다(10장). 직전 위치는 최대 30분만 보관한다.
 *
 * 숫자(300m, 30분 등)는 기획서의 제안값이며 현장 시험으로 조정한다.
 */

/** 직전 위치 보관 시간 */
export const FIX_MAX_AGE_MS = 30 * 60_000;
/** 이 정확도(m) 이내면 "현재 위치"로 믿고 바로 쓴다 */
export const GOOD_ACCURACY_M = 300;
/** 저장할 가치가 있는 최소 정확도(m). 이보다 부정확한 위치는 저장하지 않는다 */
export const SAVE_ACCURACY_M = 1000;
/** 후보 역 반경의 기본값(m) */
export const BASE_RADIUS_M = 300;
/** 위치를 받은 뒤 1분마다 늘리는 반경(m) — 걷는 속도 정도 */
export const DRIFT_M_PER_MIN = 80;
export const MAX_RADIUS_M = 3000;
/** QR 표지 대조: 위치 오차를 빼고도 표지 역에서 이만큼 넘게 떨어져 있으면 경고 */
export const SIGN_MISMATCH_M = 300;
/** QR 표지 대조에는 이보다 오래된 위치는 쓰지 않는다 (그사이 열차로 이동했을 수 있음) */
export const SIGN_CHECK_MAX_AGE_MS = 5 * 60_000;

export type FixSource = 'now' | 'saved' | 'browser';

export interface Fix {
  lat: number;
  lng: number;
  /** 휴대폰이 알려 준 오차 반경(m) */
  accuracy: number;
  /** 위치를 받은 시각 (ms) */
  at: number;
  source: FixSource;
}

export interface StationPoint {
  id: string;
  ko: string;
  /** 언어별 역 이름 */
  names: Record<string, string>;
  lines: string[];
  /** 권역 */
  region?: string;
  /** [위도, 경도] */
  c: [number, number];
}

export interface StationCandidate {
  id: string;
  distance: number;
  /** 후보 반경 안에 있는가 */
  inRadius: boolean;
}

export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fixAgeMs(fix: Fix, now: number): number {
  return Math.max(0, now - fix.at);
}

/** 30분이 지났거나 시각이 이상한(미래) 위치는 쓰지 않는다 */
export function isFresh(fix: Fix, now: number): boolean {
  return now - fix.at <= FIX_MAX_AGE_MS && fix.at - now <= 60_000;
}

/** 위치가 오래될수록(그만큼 멀리 이동했을 수 있으므로) 후보 반경을 넓힌다 */
export function searchRadius(fix: Fix, now: number): number {
  const minutes = fixAgeMs(fix, now) / 60_000;
  return Math.round(Math.min(MAX_RADIUS_M, Math.max(BASE_RADIUS_M, fix.accuracy) + DRIFT_M_PER_MIN * minutes));
}

/**
 * 위치에서 가까운 역 후보 (가까운 순, 반경 안이면 inRadius).
 * 최소 max개를 채우고, 반경 안 역이 더 많으면(오래된 위치) 두 개까지 더 보여 준다.
 */
export function stationCandidates(points: StationPoint[], fix: Fix, now: number, max = 3): StationCandidate[] {
  const radius = searchRadius(fix, now);
  const all = points
    .map((p) => {
      const distance = Math.round(distanceM([fix.lat, fix.lng], p.c));
      return { id: p.id, distance, inRadius: distance <= radius };
    })
    .sort((a, b) => a.distance - b.distance);
  const inside = all.filter((c) => c.inRadius).length;
  return all.slice(0, Math.max(max, Math.min(inside, max + 2)));
}

// ── 출발역을 물어볼지 (기획서 5장: 예외일 때만 묻는다) ─────────────

/** 위치 오차가 이보다 크면 후보를 보여 고르게 한다 */
export const CONFIRM_ACCURACY_M = 100;
/** 이 반경 안에 역이 두 개 이상이면 후보를 보여 고르게 한다 */
export const CROWD_RADIUS_M = 300;
/** 직전 위치가 이만큼 지났으면 후보를 보여 고르게 한다 */
export const CONFIRM_AGE_MS = 10 * 60_000;

export type OriginDecision =
  | { kind: 'auto'; stationId: string; distance: number }
  | { kind: 'choose'; reason: 'inaccurate' | 'crowded' | 'stale' | 'far'; choices: StationCandidate[] };

/**
 * 위치로 찾은 후보 → 바로 출발역으로 정할지, 후보 2~3개를 보여 줄지.
 * 환승역의 노선은 묻지 않는다 (목적지에 맞는 노선을 경로 계산이 고른다).
 */
export function originDecision(fix: Fix, cands: StationCandidate[], now: number): OriginDecision {
  const choices = cands.slice(0, 3);
  const top = cands[0];
  if (!top || !top.inRadius) return { kind: 'choose', reason: 'far', choices };
  if (fix.accuracy > CONFIRM_ACCURACY_M) return { kind: 'choose', reason: 'inaccurate', choices };
  if (fix.source !== 'now' && fixAgeMs(fix, now) >= CONFIRM_AGE_MS) return { kind: 'choose', reason: 'stale', choices };
  if (cands.filter((c) => c.distance <= CROWD_RADIUS_M).length >= 2) return { kind: 'choose', reason: 'crowded', choices };
  return { kind: 'auto', stationId: top.id, distance: top.distance };
}

/**
 * QR 표지(A 방식) 대조: 표지 역과 위치가 맞지 않으면 떨어진 거리(km)를, 맞거나 판단할 수 없으면 null.
 * 오래되거나 부정확한 위치로는 경고하지 않는다 (잘못된 경고가 표지 안내보다 해롭다).
 */
export function signMismatchKm(signCoord: [number, number], fix: Fix, now: number): number | null {
  if (fix.accuracy > SAVE_ACCURACY_M) return null;
  if (fixAgeMs(fix, now) > SIGN_CHECK_MAX_AGE_MS || !isFresh(fix, now)) return null;
  const d = distanceM(signCoord, [fix.lat, fix.lng]);
  if (d - fix.accuracy <= SIGN_MISMATCH_M) return null;
  return Math.round(d / 100) / 10;
}

// ── 휴대폰 저장 (localStorage) ─────────────────────────────

const KEY = 'dap_last_fix';

/** 저장된 문자열 → 쓸 수 있는 직전 위치 (형식이 틀리거나 30분이 지났으면 null) */
export function parseStoredFix(raw: string | null, now: number): Fix | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const ok = [o.lat, o.lng, o.accuracy, o.at].every((x) => typeof x === 'number' && Number.isFinite(x));
    if (!ok || Math.abs(o.lat) > 90 || Math.abs(o.lng) > 180) return null;
    const fix: Fix = { lat: o.lat, lng: o.lng, accuracy: o.accuracy, at: o.at, source: 'saved' };
    return isFresh(fix, now) ? fix : null;
  } catch {
    return null;
  }
}

export function loadSavedFix(now = Date.now()): Fix | null {
  try {
    const fix = parseStoredFix(localStorage.getItem(KEY), now);
    if (!fix) localStorage.removeItem(KEY); // 30분 지난 위치는 지운다
    return fix;
  } catch {
    return null;
  }
}

export function saveFix(fix: Fix): void {
  if (fix.accuracy > SAVE_ACCURACY_M) return;
  try {
    const prev = parseStoredFix(localStorage.getItem(KEY), Date.now());
    if (prev && prev.at > fix.at && prev.accuracy <= fix.accuracy) return; // 더 새롭고 정확한 위치를 덮어쓰지 않음
    localStorage.setItem(KEY, JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy), at: fix.at }));
  } catch {
    /* 저장 실패(사생활 보호 모드 등)는 무시 */
  }
}

export function clearSavedFix(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// ── 브라우저 위치 API ─────────────────────────────────────

function toFix(pos: GeolocationPosition, source: FixSource): Fix {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp || Date.now(), source };
}

function position(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));
}

export async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions) return 'unknown';
    return (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}

/**
 * 위치 권한이 이미 허용돼 있을 때만 조용히 현재 위치를 받아 저장한다 (새로 묻지 않음).
 * 역 입구·지상에서 화면을 열 때마다 불러, 지하에서 쓸 직전 위치를 만들어 둔다.
 */
export async function rememberQuietly(): Promise<Fix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  if ((await permissionState()) !== 'granted') return null;
  try {
    const fix = toFix(await position({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }), 'now');
    saveFix(fix);
    return fix;
  } catch {
    return null;
  }
}

export type LocateResult = { fix: Fix; rough: boolean } | { fix: null; denied: boolean };

/**
 * 현재 역을 찾을 위치 고르기 (3장의 순서):
 *  1. 현재 위치 — 정확도가 GOOD_ACCURACY_M 이내면 바로 쓴다
 *  2. 직전 위치(앱이 저장) 또는 브라우저가 기억한 최근 위치 — 30분 이내, 둘 중 새것
 *  3. 부정확한 현재 위치라도 있으면 넓은 반경으로
 *  4. 없으면 직접 선택
 */
export async function locate(): Promise<LocateResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { fix: null, denied: false };
  let rough: Fix | null = null;
  try {
    const now = toFix(await position({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }), 'now');
    saveFix(now);
    if (now.accuracy <= GOOD_ACCURACY_M) return { fix: now, rough: false };
    rough = now;
  } catch (e) {
    if ((e as GeolocationPositionError)?.code === 1) {
      clearSavedFix(); // 권한을 끈 이용자의 위치는 남기지 않는다
      return { fix: null, denied: true };
    }
  }
  const t = Date.now();
  const older: Fix[] = [];
  const saved = loadSavedFix(t);
  if (saved) older.push(saved);
  try {
    // 브라우저가 기억해 둔 위치만 즉시 돌려받기 (새로 찾지 않음)
    const cached = toFix(await position({ enableHighAccuracy: false, timeout: 0, maximumAge: FIX_MAX_AGE_MS }), 'browser');
    if (isFresh(cached, t) && cached.accuracy <= SAVE_ACCURACY_M) older.push(cached);
  } catch {}
  const best = older.sort((a, b) => b.at - a.at)[0];
  if (best && (!rough || best.accuracy + DRIFT_M_PER_MIN * (fixAgeMs(best, t) / 60_000) < rough.accuracy)) return { fix: best, rough: false };
  if (rough) return { fix: rough, rough: true };
  return { fix: null, denied: false };
}
