import { describe, expect, it } from 'vitest';
import {
  BASE_RADIUS_M,
  CONFIRM_ACCURACY_M,
  CONFIRM_AGE_MS,
  FIX_MAX_AGE_MS,
  MAX_RADIUS_M,
  originDecision,
  parseStoredFix,
  searchRadius,
  signMismatchKm,
  stationCandidates,
  type Fix,
  type StationPoint,
} from '@/lib/location';
import { cityPicks, stationPoints } from '@/lib/nearby';
import { getNetwork } from '@/lib/network';
import { STATION_COORDS } from '@/data/station-coords';

const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const MIN = 60_000;
const fix = (lat: number, lng: number, accuracy: number, agoMin = 0, source: Fix['source'] = 'now'): Fix => ({ lat, lng, accuracy, at: NOW - agoMin * MIN, source });
const points = stationPoints();

describe('직전 위치 보관 (3장·10장: 휴대폰에 최대 30분)', () => {
  const raw = (agoMin: number) => JSON.stringify({ lat: 37.5658, lng: 126.9779, accuracy: 30, at: NOW - agoMin * MIN });
  it('30분 이내 위치는 쓴다', () => {
    expect(parseStoredFix(raw(29), NOW)).toMatchObject({ source: 'saved', accuracy: 30 });
  });
  it('30분이 지난 위치는 버린다', () => {
    expect(parseStoredFix(raw(31), NOW)).toBeNull();
    expect(FIX_MAX_AGE_MS).toBe(30 * MIN);
  });
  it('미래 시각·깨진 값은 버린다', () => {
    expect(parseStoredFix(raw(-10), NOW)).toBeNull();
    expect(parseStoredFix('{oops', NOW)).toBeNull();
    expect(parseStoredFix(JSON.stringify({ lat: 'x', lng: 1, accuracy: 1, at: NOW }), NOW)).toBeNull();
    expect(parseStoredFix(null, NOW)).toBeNull();
  });
});

describe('후보 반경: 위치가 오래될수록 넓힌다', () => {
  it('방금 받은 정확한 위치는 기본 반경', () => {
    expect(searchRadius(fix(0, 0, 20), NOW)).toBe(BASE_RADIUS_M);
  });
  it('오차가 크면 오차만큼', () => {
    expect(searchRadius(fix(0, 0, 600), NOW)).toBe(600);
  });
  it('10분 전 위치는 더 넓고, 상한을 넘지 않는다', () => {
    expect(searchRadius(fix(0, 0, 20, 10), NOW)).toBeGreaterThan(searchRadius(fix(0, 0, 20, 1), NOW));
    expect(searchRadius(fix(0, 0, 900, 29), NOW)).toBeLessThanOrEqual(MAX_RADIUS_M);
  });
});

describe('가까운 역 후보 (휴대폰에서 계산)', () => {
  it('모든 역이 휴대폰용 좌표 목록에 있다', () => {
    expect(points.length).toBe(getNetwork().stations.size);
  });
  it('서울광장에서 방금 받은 위치 → 시청역을 반경 안 1순위로', () => {
    const c = stationCandidates(points, fix(37.5658, 126.9779, 30), NOW);
    expect(c[0]).toMatchObject({ id: 'city-hall', inRadius: true });
  });
  it('역에서 먼 곳(한강 위) → 반경 안 역이 없으면 inRadius=false로 가장 가까운 역들', () => {
    const c = stationCandidates(points, fix(37.517, 126.96, 30), NOW);
    expect(c.length).toBe(3);
    expect(c.every((x) => !x.inRadius)).toBe(true);
  });
  it('같은 자리라도 20분 전 위치면 후보가 더 많거나 같다', () => {
    const fresh = stationCandidates(points, fix(37.5658, 126.9779, 30), NOW).filter((x) => x.inRadius).length;
    const old = stationCandidates(points, fix(37.5658, 126.9779, 30, 20), NOW).filter((x) => x.inRadius).length;
    expect(old).toBeGreaterThanOrEqual(fresh);
  });
});

describe('출발역을 물어보는 경우 (5장: 예외만)', () => {
  // 가상의 역: A(기준점), B(A에서 동쪽 약 220m), C(A에서 동쪽 약 1.1km)
  const P = (id: string, dLng: number): StationPoint => ({ id, ko: id, names: { ko: id }, lines: ['1'], c: [37.5, 127 + dLng] });
  const lonely = [P('A', 0), P('C', 0.0125)];
  const crowded = [P('A', 0), P('B', 0.0025), P('C', 0.0125)];
  const decide = (pts: StationPoint[], f: Fix) => originDecision(f, stationCandidates(pts, f, NOW), NOW);

  it('정확한 현재 위치, 근처에 역이 하나 → 묻지 않고 바로 출발역', () => {
    expect(decide(lonely, fix(37.5, 127, 30))).toMatchObject({ kind: 'auto', stationId: 'A' });
  });
  it('위치 오차가 100m를 넘으면 후보를 보여 준다 (반경 밖 역도 채워 2개 이상)', () => {
    const d = decide(lonely, fix(37.5, 127, CONFIRM_ACCURACY_M + 20));
    expect(d).toMatchObject({ kind: 'choose', reason: 'inaccurate' });
    if (d.kind === 'choose') expect(d.choices.map((c) => c.id)).toEqual(['A', 'C']);
  });
  it('실제 데이터: 서울광장에서 오차 150m → 시청을 1순위로 후보 3개', () => {
    const d = decide(points, fix(37.5658, 126.9779, 150));
    expect(d.kind).toBe('choose');
    if (d.kind === 'choose') {
      expect(d.choices).toHaveLength(3);
      expect(d.choices[0].id).toBe('city-hall');
    }
  });
  it('반경 300m 안에 역이 둘 이상이면 후보 2~3개', () => {
    const d = decide(crowded, fix(37.5, 127, 30));
    expect(d).toMatchObject({ kind: 'choose', reason: 'crowded' });
    if (d.kind === 'choose') {
      expect(d.choices.length).toBeGreaterThanOrEqual(2);
      expect(d.choices.length).toBeLessThanOrEqual(3);
    }
  });
  it('직전 위치가 10분 넘었으면 후보, 그 안이면 바로', () => {
    expect(decide(lonely, fix(37.5, 127, 30, 11, 'saved'))).toMatchObject({ kind: 'choose', reason: 'stale' });
    expect(decide(lonely, fix(37.5, 127, 30, 4, 'saved'))).toMatchObject({ kind: 'auto', stationId: 'A' });
    expect(CONFIRM_AGE_MS).toBe(10 * MIN);
  });
  it('반경 안에 역이 없으면 (역에서 먼 곳) 후보를 보여 준다', () => {
    expect(decide(lonely, fix(37.52, 127, 30))).toMatchObject({ kind: 'choose', reason: 'far' });
  });
});

describe('QR 표지 대조 (A 방식: 다른 역 표지면 경고)', () => {
  const cityHall = STATION_COORDS['city-hall'];
  it('표지 역 근처면 경고하지 않는다', () => {
    expect(signMismatchKm(cityHall, fix(cityHall[0] + 0.001, cityHall[1], 50), NOW)).toBeNull();
  });
  it('표지 역에서 몇 km 떨어져 있으면 경고한다', () => {
    const gangnam = STATION_COORDS['gangnam'];
    expect(signMismatchKm(cityHall, fix(gangnam[0], gangnam[1], 50), NOW)).toBeGreaterThan(5);
  });
  it('오차가 크거나 5분이 지난 위치로는 경고하지 않는다 (잘못된 경고 방지)', () => {
    const gangnam = STATION_COORDS['gangnam'];
    expect(signMismatchKm(cityHall, fix(gangnam[0], gangnam[1], 1500), NOW)).toBeNull();
    expect(signMismatchKm(cityHall, fix(gangnam[0], gangnam[1], 50, 6, 'saved'), NOW)).toBeNull();
  });
});

describe('권역 → 노선 → 역 고르기', () => {
  it('권역 5곳, 모든 역이 자기 권역의 어느 노선에든 들어 있다', () => {
    const picks = cityPicks();
    expect(picks.map((c) => c.id)).toEqual(['수도권', '부산권', '대구권', '광주', '대전']);
    const net = getNetwork();
    for (const st of net.stations.values()) {
      const city = picks.find((c) => c.id === st.region)!;
      expect(city.lines.some((l) => l.stations.includes(st.id)), st.key).toBe(true);
    }
  });
  it('수도권은 1~9호선이 앞에, 노선 색은 lines.json', () => {
    const capital = cityPicks()[0];
    expect(capital.lines.slice(0, 9).map((l) => l.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(capital.lines.find((l) => l.id === '2')!.color).toBe('#00A84D');
  });
  it('2호선에는 성수·신정지선 역도 있다', () => {
    const line2 = cityPicks()[0].lines.find((l) => l.id === '2')!;
    expect(line2.name.ko).toBe('2호선');
    expect(line2.stations).toContain('yongdap');
  });
  it('부산 노선은 부산권에만', () => {
    const busan = cityPicks().find((c) => c.id === '부산권')!;
    expect(busan.lines.map((l) => l.id)).toContain('BUSAN-1');
    expect(busan.lines.find((l) => l.id === 'BUSAN-1')!.name.ko).toBe('부산 1호선');
  });
});
