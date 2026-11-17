/**
 * 전국 데이터 안내 시험 — 순환·한 방향 순환·갈래·권역.
 * 기대값은 노선도를 보고 센 값이다.
 */
import { describe, expect, it } from 'vitest';
import { getNetwork, neighbors, stationByKo, terminalsToward } from '@/lib/network';
import { differentRegion, guide } from '@/lib/route';
import { search } from '@/lib/search';
import type { Sign } from '@/lib/types';

const loc = (stationId: string): Sign => ({
  id: 'LOCATION', stationId, spot: { ko: '' }, mode: 'platform', mappings: [], status: 'active',
  keyVersion: 0, createdBy: 'location', createdAt: '', updatedAt: '', version: 0,
});
const id = (ko: string, region?: string) => {
  const st = stationByKo(ko, region);
  if (!st) throw new Error(ko);
  return st.id;
};
const route = (a: string, b: string, region?: string) => guide(loc(id(a, region)), id(b, region), [])!;
const names = (ids: string[]) => ids.map((x) => getNetwork().stations.get(x)!.ko);

describe('요청한 확인 경우', () => {
  it('서울역 → 강남: 4호선 → 사당에서 2호선 (환승 1회)', () => {
    const r = route('서울역', '강남');
    expect(r.legs.map((l) => l.lineId)).toEqual(['4', '2']);
    expect(names([r.legs[0].stations.at(-1)!])).toEqual(['사당']);
    expect(r.legs[0].stops).toBe(7);
    expect(r.legs[1].stops).toBe(4);
    expect(r.transfers).toBe(1);
  });

  it('2호선 시청 → 충정로: 순환선 짧은 쪽(외선) 1정거장, 반대쪽 42', () => {
    const r = route('시청', '충정로');
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].lineId).toBe('2');
    expect(r.legs[0].stops).toBe(1);
    expect(r.legs[0].direction).toBe('outer');
    expect(r.legs[0].oppositeStops).toBe(42);
  });

  it('6호선 응암 → 역촌: 응암순환 한 방향 1정거장', () => {
    const r = route('응암', '역촌');
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].lineId).toBe('6');
    expect(r.legs[0].stops).toBe(1);
  });

  it('6호선 역촌 → 응암: 거꾸로는 못 가므로 순환을 돌아 5정거장', () => {
    const r = route('역촌', '응암');
    expect(r.legs[0].lineId).toBe('6');
    expect(names(r.legs[0].stations)).toEqual(['역촌', '불광', '독바위', '연신내', '구산', '응암']);
  });

  it('부산 서면 → 해운대: 부산 2호선 장산 방면 16정거장', () => {
    const r = route('서면', '해운대', '부산권');
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].lineId).toBe('BUSAN-2');
    expect(r.legs[0].stops).toBe(16);
    expect(names(r.legs[0].terminals)).toEqual(['장산']);
  });
});

describe('그래프 연결', () => {
  it('순환(loop): 2호선 충정로 ↔ 시청 양방향', () => {
    expect(neighbors('2', id('충정로'))).toContain(id('시청'));
    expect(neighbors('2', id('시청'))).toContain(id('충정로'));
  });

  it('한 방향 순환(oneway_loop): 응암 → 역촌만, 역촌 → 응암 없음 / 구산 → 응암만', () => {
    expect(neighbors('6', id('응암'))).toContain(id('역촌'));
    expect(neighbors('6', id('역촌'))).not.toContain(id('응암'));
    expect(neighbors('6', id('구산'))).toEqual([id('응암')]);
  });

  it('응암순환 방면: 순환 안에서는 신내, 본선에서 순환 쪽은 응암', () => {
    expect(names(terminalsToward('6', id('응암'), id('역촌')))).toEqual(['신내']);
    expect(names(terminalsToward('6', id('새절'), id('응암')))).toEqual(['응암']);
  });
});

describe('같은 노선의 갈래', () => {
  it('직통 갈래는 환승이 아니다: 신도림 → 인천(경인선), 천호 → 마천(5호선), 수원 → 서동탄', () => {
    for (const [a, b] of [['신도림', '인천'], ['천호', '마천'], ['수원', '서동탄']]) {
      const r = route(a, b);
      expect(r.legs, `${a}→${b}`).toHaveLength(1);
      expect(r.transfers).toBe(0);
    }
  });

  it('분기역에서 되돌아가면 갈아탄다: 구일 → 가산디지털단지(구로), 길동 → 마천(강동)', () => {
    const a = route('구일', '가산디지털단지');
    expect(a.legs.map((l) => l.lineId)).toEqual(['1', '1']);
    expect(names([a.legs[0].stations.at(-1)!])).toEqual(['구로']);
    const b = route('길동', '마천');
    expect(b.legs.map((l) => l.lineId)).toEqual(['5', '5']);
    expect(names([b.legs[0].stations.at(-1)!])).toEqual(['강동']);
  });

  it('지선은 본선 열차가 들어가지 않는다: 용답 → 시청은 성수에서 갈아탄다', () => {
    const r = route('용답', '시청');
    expect(r.legs.map((l) => l.lineId)).toEqual(['2', '2']);
    expect(names([r.legs[0].stations.at(-1)!])).toEqual(['성수']);
    expect(names(r.legs[0].terminals)).toEqual(['성수']);
  });
});

describe('이름이 다른 환승역 (4호선 총신대입구 ↔ 7호선 이수)', () => {
  it('4호선에서 7호선으로 갈아탈 수 있다', () => {
    const r = route('사당', '내방');
    expect(r.legs.map((l) => l.lineId)).toEqual(['4', '7']);
    expect(names([r.legs[0].stations.at(-1)!, r.legs[1].stations[0]])).toEqual(['총신대입구', '이수']);
  });
  it('같은 역으로 본다', () => {
    expect(route('총신대입구', '이수').sameStation).toBe(true);
  });
});

describe('권역', () => {
  it('다른 권역은 이어지지 않는다 (서울 시청 → 대전 시청)', () => {
    expect(differentRegion(id('시청'), id('시청', '대전'))).toBe(true);
    expect(guide(loc(id('시청')), id('시청', '대전'), [])).toBeNull();
  });

  it('검색: 출발 권역을 먼저, 다른 권역은 권역 이름을 붙여서', () => {
    expect(search('시청', 'ko')[0].stationId).toBe('city-hall');
    const busan = search('시청', 'ko', [], 8, '부산권');
    expect(busan[0].stationId).toBe('busan-city-hall');
    const other = busan.find((c) => c.stationId === 'city-hall')!;
    expect(other.sub.startsWith('서울·수도권 · ')).toBe(true);
    expect(search('서면', 'ko')[0].sub.startsWith('부산 · ')).toBe(true);
  });
});
