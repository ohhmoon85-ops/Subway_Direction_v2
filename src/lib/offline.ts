/**
 * 오프라인 안내 (기획서 F10: 한 번 연 노선 데이터를 휴대폰에 저장).
 *
 * 서버의 /api/guide · /api/search 와 같은 계산 코드(route.ts · search.ts)를 휴대폰에서 그대로 돌린다.
 * 화면은 이 파일을 동적 import 로만 불러오므로 노선 데이터는 별도 파일로 나뉘고,
 * 처음 화면을 연 뒤 잠시 후 미리 받아 두면 서비스 워커(public/sw.js)가 저장해 지하에서 망이 끊겨도 계산된다.
 *
 * 오프라인에서 못 하는 것: 표지 서명 확인(서버 비밀키 — 화면을 열 때 이미 확인됨),
 * 환승역 표지의 좌·우(표지 목록은 서버에), 주소 검색(카카오), 관리자가 추가한 역명 별칭.
 */
import { buildGuide, type GuideView } from './guide-view';
import { differentRegion } from './route';
import { getPlaces, placeLabel, search, type Candidate } from './search';
import { getStation, normalizeStationId } from './network';
import type { Lang, Sign, SignMapping } from './types';

export type OfflineGuideResult = { ok: true; view: GuideView } | { ok: false; error: 'other_region' | 'no_route' | 'unknown_dest' };

export function offlineGuide(
  from: { stationId: string; signId?: string; mappings?: SignMapping[] },
  dest: Pick<Candidate, 'kind' | 'id'> & { label?: string },
  lang: Lang,
): OfflineGuideResult {
  const sign: Sign = {
    id: from.signId ?? 'LOCATION',
    stationId: normalizeStationId(from.stationId),
    spot: { ko: '' },
    mode: 'platform',
    mappings: from.mappings ?? [],
    status: 'active',
    keyVersion: 0,
    createdBy: 'offline',
    createdAt: '',
    updatedAt: '',
    version: 0,
  };
  let stationId: string | undefined;
  let place: { name: string; exit?: string } | undefined;
  if (dest.kind === 'place') {
    const p = getPlaces().get(dest.id);
    if (p) {
      stationId = p.stationId;
      place = { name: placeLabel(p, lang), exit: p.exit };
    }
  } else if (dest.kind === 'address') {
    stationId = dest.id.replace(/^addr:/, '');
    place = { name: String(dest.label ?? '').slice(0, 80) };
  } else stationId = dest.id;
  if (stationId) stationId = normalizeStationId(stationId);
  if (!stationId || !getStation(stationId) || !getStation(sign.stationId)) return { ok: false, error: 'unknown_dest' };
  if (differentRegion(sign.stationId, stationId)) return { ok: false, error: 'other_region' };
  const view = buildGuide(sign, stationId, [sign], lang, place);
  return view ? { ok: true, view } : { ok: false, error: 'no_route' };
}

export function offlineSearch(q: string, lang: Lang, region?: string, onlyStation = false): Candidate[] {
  const r = search(q.slice(0, 80), lang, [], onlyStation ? 20 : 8, region);
  return onlyStation ? r.filter((c) => c.kind === 'station').slice(0, 8) : r;
}
