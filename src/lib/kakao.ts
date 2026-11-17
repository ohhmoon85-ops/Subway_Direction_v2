/**
 * 장소·주소 → 가까운 역 (카카오 로컬 API).
 * 이용 정책상 결과를 저장하지 않고, 요청 때마다 실시간으로만 조회한다.
 * KAKAO_REST_API_KEY 가 없으면 이 기능은 꺼진다.
 */
import { STATION_COORDS } from '@/data/station-coords';
import { distanceM } from './location';
import { stationsByKo, stationName } from './network';
import type { Candidate } from './search';
import type { Lang } from './types';

const API = 'https://dapi.kakao.com/v2/local';

async function kakao(path: string, params: Record<string, string>): Promise<any | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * "시청역 1호선" → 시청역. 같은 이름이 여러 도시에 있으면(서울·부산·대전 시청) 카카오가 준 좌표에서 가장 가까운 역.
 */
function stationFromKakaoName(name: string, lat: number, lng: number) {
  const base = name.replace(/\s.*$/, '');
  const list = stationsByKo(base).length ? stationsByKo(base) : stationsByKo(base.replace(/역$/, ''));
  if (list.length <= 1 || !Number.isFinite(lat) || !Number.isFinite(lng)) return list[0];
  return [...list].sort((a, b) => distanceM([lat, lng], STATION_COORDS[a.id]) - distanceM([lat, lng], STATION_COORDS[b.id]))[0];
}

export async function addressCandidates(query: string, lang: Lang): Promise<Candidate[]> {
  if (!process.env.KAKAO_REST_API_KEY || query.trim().length < 2) return [];
  let doc: { x: string; y: string; label: string } | null = null;
  const kw = await kakao('/search/keyword.json', { query, size: '1' });
  if (kw?.documents?.length) {
    const d = kw.documents[0];
    doc = { x: d.x, y: d.y, label: d.place_name };
  } else {
    const ad = await kakao('/search/address.json', { query, size: '1' });
    if (ad?.documents?.length) {
      const d = ad.documents[0];
      doc = { x: d.x, y: d.y, label: d.address_name };
    }
  }
  if (!doc) return [];
  const near = await kakao('/search/category.json', {
    category_group_code: 'SW8',
    x: doc.x,
    y: doc.y,
    radius: '3000',
    sort: 'distance',
    size: '15',
  });
  for (const d of near?.documents ?? []) {
    const st = stationFromKakaoName(d.place_name, Number(d.y), Number(d.x));
    if (st) {
      return [
        {
          kind: 'address',
          id: `addr:${st.id}`,
          stationId: st.id,
          label: doc.label,
          sub: `${stationName(st, lang)}${lang === 'ko' ? '' : ` (${st.ko})`} · ${Math.round(Number(d.distance))}m`,
          stationKo: st.ko,
          lines: st.lines,
          region: st.region,
          score: 1,
        },
      ];
    }
  }
  return [];
}
