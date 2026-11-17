/** F10 오프라인: 휴대폰에서 계산한 결과가 서버 계산과 같아야 한다 (방향이 뒤집히면 안 됨). */
import { describe, expect, it } from 'vitest';
import { SEED_SIGNS } from '@/data/seed-signs';
import { buildGuide } from '@/lib/guide-view';
import { stationByKo } from '@/lib/network';
import { offlineGuide, offlineSearch } from '@/lib/offline';

describe('오프라인 계산', () => {
  it('기둥 QR: 서버(buildGuide)와 같은 좌·우·정거장 수', () => {
    for (const id of ['SEO-401-A', 'SC-101-A', 'SC-201-A', 'GN-201-A', 'SEO-101-A']) {
      const s = SEED_SIGNS.find((x) => x.id === id)!;
      for (const dest of ['gangnam', 'seoul-station', 'jamsil', 'city-hall', stationByKo('수원')!.id]) {
        const server = buildGuide(s, dest, [s], 'ko');
        const off = offlineGuide({ stationId: s.stationId, signId: s.id, mappings: s.mappings }, { kind: 'station', id: dest }, 'ko');
        expect(off.ok, `${id}→${dest}`).toBe(true);
        if (!off.ok || !server) continue;
        expect(off.view.legs.map((l) => [l.lineId, l.stops, l.side]), `${id}→${dest}`).toEqual(server.legs.map((l) => [l.lineId, l.stops, l.side]));
        expect(off.view.moveToLine?.id).toBe(server.moveToLine?.id);
      }
    }
  });

  it('QR 없음: 좌·우 없이 방면', () => {
    const r = offlineGuide({ stationId: 'maegyo' }, { kind: 'station', id: 'gangnam' }, 'ko');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view.legs.map((l) => l.stops)).toEqual([14, 5]);
      expect(r.view.legs.every((l) => !l.side)).toBe(true);
    }
  });

  it('장소 목적지와 다른 도시', () => {
    const r = offlineGuide({ stationId: 'city-hall' }, { kind: 'place', id: 'coex' }, 'en');
    expect(r.ok && r.view.place?.name).toBe('COEX (Starfield Library)');
    const far = offlineGuide({ stationId: 'city-hall' }, { kind: 'place', id: 'haeundae-beach' }, 'ko');
    expect(far).toEqual({ ok: false, error: 'other_region' });
  });

  it('검색', () => {
    expect(offlineSearch('강남', 'ko')[0].stationId).toBe('gangnam');
    expect(offlineSearch('Haeundae', 'en', '부산권').some((c) => c.id === 'haeundae-beach')).toBe(true);
    expect(offlineSearch('명동', 'ko', undefined, true).every((c) => c.kind === 'station')).toBe(true);
  });
});
