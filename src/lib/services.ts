/**
 * 1호선처럼 갈래가 나뉘는 노선의 "○○행만 타세요"와 급행 주의 안내.
 */
import { LINE1_SERVICES } from '@/data/network-data';
import { stationByKo } from './network';

const id = (ko: string) => {
  const st = stationByKo(ko);
  if (!st) throw new Error(`services: unknown station ${ko}`);
  return st.id;
};

let prepared: {
  trunk: string[];
  north: string[];
  south: { terminal: string; stations: Set<string> }[];
  express: Set<string>;
  metro: Set<string>;
} | null = null;

function prep() {
  if (prepared) return prepared;
  prepared = {
    trunk: LINE1_SERVICES.trunk.map(id),
    north: LINE1_SERVICES.northTerminals.map(id),
    south: LINE1_SERVICES.southPatterns.map((p) => ({ terminal: id(p.terminal), stations: new Set(p.stations.map(id)) })),
    express: new Set(LINE1_SERVICES.expressStops.map(id)),
    metro: new Set(LINE1_SERVICES.metroSection.map(id)),
  };
  return prepared;
}

/** 1호선 경로상 "깊이" — 연천 0에서 남쪽으로 커진다. */
function depth(st: string): number {
  const p = prep();
  const t = p.trunk.indexOf(st);
  if (t >= 0) return t;
  const base = p.trunk.length - 1;
  // 남쪽 갈래: 가장 긴 계통 안의 순서
  for (const pat of p.south) {
    const arr = [...pat.stations];
    const i = arr.indexOf(st);
    if (i >= 0) return base + 1 + i;
  }
  return base;
}

/**
 * 탈 열차의 행선지 제한. 모든 열차가 가면 null.
 * board → next 방향으로 타서 alight 에서 내리는 1호선 구간.
 */
export function line1ServiceHint(board: string, next: string, alight: string): string[] | null {
  const p = prep();
  const southbound = depth(next) > depth(board);
  if (southbound) {
    if (p.trunk.includes(alight)) return null;
    const relevant = p.trunk.includes(board) ? p.south : p.south.filter((s) => s.stations.has(board));
    const valid = relevant.filter((s) => s.stations.has(alight));
    if (valid.length === 0 || valid.length === relevant.length) return null;
    return valid.map((s) => s.terminal);
  }
  const a = p.trunk.indexOf(alight);
  if (a < 0) return null;
  const valid = p.north.filter((t) => p.trunk.indexOf(t) <= a);
  if (valid.length === p.north.length) return null;
  return valid;
}

/** 목적지가 급행 미정차일 수 있는 코레일 구간이면 true → "일반 열차를 타세요" */
export function line1LocalOnly(stations: string[], alight: string): boolean {
  const p = prep();
  const usesKorail = stations.some((s) => !p.metro.has(s));
  return usesKorail && !p.express.has(alight) && !p.metro.has(alight);
}
