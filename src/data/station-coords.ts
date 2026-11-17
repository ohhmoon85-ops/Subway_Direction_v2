/**
 * 역 좌표 [위도, 경도] — 내 위치(GPS)로 가장 가까운 역을 찾는 데 쓴다.
 * stations.json(국가철도공단 도시광역철도 역사정보)에서 만든다. 키는 역 ID (network-data.ts 의 규칙).
 */
import { RAW_STATIONS } from './network-data';

export const COORDS_SOURCE = '국가철도공단 도시광역철도 역사정보 (2026-06-30)';

export const STATION_COORDS: Record<string, [number, number]> = Object.fromEntries(
  RAW_STATIONS.map((s) => [s.id, [s.lat, s.lng] as [number, number]]),
);
