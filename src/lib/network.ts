/**
 * 노선망(그래프). 역×노선 단위로 이웃 역을 잇는다 (scripts/README.md "안내 계산에 쓰는 법").
 *  - line: 이웃한 두 역을 양방향으로
 *  - loop: 양방향 + 마지막 역 ↔ 첫 역
 *  - oneway_loop: 한 방향(앞 → 뒤) + 마지막 역 → 첫 역
 * 같은 노선의 갈래(구간)들은 만나는 역의 ID가 같아서 하나의 노선 그래프로 이어진다 → 갈래 이동은 환승이 아니다.
 */
import { LEGACY_LINE_IDS, RAW_LINES, RAW_STATIONS, TRANSFER_LINKS, slugify } from '@/data/network-data';
import type { Lang, Line, SegmentKind, Station } from './types';

export { slugify };

interface Network {
  stations: Map<string, Station>;
  /** 한국어 역명(원래 이름·화면 이름) → 역들 (권역이 다르면 여러 개) */
  byKo: Map<string, Station[]>;
  byKey: Map<string, Station>;
  lines: Map<string, Line>;
  /** lineId → stationId → 갈 수 있는 이웃 역 (한 방향 구간은 진행 방향만) */
  adj: Map<string, Map<string, string[]>>;
  /** `${lineId}|${from}|${to}` → 구간 번호 */
  edgeSeg: Map<string, number>;
  /** 이름이 다른 환승역 (총신대입구 ↔ 이수) */
  links: Map<string, string[]>;
  /** 노선 순서 (lines.json 순서, 1호선이 0) */
  lineRank: Map<string, number>;
}

let cached: Network | null = null;

export function getNetwork(): Network {
  if (cached) return cached;
  const stations = new Map<string, Station>();
  const byKo = new Map<string, Station[]>();
  const byKey = new Map<string, Station>();
  for (const r of RAW_STATIONS) {
    const st: Station = { id: r.id, key: r.key, ko: r.ko, nameKo: r.nameKo, en: r.en, ja: r.ja, zh: r.zh, hanja: r.hanja, aliases: r.aliases, lines: [], region: r.region };
    stations.set(st.id, st);
    byKey.set(st.key, st);
    for (const name of new Set([r.ko, r.nameKo])) {
      if (!byKo.has(name)) byKo.set(name, []);
      byKo.get(name)!.push(st);
    }
  }
  const lines = new Map<string, Line>();
  const adj = new Map<string, Map<string, string[]>>();
  const edgeSeg = new Map<string, number>();
  for (const raw of RAW_LINES) {
    if (lines.has(raw.id)) throw new Error(`duplicate line id ${raw.id}`);
    const line: Line = { id: raw.id, key: raw.key, num: raw.num, abbr: raw.abbr, name: raw.name, color: raw.color, region: raw.region, loop: raw.loop, segments: raw.segments, segs: raw.segs };
    lines.set(line.id, line);
    const m = new Map<string, string[]>();
    const arc = (a: string, b: string, seg: number) => {
      if (!m.has(a)) m.set(a, []);
      if (!m.has(b)) m.set(b, []);
      if (!m.get(a)!.includes(b)) m.get(a)!.push(b);
      if (!edgeSeg.has(`${line.id}|${a}|${b}`)) edgeSeg.set(`${line.id}|${a}|${b}`, seg);
    };
    raw.segs.forEach((seg, si) => {
      const st = seg.stations;
      const both = seg.kind !== 'oneway_loop';
      for (let i = 0; i + 1 < st.length; i++) {
        arc(st[i], st[i + 1], si);
        if (both) arc(st[i + 1], st[i], si);
      }
      if (seg.kind !== 'line' && st.length > 2) {
        arc(st[st.length - 1], st[0], si);
        if (both) arc(st[0], st[st.length - 1], si);
      }
    });
    adj.set(line.id, m);
    for (const sid of m.keys()) {
      const st = stations.get(sid)!;
      if (!st.lines.includes(line.id)) st.lines.push(line.id);
    }
  }
  const links = new Map<string, string[]>();
  for (const [ka, kb] of TRANSFER_LINKS) {
    const a = byKey.get(ka);
    const b = byKey.get(kb);
    if (!a || !b) throw new Error(`transfer link: unknown station ${ka} / ${kb}`);
    links.set(a.id, [...(links.get(a.id) ?? []), b.id]);
    links.set(b.id, [...(links.get(b.id) ?? []), a.id]);
  }
  const lineRank = new Map([...lines.keys()].map((id, i) => [id, i]));
  // 같은 이름(같은 권역의 동명이역)이면 앞 노선(1호선 쪽)의 역을 먼저
  const rank = (st: Station) => Math.min(...st.lines.map((l) => lineRank.get(l) ?? 999));
  for (const list of byKo.values()) list.sort((a, b) => rank(a) - rank(b));
  cached = { stations, byKo, byKey, lines, adj, edgeSeg, links, lineRank };
  return cached;
}

/** 이름이 달라도 환승이 되는 역들 (총신대입구 ↔ 이수) */
export function linkedStations(id: string): string[] {
  return getNetwork().links.get(id) ?? [];
}

export function getStation(id: string): Station | undefined {
  return getNetwork().stations.get(id);
}

/** 같은 한국어 이름의 역들 (권역이 다르면 여러 개) */
export function stationsByKo(ko: string): Station[] {
  return getNetwork().byKo.get(ko) ?? [];
}

/**
 * 한국어 역명 → 역. 같은 이름이 여러 권역에 있으면 region(기본 수도권)의 역을 고른다.
 * 화면 이름("신촌(경의중앙선)")이 정확히 같으면 그 역, 같은 권역의 동명이역이면 앞 노선(1호선 쪽)의 역.
 * 그 권역에 없으면 다른 권역의 역이라도 돌려준다.
 */
export function stationByKo(ko: string, region = '수도권'): Station | undefined {
  const list = stationsByKo(ko);
  return list.find((s) => s.ko === ko && s.region === region) ?? list.find((s) => s.region === region) ?? list[0];
}

/** "수도권:시청" → "city-hall" */
export function stationIdFromKey(key: string): string | undefined {
  return getNetwork().byKey.get(key)?.id;
}

/** "city-hall" → "수도권:시청" */
export function stationKeyFromId(id: string): string | undefined {
  return getStation(id)?.key;
}

/** 저장된 역 ID가 JSON 키 형식이면 앱 ID로 바꾼다 (이미 앱 ID면 그대로) */
export function normalizeStationId(id: string): string {
  if (getNetwork().stations.has(id)) return id;
  return stationIdFromKey(id) ?? id;
}

/** 시제품의 갈래 노선 ID(1G·2S·2J)나 JSON 노선 ID("SEOUL-2")를 지금 노선 ID로 */
export function normalizeLineId(id: string): string {
  if (getNetwork().lines.has(id)) return id;
  if (LEGACY_LINE_IDS[id]) return LEGACY_LINE_IDS[id];
  for (const l of getNetwork().lines.values()) if (l.key === id) return l.id;
  return id;
}

export function getLine(id: string): Line | undefined {
  return getNetwork().lines.get(id);
}

/** 그 노선에서 이 역에서 갈 수 있는 이웃 역 (한 방향 구간은 진행 방향만) */
export function neighbors(lineId: string, stationId: string): string[] {
  return getNetwork().adj.get(lineId)?.get(stationId) ?? [];
}

export function segmentOf(lineId: string, from: string, to: string): { index: number; kind: SegmentKind; name: string; stations: string[] } | undefined {
  const i = getNetwork().edgeSeg.get(`${lineId}|${from}|${to}`);
  if (i === undefined) return undefined;
  const seg = getLine(lineId)!.segs[i];
  return { index: i, ...seg };
}

/**
 * 화면에 쓰는 역 이름: 한국어 화면은 display_ko(없으면 name_ko), 그 밖의 언어는 name_en.
 * (외국어 화면에서는 이 이름 아래에 한글 역명을 작게 함께 보여 역 표지판과 맞춰 보게 한다)
 */
export function stationName(st: Station, lang: Lang): string {
  return lang === 'ko' ? st.ko : st.en;
}

/** 순환 구간(kind: loop)의 역 순서 */
export function loopOrder(lineId: string): string[] | null {
  return getLine(lineId)?.segs.find((g) => g.kind === 'loop')?.stations ?? null;
}

/** 셔틀·지선 구간(1호선 광명 셔틀, 2호선 성수·신정지선): 본선과 직통하지 않는다 */
export const isShuttleSegment = (name: string) => /셔틀|지선/.test(name);

/**
 * from 에서 next 쪽으로 계속 갔을 때 닿는 끝 역들 (갈래가 있으면 여러 개).
 *  - 순환 구간(loop)에서 출발하면 빈 배열(내선·외선으로 안내).
 *  - 갈래에서 순환 구간을 만나면 그 역이 끝 (지선 열차는 본선으로 들어가지 않음).
 *  - 셔틀·지선은 출발이 그 구간일 때만 센다.
 *  - 한 방향 순환(6호선 응암순환): 순환 안에서는 한 바퀴 돌아 시작역(응암)을 지나 본선 끝(신내)까지,
 *    본선에서 순환 쪽으로 가면 순환 시작역(응암)이 끝.
 */
export function terminalsToward(lineId: string, from: string, next: string): string[] {
  const first = segmentOf(lineId, from, next);
  if (!first || first.kind === 'loop') return [];
  const startShuttle = isShuttleSegment(first.name);
  let seen = new Set([from]);
  let stack = [next];
  if (first.kind === 'oneway_loop') {
    seen = new Set(first.stations.slice(1));
    stack = [first.stations[0]];
  }
  const out: string[] = [];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const nb = neighbors(lineId, cur).filter((n) => {
      if (seen.has(n)) return false;
      const seg = segmentOf(lineId, cur, n)!;
      if (seg.kind !== 'line') return false;
      if (!startShuttle && isShuttleSegment(seg.name)) return false;
      return true;
    });
    if (nb.length === 0) out.push(cur);
    else stack.push(...nb);
  }
  return out;
}

/** 방향 코드: 순환 구간은 inner(데이터 순서 = 내선)/outer, 그 외는 down(데이터상 뒤쪽)/up */
export function directionCode(lineId: string, from: string, next: string): 'inner' | 'outer' | 'up' | 'down' {
  const seg = segmentOf(lineId, from, next);
  if (!seg) return 'down';
  const order = seg.stations;
  const i = order.indexOf(from);
  if (seg.kind === 'loop') return order[(i + 1) % order.length] === next ? 'inner' : 'outer';
  if (seg.kind === 'oneway_loop') return 'down';
  return order.indexOf(next) > i ? 'down' : 'up';
}
