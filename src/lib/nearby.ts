/**
 * 역 좌표 → 휴대폰으로 내려보낼 역 목록·노선 목록.
 * 가까운 역 계산은 휴대폰에서 한다(기획서 8·10장: 위치를 서버로 보내지 않음). 여기 함수는 시험·데이터 준비용.
 */
import { REGION_NAMES, REGIONS } from '@/data/network-data';
import { STATION_COORDS } from '@/data/station-coords';
import { distanceM, type StationPoint } from './location';
import { getNetwork, stationName } from './network';
import { LANGS, type Lang } from './types';

export { distanceM };

export function nearestStations(lat: number, lng: number, n = 3): { stationId: string; distance: number }[] {
  return Object.entries(STATION_COORDS)
    .map(([stationId, c]) => ({ stationId, distance: Math.round(distanceM([lat, lng], c)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

export function stationCoord(stationId: string): [number, number] | undefined {
  return STATION_COORDS[stationId];
}

/** 좌표가 있는 모든 역 (휴대폰에서 가까운 역 찾기용) */
export function stationPoints(): StationPoint[] {
  const out: StationPoint[] = [];
  for (const st of getNetwork().stations.values()) {
    const c = STATION_COORDS[st.id];
    if (!c) continue;
    const names = Object.fromEntries(LANGS.map((l) => [l, stationName(st, l)])) as Record<Lang, string>;
    out.push({ id: st.id, ko: st.ko, names, lines: st.lines, region: st.region, c });
  }
  return out;
}

/** 노선 배지(글자·색) — 화면에서 역의 노선을 보여 줄 때 */
export interface LineBadgeInfo {
  num: string;
  abbr: string;
  color: string;
  name: Record<Lang, string>;
}

export function lineBadges(): Record<string, LineBadgeInfo> {
  return Object.fromEntries([...getNetwork().lines.values()].map((l) => [l.id, { num: l.num, abbr: l.abbr, color: l.color, name: l.name }]));
}

export interface LinePick {
  id: string;
  num: string;
  abbr: string;
  color: string;
  name: Record<Lang, string>;
  /** 노선도 순서의 역 ID (갈래·지선은 본선 뒤에) */
  stations: string[];
}

export interface CityPick {
  /** 권역: 수도권 · 부산권 · 대구권 · 광주 · 대전 */
  id: string;
  name: Record<Lang, string>;
  lines: LinePick[];
}

/** 권역 → 노선 → 역 고르기용 목록 (기획서 5장). 노선은 lines.json 순서. */
export function cityPicks(): CityPick[] {
  const lines = [...getNetwork().lines.values()];
  return REGIONS.map((region) => ({
    id: region,
    name: REGION_NAMES[region],
    lines: lines
      .filter((l) => l.region === region)
      .map((l) => {
        const stations: string[] = [];
        for (const seg of l.segments) for (const id of seg) if (!stations.includes(id)) stations.push(id);
        return { id: l.id, num: l.num, abbr: l.abbr, color: l.color, name: l.name, stations };
      }),
  })).filter((c) => c.lines.length > 0);
}
