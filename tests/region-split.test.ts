/** 지역 구분: 목적지 후보는 출발역 권역만, 다른 도시에서만 맞으면 그 도시를 알려 준다. */
import { describe, expect, it } from 'vitest';
import { search, splitByRegion } from '@/lib/search';

const dest = (q: string, region: string, lang: 'ko' | 'en' = 'ko') => splitByRegion(search(q, lang, [], 20, region), region, lang);

describe('목적지 검색은 출발 권역만', () => {
  it('서울에서 "시청": 서울 시청만 (부산·대구·대전 시청은 섞지 않음)', () => {
    const r = dest('시청', '수도권');
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((c) => c.region === '수도권')).toBe(true);
    expect(r.results[0].stationId).toBe('city-hall');
  });

  it('부산에서 "시청": 부산 시청이 나온다', () => {
    const r = dest('시청', '부산권');
    expect(r.results.every((c) => c.region === '부산권')).toBe(true);
    expect(r.results[0].stationKo).toBe('시청');
  });

  it('서울에서 "해운대": 목록은 비우고 "부산의 역"이라고 알려 준다', () => {
    expect(dest('해운대', '수도권')).toEqual({ results: [], elsewhere: ['부산'] });
    expect(dest('Haeundae', '수도권', 'en').elsewhere).toEqual(['Busan']);
  });

  it('대전에서 "강남": 서울의 역', () => {
    const r = dest('강남', '대전');
    expect(r.results).toEqual([]);
    expect(r.elsewhere).toContain('서울·수도권');
  });

  it('아무 데도 없으면 elsewhere 도 비어 있다', () => {
    expect(dest('없는역이름xyz', '수도권')).toEqual({ results: [], elsewhere: [] });
  });
});
