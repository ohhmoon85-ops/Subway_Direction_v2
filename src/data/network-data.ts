/**
 * 전국 도시철도 노선·역 데이터 — stations.json · lines.json 에서 만든다.
 * (국가철도공단 도시광역철도 역사정보·노선정보, 기준 2026-06-30. 만드는 법은 scripts/README.md)
 *
 * 역 ID 규칙 (이미 쓰고 있는 ID가 깨지지 않게):
 *  - 수도권 1~4호선 역: 시제품 때 ID 그대로 (legacy-stations.ts, 예: "city-hall")
 *  - 그 밖의 수도권 역: 영어 역명 slug (예: "gwanghwamun")
 *  - 다른 권역: 권역 접두어 + slug (예: "busan-city-hall", "daejeon-city-hall")
 *  - 같은 권역의 동명이역: 노선 접미어 (예: "sinchon-gyeongui-jungang-line")
 *  JSON의 역 키("수도권:시청")와는 stationIdFromKey / stationKeyFromId 로 바꾼다 (lib/network.ts).
 *
 * 노선 ID 규칙: 수도권 1~9호선은 "1"~"9"(시제품과 같음), 나머지는 JSON 노선 ID("BUSAN-1" 등).
 *  시제품의 갈래 노선 ID(1G·2S·2J)는 LEGACY_LINE_IDS 로 본선 ID로 바꾼다.
 */
import type { Lang } from '@/lib/types';
import linesJson from './lines.json';
import stationsJson from './stations.json';
import { LEGACY_RENAMED, LEGACY_STATIONS } from './legacy-stations';

export type SegmentKind = 'line' | 'loop' | 'oneway_loop';

interface JsonStation {
  id: string;
  name_ko: string;
  name_en: string;
  name_hanja?: string;
  display_ko?: string;
  disambiguation?: string;
  lat: number;
  lng: number;
  region: string;
  lines: string[];
  operators: string[];
}

interface JsonLine {
  id: string;
  name_ko: string;
  name_en: string;
  color: string;
  region: string;
  operator: string;
  note?: string;
  segments: { name: string; kind: SegmentKind; stations: string[] }[];
}

export interface RawStation {
  /** 앱 안에서 쓰는 역 ID (URL·QR 표지·DB에 저장됨) */
  id: string;
  /** stations.json 의 역 키 ("수도권:시청") */
  key: string;
  /** 화면에 보일 한국어 이름 (display_ko 가 있으면 그것) */
  ko: string;
  /** 원래 역명 (동명이역도 괄호 없이) */
  nameKo: string;
  en: string;
  ja?: string;
  zh?: string;
  hanja?: string;
  /** 검색 별칭 */
  aliases: string[];
  region: Region;
  lat: number;
  lng: number;
}

export interface RawSegment {
  name: string;
  kind: SegmentKind;
  /** 역 ID 순서 */
  stations: string[];
}

export interface RawLine {
  id: string;
  /** lines.json 의 노선 ID */
  key: string;
  /** 노선 배지에 쓰는 짧은 표시 ("2", "수인분당") */
  num: string;
  /** 외국어 화면의 배지 글자 (라틴 문자, "2", "SB") */
  abbr: string;
  name: Record<Lang, string>;
  color: string;
  region: Region;
  /** 순환 구간(kind: loop)이 있는가 */
  loop: boolean;
  /** 구간별 역 ID 순서 (갈래·지선·순환 구간이 따로) */
  segments: string[][];
  segs: RawSegment[];
}

// ── 권역 ────────────────────────────────────────────

export const REGIONS = ['수도권', '부산권', '대구권', '광주', '대전'] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_NAMES: Record<Region, Record<Lang, string>> = {
  수도권: { ko: '서울·수도권', en: 'Seoul Metropolitan Area', ja: 'ソウル・首都圏', zh: '首尔·首都圈', 'zh-TW': '首爾·首都圈', es: 'Área de Seúl', fr: 'Région de Séoul' },
  부산권: { ko: '부산', en: 'Busan', ja: '釜山', zh: '釜山', 'zh-TW': '釜山', es: 'Busan', fr: 'Busan' },
  대구권: { ko: '대구', en: 'Daegu', ja: '大邱', zh: '大邱', 'zh-TW': '大邱', es: 'Daegu', fr: 'Daegu' },
  광주: { ko: '광주', en: 'Gwangju', ja: '光州', zh: '光州', 'zh-TW': '光州', es: 'Gwangju', fr: 'Gwangju' },
  대전: { ko: '대전', en: 'Daejeon', ja: '大田', zh: '大田', 'zh-TW': '大田', es: 'Daejeon', fr: 'Daejeon' },
};

const REGION_PREFIX: Record<Region, string> = { 수도권: '', 부산권: 'busan', 대구권: 'daegu', 광주: 'gwangju', 대전: 'daejeon' };

function asRegion(r: string): Region {
  if (!(REGIONS as readonly string[]).includes(r)) throw new Error(`unknown region ${r}`);
  return r as Region;
}

export function slugify(en: string): string {
  return en
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── 노선 ────────────────────────────────────────────

/** 시제품의 노선 ID → 지금 노선 ID (갈래를 본선에 합쳤다) */
export const LEGACY_LINE_IDS: Record<string, string> = { '1G': '1', '2S': '2', '2J': '2' };

/** 숫자 노선이 아닌 노선의 배지 글자 */
const BADGE: Record<string, string> = {
  'SUIN-BUNDANG': '수인분당',
  SINBUNDANG: '신분당',
  'GYEONGUI-JUNGANG': '경의중앙',
  GYEONGCHUN: '경춘',
  GYEONGGANG: '경강',
  SEOHAE: '서해',
  AREX: '공항',
  'UI-SINSEOL': '우이신설',
  SILLIM: '신림',
  'GIMPO-GOLD': '김포',
  UIJEONGBU: '의정부',
  EVERLINE: '용인',
  'INCHEON-MAGLEV': '자기부상',
  'BUSAN-GIMHAE': '김해',
  DONGHAE: '동해',
  DAEGYEONG: '대경',
};

/** 외국어 화면 노선 배지 (한글 배지 대신 짧은 라틴 문자) */
const BADGE_ABBR: Record<string, string> = {
  'SUIN-BUNDANG': 'SB',
  SINBUNDANG: 'SBD',
  'GYEONGUI-JUNGANG': 'GJ',
  GYEONGCHUN: 'GC',
  GYEONGGANG: 'GG',
  SEOHAE: 'WS',
  AREX: 'A',
  'UI-SINSEOL': 'UI',
  SILLIM: 'SL',
  'GIMPO-GOLD': 'GP',
  UIJEONGBU: 'U',
  EVERLINE: 'E',
  'INCHEON-MAGLEV': 'MG',
  'BUSAN-GIMHAE': 'BG',
  DONGHAE: 'DH',
  DAEGYEONG: 'DG',
};

const CITY: Record<string, { ja: string; zh: string; en: string }> = {
  인천: { ja: '仁川', zh: '仁川', en: 'Incheon' },
  부산: { ja: '釜山', zh: '釜山', en: 'Busan' },
  대구: { ja: '大邱', zh: '大邱', en: 'Daegu' },
  광주: { ja: '光州', zh: '光州', en: 'Gwangju' },
  대전: { ja: '大田', zh: '大田', en: 'Daejeon' },
};

function lineMeta(l: JsonLine): { id: string; num: string; abbr: string; name: Record<Lang, string> } {
  const m = l.name_ko.match(/^(?:(\S+)\s)?(\d)호선$/);
  if (m && !m[1] && l.region === '수도권') {
    const n = m[2];
    return { id: n, num: n, abbr: n, name: { ko: `${n}호선`, en: `Line ${n}`, ja: `${n}号線`, zh: `${n}号线`, 'zh-TW': `${n}號線`, es: `Línea ${n}`, fr: `Ligne ${n}` } };
  }
  if (m && m[1] && CITY[m[1]]) {
    const n = m[2];
    const c = CITY[m[1]];
    const num = m[1] === '인천' ? `인천${n}` : n;
    return {
      id: l.id,
      num,
      abbr: m[1] === '인천' ? `I${n}` : n,
      name: { ko: l.name_ko, en: l.name_en, ja: `${c.ja}${n}号線`, zh: `${c.zh}${n}号线`, 'zh-TW': `${c.zh}${n}號線`, es: `Línea ${n} de ${c.en}`, fr: `Ligne ${n} de ${c.en}` },
    };
  }
  return { id: l.id, num: BADGE[l.id] ?? l.name_ko.slice(0, 2), abbr: BADGE_ABBR[l.id] ?? l.name_en.replace(/[^A-Z0-9]/g, '').slice(0, 3), name: { ko: l.name_ko, en: l.name_en, ja: l.name_en, zh: l.name_en, 'zh-TW': l.name_en, es: l.name_en, fr: l.name_en } };
}

const JSON_LINES = linesJson as JsonLine[];
const JSON_STATIONS = stationsJson as JsonStation[];
const LINE_BY_NAME_KO = new Map(JSON_LINES.map((l) => [l.name_ko, l]));

// ── 역 ID 만들기 ─────────────────────────────────────

const legacyByKo = new Map(LEGACY_STATIONS.map((r) => [r[0], r]));
const LEGACY_LINES = new Set(['SEOUL-1', 'SEOUL-2', 'SEOUL-3', 'SEOUL-4']);

function legacyFor(s: JsonStation) {
  if (s.region !== '수도권' || !s.lines.some((l) => LEGACY_LINES.has(l))) return undefined;
  return legacyByKo.get(LEGACY_RENAMED[s.name_ko] ?? s.name_ko);
}

/** display_ko "신촌(경의중앙선)" → 괄호 안 노선 */
function disambiguationLine(s: JsonStation): JsonLine | undefined {
  const m = s.display_ko?.match(/\(([^)]+)\)\s*$/);
  return m ? LINE_BY_NAME_KO.get(m[1]) : undefined;
}

function buildStations(): RawStation[] {
  const used = new Set<string>();
  const out: RawStation[] = [];
  // 시제품 ID를 먼저 확보해서, 새 역이 같은 ID를 가져가지 않게 한다
  const order = [...JSON_STATIONS].sort((a, b) => Number(!legacyFor(a)) - Number(!legacyFor(b)));
  for (const s of order) {
    const region = asRegion(s.region);
    const legacy = legacyFor(s);
    const dLine = disambiguationLine(s);
    let id: string;
    if (legacy) id = legacy[1];
    else {
      let base = slugify(s.name_en) || slugify(s.id);
      if (s.display_ko && dLine) base = `${base}-${slugify(dLine.name_en)}`;
      const prefix = REGION_PREFIX[region];
      id = prefix && !base.startsWith(`${prefix}-`) ? `${prefix}-${base}` : base;
      if (used.has(id) && dLine) id = `${id}-${slugify(dLine.name_en)}`;
      for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    }
    if (used.has(id)) throw new Error(`duplicate station id ${id}`);
    used.add(id);
    // 동명이역은 영어 화면에서도 구분되게 "Sinchon (Line 2)"
    const en = s.display_ko && dLine ? `${s.name_en} (${lineMeta(dLine).name.en})` : s.name_en;
    const aliases = new Set<string>(legacy?.[5] ?? []);
    if (legacy && legacy[2] !== en) aliases.add(legacy[2]); // 시제품 때 영어 표기도 검색되게
    if (s.display_ko) aliases.add(s.name_ko);
    if (LEGACY_RENAMED[s.name_ko]) aliases.add(LEGACY_RENAMED[s.name_ko]);
    out.push({
      id,
      key: s.id,
      ko: s.display_ko ?? s.name_ko,
      nameKo: s.name_ko,
      en,
      ja: legacy?.[3],
      zh: legacy?.[4],
      hanja: s.name_hanja || undefined,
      aliases: [...aliases],
      region,
      lat: s.lat,
      lng: s.lng,
    });
  }
  // 원래 파일 순서로 되돌린다 (결정적인 순서)
  const pos = new Map(JSON_STATIONS.map((s, i) => [s.id, i]));
  return out.sort((a, b) => pos.get(a.key)! - pos.get(b.key)!);
}

export const RAW_STATIONS: RawStation[] = buildStations();

const idByKey = new Map(RAW_STATIONS.map((s) => [s.key, s.id]));

export const RAW_LINES: RawLine[] = JSON_LINES.map((l) => {
  const meta = lineMeta(l);
  const segs: RawSegment[] = l.segments.map((g) => ({
    name: g.name,
    kind: g.kind,
    stations: g.stations.map((k) => {
      const id = idByKey.get(k);
      if (!id) throw new Error(`line ${l.id}: unknown station ${k}`);
      return id;
    }),
  }));
  return {
    id: meta.id,
    key: l.id,
    num: meta.num,
    abbr: meta.abbr,
    name: meta.name,
    color: l.color,
    region: asRegion(l.region),
    loop: segs.some((g) => g.kind === 'loop'),
    segments: segs.map((g) => g.stations),
    segs,
  };
});

/**
 * 이름이 달라 데이터에서 다른 역으로 잡혔지만 실제로는 환승이 되는 역 (JSON 역 키 쌍).
 * 경로 계산에서 두 역 사이를 환승 1회로 잇는다. 각 노선 화면에서는 그 노선의 역명을 그대로 쓴다.
 * 좌표가 450m 안이고 노선을 공유하지 않는 역 쌍을 모두 살펴, 공식 환승역만 넣었다.
 */
export const TRANSFER_LINKS: [string, string][] = [
  ['수도권:총신대입구', '수도권:이수'], // 4호선 총신대입구(이수) ↔ 7호선 이수
];

// ── 1호선 운행 계통 ───────────────────────────────────

const s = (str: string) => str.split(' ');
const LINE1_TRUNK =
  '연천 전곡 청산 소요산 동두천 보산 동두천중앙 지행 덕정 덕계 양주 녹양 가능 의정부 회룡 망월사 도봉산 도봉 방학 창동 녹천 월계 광운대 석계 신이문 외대앞 회기 청량리 제기동 신설동 동묘앞 동대문 종로5가 종로3가 종각 시청 서울역 남영 용산 노량진 대방 신길 영등포 신도림 구로';
const LINE1_GYEONGIN = '구로 구일 개봉 오류동 온수 역곡 소사 부천 중동 송내 부개 부평 백운 동암 간석 주안 도화 제물포 도원 동인천 인천';
const LINE1_GYEONGBU =
  '구로 가산디지털단지 독산 금천구청 석수 관악 안양 명학 금정 군포 당정 의왕 성균관대 화서 수원 세류 병점 세마 오산대 오산 진위 송탄 서정리 평택지제 평택 성환 직산 두정 천안 봉명 쌍용 아산 탕정 배방 온양온천 신창';

/**
 * 1호선 운행 계통(행선지) — 갈래 노선에서 "○○행만 타세요" 안내에 쓴다. 공사 운행표로 검수 필요.
 * (수도권 역 이름. lib/services.ts 가 역 ID로 바꾼다.)
 */
export const LINE1_SERVICES = {
  trunk: s(LINE1_TRUNK),
  /** 북쪽 행선지 (북쪽 끝으로 갈수록 뒤). 연천행은 동두천 출발 셔틀이 많다. */
  northTerminals: ['광운대', '의정부', '양주', '동두천', '소요산', '연천'],
  /** 남쪽 행선지와 그 계통이 지나는 구로 남쪽 역들 */
  southPatterns: [
    { terminal: '인천', stations: s(LINE1_GYEONGIN).slice(1) },
    { terminal: '병점', stations: s(LINE1_GYEONGBU).slice(1, s(LINE1_GYEONGBU).indexOf('병점') + 1) },
    { terminal: '서동탄', stations: [...s(LINE1_GYEONGBU).slice(1, s(LINE1_GYEONGBU).indexOf('병점') + 1), '서동탄'] },
    { terminal: '천안', stations: s(LINE1_GYEONGBU).slice(1, s(LINE1_GYEONGBU).indexOf('천안') + 1) },
    { terminal: '신창', stations: s(LINE1_GYEONGBU).slice(1) },
  ],
  /**
   * 급행이 서는 역(보수적으로 잡은 주요 역). 이 목록에 없는 역이 목적지이고 경로가 코레일 구간이면
   * "일반 열차를 타세요"를 띄운다. 일반 열차는 모든 역에 서므로 안내가 틀릴 위험이 없다.
   */
  expressStops: s(
    '서울역 용산 노량진 영등포 신도림 구로 역곡 부천 송내 부평 동암 주안 동인천 가산디지털단지 금천구청 안양 금정 군포 의왕 성균관대 수원 병점 오산 평택 천안 청량리 회기 광운대 창동 도봉산 의정부 양주 동두천 소요산',
  ),
  /** 급행이 다니는 코레일 구간이 아닌 곳(서울교통공사 지하 구간) */
  metroSection: s('청량리 제기동 신설동 동묘앞 동대문 종로5가 종로3가 종각 시청 서울역'),
};
