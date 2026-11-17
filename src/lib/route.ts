/**
 * 핵심 산출 로직 (기획서 7장). AI 없이 정해진 규칙으로만 계산한다.
 *  1) 경로: 역×노선 그래프의 최단 경로. 환승 1회 = TRANSFER_PENALTY 정거장.
 *  2) 좌·우: 첫 구간의 (노선, 다음 역)을 표지 매핑에서 찾는다.
 *  3) 몇 번째 역: 첫 구간에서 내릴 역까지의 정거장 수.
 */
import { STATION_COORDS } from '@/data/station-coords';
import { getLine, getNetwork, isShuttleSegment, linkedStations, loopOrder, segmentOf, terminalsToward, directionCode } from './network';
import { line1LocalOnly, line1ServiceHint } from './services';
import type { Side, Sign } from './types';

export const TRANSFER_PENALTY = Number(process.env.TRANSFER_PENALTY ?? 5);

const RIDE = 1000;
const XFER = () => TRANSFER_PENALTY * RIDE + 1; // +1: 같은 비용이면 환승 적은 쪽

export interface Leg {
  lineId: string;
  /** 탄 역부터 내릴 역까지 */
  stations: string[];
  stops: number;
  direction: 'inner' | 'outer' | 'up' | 'down';
  /** 이 방향 끝 역들 (루프면 빈 배열) */
  terminals: string[];
  /** 루프 노선에서 반대쪽으로 갈 때의 정거장 수 */
  oppositeStops?: number;
  /** 1호선 갈래: 이 행선지 열차만 */
  serviceHint?: string[];
  /** 급행 미정차 가능 → 일반 열차 */
  localOnly?: boolean;
  /** 이 구간을 타는 역에 있는 표지 기준 좌·우 (있으면) */
  side?: Side;
  signId?: string;
}

export interface RouteResult {
  originStationId: string;
  destStationId: string;
  sameStation: boolean;
  /** 표지의 노선이 아닌 노선을 먼저 타야 하면 그 노선 */
  moveToLineFirst?: string;
  legs: Leg[];
  totalStops: number;
  transfers: number;
}

const key = (line: string, st: string) => `${line}|${st}`;
const parse = (k: string) => {
  const i = k.indexOf('|');
  return { line: k.slice(0, i), st: k.slice(i + 1) };
};

/** (비용, 들어온 순서)가 작은 것부터 꺼내는 최소 힙. 같은 비용이면 먼저 들어온 것 → 결과가 늘 같다. */
class MinHeap {
  private a: { d: number; seq: number; k: string }[] = [];
  private seq = 0;
  get size() {
    return this.a.length;
  }
  push(k: string, d: number) {
    const a = this.a;
    a.push({ d, seq: this.seq++, k });
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): { d: number; k: string } {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
const less = (x: { d: number; seq: number }, y: { d: number; seq: number }) => x.d < y.d || (x.d === y.d && x.seq < y.seq);

/** 두 역의 권역이 다르면 true (도시철도끼리 이어지지 않으므로 경로가 없다 — 철도 안내는 범위 밖) */
export function differentRegion(a: string, b: string): boolean {
  const net = getNetwork();
  const ra = net.stations.get(a)?.region;
  const rb = net.stations.get(b)?.region;
  return !!ra && !!rb && ra !== rb;
}

/**
 * 출발역에서 표지가 가리키는 노선(signLines)은 비용 0, 다른 노선은 환승 비용으로 시작한다.
 * 같은 노선 안에서 갈래를 넘나드는 것은 환승이 아니다 (노선 그래프가 갈래를 모두 잇는다).
 */
export function findRoute(originId: string, destId: string, signLines: string[]): RouteResult | null {
  const net = getNetwork();
  const origin = net.stations.get(originId);
  const dest = net.stations.get(destId);
  if (!origin || !dest) return null;
  if (originId === destId || linkedStations(originId).includes(destId)) {
    return { originStationId: originId, destStationId: destId, sameStation: true, legs: [], totalStops: 0, transfers: 0 };
  }
  if (origin.region !== dest.region) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const heap = new MinHeap();
  const push = (k: string, d: number, from?: string) => {
    const cur = dist.get(k);
    if (cur === undefined || d < cur) {
      dist.set(k, d);
      if (from) prev.set(k, from);
      else prev.delete(k);
      heap.push(k, d);
    }
  };
  for (const l of origin.lines) push(key(l, originId), signLines.includes(l) ? 0 : XFER());

  while (heap.size) {
    const { d: bd, k } = heap.pop();
    if (done.has(k) || bd !== dist.get(k)) continue;
    done.add(k);
    const { line, st } = parse(k);
    if (st === destId) continue;
    for (const nb of net.adj.get(line)!.get(st)!) push(key(line, nb), bd + RIDE, k);
    for (const other of net.stations.get(st)!.lines) {
      if (other !== line) push(key(other, st), bd + XFER(), k);
    }
    // 이름이 다른 환승역(총신대입구 ↔ 이수)으로 걸어서 갈아타기
    for (const linked of linkedStations(st)) {
      for (const other of net.stations.get(linked)!.lines) push(key(other, linked), bd + XFER(), k);
    }
  }

  // 목적지와 이름만 다른 환승역(이수 ↔ 총신대입구)에 내려도 도착이다
  let best: string | null = null;
  for (const sid of [destId, ...linkedStations(destId)]) {
    for (const l of net.stations.get(sid)!.lines) {
      const k = key(l, sid);
      if (dist.has(k) && (best === null || dist.get(k)! < dist.get(best)!)) best = k;
    }
  }
  if (!best) return null;

  const path: string[] = [];
  for (let k: string | undefined = best; k; k = prev.get(k)) path.unshift(k);

  // 같은 노선이 이어지는 구간끼리 묶는다. 같은 노선이라도 열차가 이어 달리지 않는 갈래 사이에서는 나눈다.
  const legs: Leg[] = [];
  let cur: { lineId: string; stations: string[] } | null = null;
  for (const k of path) {
    const { line, st } = parse(k);
    if (!cur || cur.lineId !== line) {
      if (cur && cur.stations.length > 1) legs.push(makeLeg(cur.lineId, cur.stations));
      cur = { lineId: line, stations: [st] };
    } else {
      const seq: string[] = cur.stations;
      const len: number = seq.length;
      if (len >= 2 && mustChangeTrain(line, seq[len - 2], seq[len - 1], st)) {
        legs.push(makeLeg(line, seq));
        cur = { lineId: line, stations: [seq[len - 1], st] };
      } else seq.push(st);
    }
  }
  if (cur && cur.stations.length > 1) legs.push(makeLeg(cur.lineId, cur.stations));

  const first = legs[0];
  const moveToLineFirst = first && !signLines.includes(first.lineId) ? first.lineId : undefined;

  return {
    originStationId: originId,
    destStationId: destId,
    sameStation: false,
    moveToLineFirst,
    legs,
    totalStops: legs.reduce((a, l) => a + l.stops, 0),
    transfers: Math.max(0, legs.length - 1),
  };
}

/** j에서 본 a 방향과 b 방향 사이의 각의 코사인 (1에 가까울수록 같은 쪽 = 좁게 꺾임) */
function cosAt(j: string, a: string, b: string): number {
  const [cj, ca, cb] = [STATION_COORDS[j], STATION_COORDS[a], STATION_COORDS[b]];
  if (!cj || !ca || !cb) return -1;
  const k = Math.cos((cj[0] * Math.PI) / 180);
  const v1 = [ca[0] - cj[0], (ca[1] - cj[1]) * k];
  const v2 = [cb[0] - cj[0], (cb[1] - cj[1]) * k];
  return (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
}

/**
 * 같은 노선 안에서 p → j → n 으로 갈 때 j에서 열차를 갈아타야 하는가.
 * 경로 비용에는 환승 벌점을 주지 않지만(같은 노선의 갈래 이동), 실제로 열차가 이어 달리지 않으면 안내를 나눈다.
 *  - 셔틀·지선 구간과 다른 구간 사이 (2호선 성수·신정지선, 1호선 광명 셔틀)
 *  - 갈래 분기역에서 되돌아 나가는 경우 (구일 → 구로 → 가산디지털단지, 길동 → 강동 → 둔촌동):
 *    분기역에서 본선의 두 이웃 중 갈래와 가장 곧게 이어지는 쪽이 직통 방향이고, 반대쪽은 되돌아가는 것이다.
 */
export function mustChangeTrain(lineId: string, p: string, j: string, n: string): boolean {
  const a = segmentOf(lineId, p, j);
  const b = segmentOf(lineId, j, n);
  if (!a || !b || a.index === b.index) return false;
  if (isShuttleSegment(a.name) || isShuttleSegment(b.name)) return true;
  const isEnd = (seg: { stations: string[] }) => seg.stations[0] === j || seg.stations[seg.stations.length - 1] === j;
  const aEnd = isEnd(a);
  const bEnd = isEnd(b);
  if (aEnd === bEnd) return false; // 끝과 끝이 이어지거나 둘 다 지나가는 역: 그대로 이어 달린다
  // 갈래(끝이 j인 구간)의 역과, 본선(j를 지나가는 구간)의 두 이웃
  const [branchNb, mainSide, main] = aEnd ? [p, n, b] : [n, p, a];
  const mi = main.stations.indexOf(j);
  const mainNbs = [main.stations[mi - 1], main.stations[mi + 1]].filter(Boolean);
  if (mainNbs.length < 2) return false;
  const through = mainNbs.reduce((best, x) => (cosAt(j, branchNb, x) < cosAt(j, branchNb, best) ? x : best));
  return mainSide !== through;
}

function makeLeg(lineId: string, stations: string[]): Leg {
  const board = stations[0];
  const next = stations[1];
  const alight = stations[stations.length - 1];
  const stops = stations.length - 1;
  const leg: Leg = {
    lineId,
    stations,
    stops,
    direction: directionCode(lineId, board, next),
    terminals: terminalsToward(lineId, board, next),
  };
  // 순환 구간 안에서만 탈 때: 반대쪽으로 가면 몇 정거장인지
  const order = loopOrder(lineId);
  if (order && leg.direction !== 'up' && leg.direction !== 'down' && stations.every((x) => order.includes(x))) {
    leg.oppositeStops = order.length - stops;
  }
  if (lineId === '1') {
    // 북쪽 끝은 연천이지만 대부분의 열차는 소요산까지 → "소요산·연천 방면"으로 표시
    if (leg.terminals.includes('yeoncheon') && !stations.includes('soyosan') && board !== 'soyosan') {
      leg.terminals = ['soyosan', ...leg.terminals];
    }
    const hint = line1ServiceHint(board, next, alight);
    if (hint) leg.serviceHint = hint;
    if (line1LocalOnly(stations, alight)) leg.localOnly = true;
  }
  return leg;
}

/** 표지 매핑으로 좌·우를 찾는다. 없으면 undefined. */
export function sideFor(sign: Pick<Sign, 'mappings'>, lineId: string, nextStationId: string): Side | undefined {
  return sign.mappings.find((m) => m.lineId === lineId && m.nextStationId === nextStationId)?.side;
}

export function signLines(sign: Pick<Sign, 'mappings'>): string[] {
  return [...new Set(sign.mappings.map((m) => m.lineId))];
}

/**
 * 표지 기준 전체 안내. 환승역에 등록된 표지가 있으면 그 표지 기준 좌·우도 채운다.
 */
export function guide(sign: Sign, destId: string, allSigns: Sign[]): RouteResult | null {
  const r = findRoute(sign.stationId, destId, signLines(sign));
  if (!r) return null;
  r.legs.forEach((leg, i) => {
    const board = leg.stations[0];
    const next = leg.stations[1];
    if (i === 0 && !r.moveToLineFirst) {
      leg.side = sideFor(sign, leg.lineId, next);
      leg.signId = sign.id;
      return;
    }
    const candidate = allSigns.find(
      (s) => s.status === 'active' && s.stationId === board && sideFor(s, leg.lineId, next),
    );
    if (candidate) {
      leg.side = sideFor(candidate, leg.lineId, next);
      leg.signId = candidate.id;
    }
  });
  return r;
}

export function lineIsLoop(lineId: string): boolean {
  return !!getLine(lineId)?.loop;
}
