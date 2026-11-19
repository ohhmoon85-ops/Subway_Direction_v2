/** 계산 결과(RouteResult)를 화면용 데이터로 바꾼다. 문장은 화면(클라이언트)에서 만든다. */
import { STATION_COORDS } from '@/data/station-coords';
import { getLine, getStation, stationName } from './network';
import { badgeText } from './i18n';
import { guide } from './route';
import type { Lang, Sign } from './types';

export interface StationView {
  id: string;
  name: string;
  ko: string;
  /** [위도, 경도] — 탑승 중 위치를 경로 위의 역에 맞출 때 (휴대폰에서만 씀) */
  c?: [number, number];
}

export interface LegView {
  lineId: string;
  lineName: string;
  /** 노선 배지 글자 */
  num: string;
  color: string;
  stops: number;
  stations: StationView[];
  terminals: StationView[];
  loopDir?: 'inner' | 'outer';
  oppositeStops?: number;
  serviceHint?: StationView[];
  localOnly?: boolean;
  side?: 'left' | 'right';
}

export interface GuideView {
  dest: StationView;
  place?: { name: string; exit?: string };
  sameStation: boolean;
  moveToLine?: { id: string; name: string; num: string; color: string };
  /**
   * 기둥 QR의 노선은 맞지만 이 승강장(표지)에서는 그 방향 열차를 탈 수 없음 → 반대편 승강장으로 (F7).
   * 상대식 승강장처럼 표지 한 장이 한 방향만 가리킬 때 생긴다.
   */
  oppositePlatform?: boolean;
  legs: LegView[];
  totalStops: number;
  transfers: number;
}

export function sv(id: string, lang: Lang): StationView {
  const st = getStation(id)!;
  const c = STATION_COORDS[id];
  return { id, name: stationName(st, lang), ko: st.ko, ...(c ? { c } : {}) };
}

export function buildGuide(
  sign: Sign,
  destStationId: string,
  allSigns: Sign[],
  lang: Lang,
  place?: { name: string; exit?: string },
): GuideView | null {
  const r = guide(sign, destStationId, allSigns);
  if (!r) return null;
  /**
   * 휴대폰은 이용자가 어느 쪽을 보고 있는지 모른다. 왼쪽·오른쪽은 기둥 QR로 들어왔을 때,
   * 그 기둥이 있는 승강장에서 타는 첫 구간에만 알려 준다.
   * (내 위치·노선 고르기로 들어왔거나, 환승역부터는 방면·몇 번째 역으로만 안내)
   */
  const fromPillar = sign.mappings.length > 0;
  const legs: LegView[] = r.legs.map((leg, i) => {
    const line = getLine(leg.lineId)!;
    const sideKnown = fromPillar && i === 0 && !r.moveToLineFirst && leg.signId === sign.id;
    return {
      lineId: leg.lineId,
      lineName: line.name[lang],
      num: badgeText(lang, line),
      color: line.color,
      stops: leg.stops,
      stations: leg.stations.map((id) => sv(id, lang)),
      terminals: leg.terminals.map((id) => sv(id, lang)),
      loopDir: leg.direction === 'inner' || leg.direction === 'outer' ? leg.direction : undefined,
      oppositeStops: leg.oppositeStops,
      serviceHint: leg.serviceHint?.map((id) => sv(id, lang)),
      localOnly: leg.localOnly,
      side: sideKnown ? leg.side : undefined,
    };
  });
  const move = r.moveToLineFirst ? getLine(r.moveToLineFirst)! : undefined;
  // 표지가 이 노선의 한 방향만 가리킬 때만 "반대편"이라고 말한다.
  // (두 방향을 다 가리키는데 다음 역이 둘 다 아니면 갈래가 나뉘는 역 — 반대편이라 단정하지 않고 방면만 안내)
  const signNextOnLine = legs[0] ? new Set(sign.mappings.filter((m) => m.lineId === legs[0].lineId).map((m) => m.nextStationId)) : new Set();
  const oppositePlatform = fromPillar && !r.sameStation && !r.moveToLineFirst && !!legs[0] && !legs[0].side && signNextOnLine.size === 1;
  return {
    dest: sv(destStationId, lang),
    place,
    sameStation: r.sameStation,
    moveToLine: move ? { id: move.id, name: move.name[lang], num: badgeText(lang, move), color: move.color } : undefined,
    oppositePlatform: oppositePlatform || undefined,
    legs,
    totalStops: r.totalStops,
    transfers: r.transfers,
  };
}
