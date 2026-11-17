import { describe, expect, it } from 'vitest';
import { STATION_COORDS } from '@/data/station-coords';
import { RAW_STATIONS } from '@/data/network-data';
import { SEED_SIGNS } from '@/data/seed-signs';
import { distanceM, nearestStations } from '@/lib/nearby';
import { getNetwork, neighbors } from '@/lib/network';
import { guide } from '@/lib/route';
import { buildGuide } from '@/lib/guide-view';
import type { Sign } from '@/lib/types';

const locationSign = (stationId: string): Sign => ({
  id: 'LOCATION', stationId, spot: { ko: '' }, mode: 'platform', mappings: [], status: 'active',
  keyVersion: 0, createdBy: 'location', createdAt: '', updatedAt: '', version: 0,
});

describe('역 좌표', () => {
  it('모든 역에 좌표가 있고, 한국 안이다', () => {
    for (const s of RAW_STATIONS) {
      const c = STATION_COORDS[s.id];
      expect(c, s.key).toBeDefined();
      expect(c[0], s.key).toBeGreaterThan(33);
      expect(c[0], s.key).toBeLessThan(39);
      expect(c[1], s.key).toBeGreaterThan(125);
      expect(c[1], s.key).toBeLessThan(130);
    }
  });
  it('노선상 이웃 역끼리는 20km 이내 (좌표 오류 검출, 대경선 서대구–왜관이 약 17.5km)', () => {
    const net = getNetwork();
    for (const st of net.stations.values()) {
      for (const l of st.lines) {
        for (const nb of neighbors(l, st.id)) {
          const d = distanceM(STATION_COORDS[st.id], STATION_COORDS[nb]);
          expect(d, `${l}: ${st.key}–${net.stations.get(nb)!.key}`).toBeLessThan(20000);
        }
      }
    }
  });
  it('같은 이름 다른 권역의 시청은 각각 그 도시에서 가장 가깝다', () => {
    expect(nearestStations(37.5658, 126.9779, 1)[0].stationId).toBe('city-hall');
    expect(nearestStations(35.1798, 129.0750, 1)[0].stationId).toBe('busan-city-hall');
    expect(nearestStations(36.3504, 127.3845, 1)[0].stationId).toBe('daejeon-city-hall');
  });
  it('시청 앞(서울광장)에서 가장 가까운 역은 시청', () => {
    expect(nearestStations(37.5658, 126.9779, 1)[0].stationId).toBe('city-hall');
  });
  it('명동 거리에서 가장 가까운 역은 명동 또는 을지로입구', () => {
    expect(['myeong-dong', 'euljiro-1-ga']).toContain(nearestStations(37.5636, 126.9850, 1)[0].stationId);
  });
});

describe('내 위치 모드 (표지 없이 역만 아는 경우)', () => {
  it('시청 → 경복궁: 1호선 종각 방면 2정거장, 종로3가에서 3호선', () => {
    const r = guide(locationSign('city-hall'), 'gyeongbokgung', SEED_SIGNS)!;
    expect(r.legs.map((l) => l.lineId)).toEqual(['1', '3']);
    expect(r.legs[0].stations[1]).toBe('jonggak');
    expect(r.legs[0].stops).toBe(2);
    // 휴대폰은 이용자가 어느 쪽을 보는지 모르므로, 그 역에 기둥 표지가 있어도 화면에는 좌우를 내지 않는다
    const v = buildGuide(locationSign('city-hall'), 'gyeongbokgung', SEED_SIGNS, 'ko')!;
    expect(v.legs.every((l) => l.side === undefined)).toBe(true);
  });
  it('방향(다음 역)과 정거장 수만 낸다 — 강남 → 잠실', () => {
    const r = guide(locationSign('gangnam'), 'jamsil', SEED_SIGNS)!;
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].lineId).toBe('2');
    expect(r.legs[0].stations[1]).toBe('yeoksam');
    expect(r.legs[0].stops).toBe(6);
    const v = buildGuide(locationSign('gangnam'), 'jamsil', SEED_SIGNS, 'en')!;
    expect(v.legs[0].side).toBeUndefined();
    expect(v.legs[0].stations[1].name).toBe('Yeoksam');
  });
});
