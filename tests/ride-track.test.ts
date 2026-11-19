/** 탑승 중 위치 추적: 위치를 경로 위의 역에 맞추고, 튀는 위치는 버린다. */
import { describe, expect, it } from 'vitest';
import { buildGuide } from '@/lib/guide-view';
import { t } from '@/lib/i18n';
import { stationByKo } from '@/lib/network';
import { TRACK_FRESH_MS, indexOnRoute, maxReachable, passedStops, type TrackAnchor } from '@/lib/ride-track';
import type { Sign } from '@/lib/types';

const loc = (stationId: string): Sign => ({
  id: 'LOCATION', stationId, spot: { ko: '' }, mode: 'platform', mappings: [], status: 'active',
  keyVersion: 0, createdBy: '', createdAt: '', updatedAt: '', version: 0,
});
// 매교 → 정자 (수인분당선 14개 역) → 강남 (신분당선 5개 역)
const g = buildGuide(loc(stationByKo('매교')!.id), 'gangnam', [], 'ko')!;
const leg = g.legs[0];
const coords = leg.stations.map((s) => s.c);
const at = (i: number, accuracy = 40) => ({ lat: coords[i]![0], lng: coords[i]![1], accuracy, at: 0 });
const mid = (i: number, accuracy = 60) => ({
  lat: (coords[i]![0] + coords[i + 1]![0]) / 2,
  lng: (coords[i]![1] + coords[i + 1]![1]) / 2,
  accuracy,
  at: 0,
});

describe('위치 → 몇 번째 역', () => {
  it('모든 역에 좌표가 있다', () => {
    for (const l of g.legs) for (const s of l.stations) expect(s.c, s.ko).toBeDefined();
  });

  it('역 위치면 그 역, 두 역 사이면 앞 역', () => {
    expect(indexOnRoute(coords, at(3), 0, 14)).toBe(3);
    expect(indexOnRoute(coords, mid(3), 0, 14)).toBe(3);
    expect(indexOnRoute(coords, at(14), 0, 14)).toBe(14);
  });

  it('부정확한 위치·경로에서 먼 위치는 버린다', () => {
    expect(indexOnRoute(coords, at(3, 900), 0, 14)).toBeNull();
    // 경로(북동쪽으로 뻗음)와 반대인 서쪽으로 약 9km
    const far = { lat: coords[0]![0], lng: coords[0]![1] - 0.1, accuracy: 30, at: 0 };
    expect(indexOnRoute(coords, far, 0, 14)).toBeNull();
  });

  it('뒤로 돌아가지 않는다', () => {
    const r = indexOnRoute(coords, at(2), 6, 14);
    expect(r === null || r >= 6).toBe(true);
  });

  it('열차가 갈 수 없을 만큼 앞서 나간 위치는 버린다 (탄 지 1분에 8번째 역)', () => {
    const a: TrackAnchor = { index: 0, at: 0, source: 'start' };
    const max = maxReachable(a, 60_000, 14);
    expect(max).toBeLessThanOrEqual(3);
    const r = indexOnRoute(coords, at(8), a.index, max);
    expect(r === null || r <= max).toBe(true);
  });
});

describe('남은 역 수 계산', () => {
  it('최근 위치가 있으면 위치 그대로, 오래되면 시간으로 이어서 추정', () => {
    const a: TrackAnchor = { index: 5, at: 0, source: 'gps' };
    expect(passedStops(a, 30_000, 14, 120)).toEqual({ passed: 5, byLocation: true });
    const later = TRACK_FRESH_MS + 150_000; // 위치가 끊긴 뒤 약 4분
    const r = passedStops(a, later, 14, 120);
    expect(r.byLocation).toBe(false);
    expect(r.passed).toBe(5 + Math.floor(later / 120_000));
    expect(passedStops(a, 10 * 3600_000, 14, 120).passed).toBe(14); // 끝을 넘지 않음
  });

  it('문구: 환승이 없으면 도착역까지, 있으면 환승역까지 + 최종 도착까지 모두', () => {
    expect(t('ko', 'leftToDest', { n: 3, station: '강남' })).toBe('강남까지 3개 역 남았어요');
    expect(t('ko', 'leftToTransfer', { n: 14, station: '정자' })).toBe('환승역 정자까지 14개 역 남았어요');
    expect(t('ko', 'totalLeft', { n: 19, station: '강남역' })).toBe('최종 도착 강남역까지 모두 19개 역');
    expect(t('en', 'leftToTransfer', { n: 1, station: 'Jeongja' })).toBe('1 stop to Jeongja (transfer)');
    expect(t('en', 'leftToDest', { n: 2, station: 'Gangnam' })).toBe('2 stops to Gangnam');
    expect(g.legs.reduce((n, l) => n + l.stops, 0)).toBe(19);
  });
});
