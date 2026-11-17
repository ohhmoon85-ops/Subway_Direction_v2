import { NextResponse } from 'next/server';
import { buildGuide } from '@/lib/guide-view';
import { isLang } from '@/lib/i18n';
import { getStation, normalizeStationId } from '@/lib/network';
import { verifySignId } from '@/lib/qr-sign';
import { differentRegion } from '@/lib/route';
import { getPlaces, placeLabel } from '@/lib/search';
import { getStore } from '@/lib/store';
import type { Sign } from '@/lib/types';

/**
 * 휴대폰은 출발 위치(QR 표지 ID+서명, 또는 내 위치로 고른 역)와 목적지만 보내고,
 * 서버가 방향·정거장 수를 계산한다.
 *  - QR 표지: 표지 기준 왼쪽·오른쪽까지 안내
 *  - 역만 아는 경우(내 위치): "○○ 방면 열차, 다음 역 △△" 로 안내 (그 역에 등록된 표지가 있으면 표지 기준 좌·우도)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { signId, sig, v, originStationId, dest, lang: rawLang, hearing } = body as {
    signId?: string;
    sig?: string;
    v?: number;
    originStationId?: string;
    dest: { kind: 'station' | 'place' | 'address'; id: string; label?: string };
    lang: string;
    hearing?: boolean;
  };
  const lang = isLang(rawLang) ? rawLang : 'ko';
  const store = getStore();

  let sign: Sign;
  if (signId) {
    const found = await store.getSign(String(signId));
    if (!found || !verifySignId(found.id, sig, Number(v) || found.keyVersion)) {
      return NextResponse.json({ error: 'invalid_sign' }, { status: 403 });
    }
    if (found.status !== 'active') return NextResponse.json({ error: 'inactive' }, { status: 409 });
    sign = found;
  } else {
    const st = getStation(normalizeStationId(String(originStationId ?? '')));
    if (!st) return NextResponse.json({ error: 'unknown_origin' }, { status: 404 });
    // 표지 없이 역만 아는 경우: 매핑 없는 가상 표지
    sign = {
      id: 'LOCATION',
      stationId: st.id,
      spot: { ko: '' },
      mode: 'platform',
      mappings: [],
      status: 'active',
      keyVersion: 0,
      createdBy: 'location',
      createdAt: '',
      updatedAt: '',
      version: 0,
    };
  }

  let stationId: string | undefined;
  let place: { name: string; exit?: string } | undefined;
  if (dest?.kind === 'place') {
    const p = getPlaces().get(dest.id);
    if (p) {
      stationId = p.stationId;
      place = { name: placeLabel(p, lang), exit: p.exit };
    }
  } else if (dest?.kind === 'address') {
    stationId = dest.id.replace(/^addr:/, '');
    place = { name: String(dest.label ?? '').slice(0, 80) };
  } else stationId = dest?.id;
  if (stationId) stationId = normalizeStationId(stationId);
  if (!stationId || !getStation(stationId)) return NextResponse.json({ error: 'unknown_dest' }, { status: 404 });
  // 다른 도시의 역: 도시철도끼리 이어지지 않는다 (철도·KTX 안내는 범위 밖)
  if (differentRegion(sign.stationId, stationId)) return NextResponse.json({ error: 'other_region' }, { status: 409 });

  const view = buildGuide(sign, stationId, await store.listSigns(), lang, place);
  if (!view) return NextResponse.json({ error: 'no_route' }, { status: 404 });

  store
    .logEvent({ type: 'guide', signId: signId ? sign.id : 'LOCATION', lang, dest: stationId, hearing: !!hearing, at: new Date().toISOString() })
    .catch(() => {});
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
}
