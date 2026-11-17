/**
 * 목적지 입력 → 후보 (기획서 F3·F4).
 * 다국어 역명 사전(표기·통용 호칭·음차·축약) + 직접 정리한 장소 데이터에서 찾는다.
 * 정확 일치 > 앞부분 일치 > 포함 > 오타 허용 순으로 점수를 매긴다.
 */
import { RAW_PLACES } from '@/data/places';
import { REGION_NAMES, type Region } from '@/data/network-data';
import { getNetwork, getStation, stationByKo, stationIdFromKey, stationName } from './network';
import type { AliasEntry, Lang, Place } from './types';

export interface Candidate {
  kind: 'station' | 'place' | 'address';
  /** station: 역 ID / place: 장소 ID / address: 'addr:' + 역 ID */
  id: string;
  stationId: string;
  label: string;
  sub: string;
  /** 역의 한국어 이름 (외국어 화면에서 이름 아래에 작게) */
  stationKo: string;
  exit?: string;
  lines: string[];
  /** 권역 (수도권 · 부산권 · 대구권 · 광주 · 대전) */
  region: string;
  score: number;
}

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(station|stn|estación de|estacion de|gare de|駅|站|역)$/g, '')
    .replace(/^(estación de|estacion de|gare de|station)\s*/g, '')
    .replace(/[\s\-–_.,'’·・()（）]/g, '')
    .replace(/university/g, 'univ')
    .trim();
}

interface Entry {
  key: string;
  kind: 'station' | 'place';
  id: string;
}

let baseIndex: Entry[] | null = null;
let places: Map<string, Place> | null = null;

export function getPlaces(): Map<string, Place> {
  if (places) return places;
  places = new Map();
  for (const [id, ko, exit, name, aliases, region] of RAW_PLACES) {
    const st = stationByKo(ko, region ?? '수도권')!;
    places.set(id, { id, name, aliases: aliases ?? [], stationId: st.id, exit });
  }
  return places;
}

function buildBase(): Entry[] {
  if (baseIndex) return baseIndex;
  const out: Entry[] = [];
  for (const st of getNetwork().stations.values()) {
    for (const n of [st.ko, st.nameKo, st.en, st.ja, st.zh, st.hanja, ...st.aliases]) {
      if (n) out.push({ key: normalize(n), kind: 'station', id: st.id });
    }
  }
  for (const p of getPlaces().values()) {
    for (const n of [...Object.values(p.name), ...p.aliases]) {
      if (n) out.push({ key: normalize(n), kind: 'place', id: p.id });
    }
  }
  baseIndex = out;
  return out;
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function score(q: string, key: string): number {
  if (!key) return 0;
  if (key === q) return 100;
  if (key.startsWith(q)) return 80 - Math.min(20, key.length - q.length);
  if (q.length >= 2 && key.includes(q)) return 55;
  // 라틴 문자 오타 허용 (예: gyeongbokgun, myungdong)
  if (/^[a-z0-9]+$/.test(q) && q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    const d = levenshtein(q, key.slice(0, Math.max(q.length, key.length)), max);
    if (d <= max) return 40 - d * 5;
    const dp = levenshtein(q, key.slice(0, q.length), max);
    if (dp <= max) return 30 - dp * 5;
  }
  return 0;
}

/** 다른 권역의 역이면 "부산 · Seomyeon"처럼 권역을 앞에 붙인다 */
function regionTag(region: string, lang: Lang, preferRegion?: string): string {
  if (region === (preferRegion ?? '수도권')) return '';
  const r = REGION_NAMES[region as Region];
  return r ? `${r[lang]} · ` : '';
}

/**
 * 역·장소 검색. preferRegion(출발역의 권역)이 있으면 같은 권역을 먼저 보여 준다(기획서 7장: 같은 이름 다른 도시).
 * 같은 점수끼리는 출발 권역이 앞, 그다음 수도권이 앞.
 */
export function search(query: string, lang: Lang, extra: AliasEntry[] = [], limit = 8, preferRegion?: string): Candidate[] {
  const q = normalize(query);
  if (!q) return [];
  const index = buildBase().concat(extra.map((a) => ({ key: normalize(a.text), kind: 'station' as const, id: a.stationId })));
  const best = new Map<string, { kind: 'station' | 'place'; id: string; score: number }>();
  for (const e of index) {
    const sc = score(q, e.key);
    if (sc <= 0) continue;
    const k = `${e.kind}:${e.id}`;
    const cur = best.get(k);
    if (!cur || sc > cur.score) best.set(k, { kind: e.kind, id: e.id, score: sc });
  }
  const out: Candidate[] = [];
  for (const b of best.values()) {
    if (b.kind === 'station') {
      const st = getStation(b.id);
      if (!st) continue;
      out.push({
        kind: 'station',
        id: st.id,
        stationId: st.id,
        label: stationName(st, lang),
        // 한국어 화면은 한국어만, 외국어 화면은 이름(영어) 아래에 한글 역명
        sub: regionTag(st.region, lang, preferRegion) + (lang === 'ko' ? '' : st.ko),
        stationKo: st.ko,
        lines: st.lines,
        region: st.region,
        score: b.score + 1 + (preferRegion && st.region === preferRegion ? 5 : 0), // 같은 점수면 역을, 출발 권역을 먼저
      });
    } else {
      const p = getPlaces().get(b.id)!;
      const st = getStation(p.stationId)!;
      out.push({
        kind: 'place',
        id: p.id,
        stationId: st.id,
        label: placeLabel(p, lang),
        sub: stationName(st, lang) + (lang === 'ko' ? '' : ` · ${st.ko}`),
        stationKo: st.ko,
        exit: p.exit,
        lines: st.lines,
        region: st.region,
        score: b.score + (preferRegion && st.region === preferRegion ? 5 : 0),
      });
    }
  }
  const regionRank = (c: Candidate) => (c.region === (preferRegion ?? '수도권') ? 0 : c.region === '수도권' ? 1 : 2);
  out.sort((a, b) => b.score - a.score || regionRank(a) - regionRank(b) || a.label.localeCompare(b.label));
  return out.slice(0, limit);
}

/**
 * 자주 찾는 곳 (S1). 출발역 권역 것만 화면에 보여 준다 (기획서 10장 고칠 점 5).
 * 장소는 places.ts 의 ID, 역은 stations.json 의 역 키.
 */
export const POPULAR: Record<Region, { places: string[]; stations: string[] }> = {
  수도권: { places: ['myeongdong-street', 'gyeongbokgung-palace', 'hongdae', 'ddp', 'n-seoul-tower', 'coex'], stations: ['수도권:서울역', '수도권:강남'] },
  부산권: { places: ['haeundae-beach', 'gwangalli-beach', 'jagalchi-market', 'gamcheon-village', 'seomyeon'], stations: ['부산권:부산역'] },
  대구권: { places: ['dongseongno', 'seomun-market', 'suseong-lake'], stations: ['대구권:동대구', '대구권:반월당'] },
  광주: { places: ['acc-gwangju', 'yangdong-market'], stations: ['광주:광주송정', '광주:상무'] },
  대전: { places: ['sungsimdang', 'yuseong-spa'], stations: ['대전:대전', '대전:정부청사'] },
};

/** 장소 이름: 그 언어 → (번체는 간체) → 영어 → 한국어 */
export function placeLabel(p: Place, lang: Lang): string {
  return p.name[lang] ?? (lang === 'zh-TW' ? p.name.zh : undefined) ?? p.name.en ?? p.name.ko;
}

/** 모든 권역의 자주 찾는 곳. region 을 주면 그 권역만. */
export function popular(lang: Lang, region?: string): Candidate[] {
  const pl = getPlaces();
  const out: Candidate[] = [];
  for (const [r, list] of Object.entries(POPULAR)) {
    if (region && r !== region) continue;
    for (const id of list.places) {
      const p = pl.get(id)!;
      const st = getStation(p.stationId)!;
      out.push({ kind: 'place', id, stationId: st.id, label: placeLabel(p, lang), sub: stationName(st, lang) + (lang === 'ko' ? '' : ` · ${st.ko}`), stationKo: st.ko, exit: p.exit, lines: st.lines, region: st.region, score: 0 });
    }
    for (const key of list.stations) {
      const st = getStation(stationIdFromKey(key)!)!;
      out.push({ kind: 'station', id: st.id, stationId: st.id, label: stationName(st, lang), sub: lang === 'ko' ? '' : st.ko, stationKo: st.ko, lines: st.lines, region: st.region, score: 0 });
    }
  }
  return out;
}
