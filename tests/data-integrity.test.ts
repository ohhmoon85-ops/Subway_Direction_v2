import { describe, expect, it } from 'vitest';
import { LEGACY_STATIONS } from '@/data/legacy-stations';
import { RAW_STATIONS, REGIONS } from '@/data/network-data';
import { RAW_PLACES } from '@/data/places';
import { SEED_SIGNS } from '@/data/seed-signs';
import {
  getLine,
  getNetwork,
  neighbors,
  normalizeLineId,
  normalizeStationId,
  stationByKo,
  stationIdFromKey,
  stationKeyFromId,
  stationName,
} from '@/lib/network';
import { normalizeSign } from '@/lib/store';

describe('전국 노선 데이터 (stations.json · lines.json)', () => {
  const net = getNetwork();

  it('역 939개 · 노선 36개, 역 ID는 모두 다르고 URL에 쓸 수 있다', () => {
    expect(net.stations.size).toBe(939);
    expect(net.lines.size).toBe(36);
    for (const id of net.stations.keys()) expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('모든 역이 적어도 한 노선에 속하고, 권역은 5곳 중 하나', () => {
    for (const st of net.stations.values()) {
      expect(st.lines.length, st.key).toBeGreaterThan(0);
      expect(REGIONS as readonly string[], st.key).toContain(st.region);
    }
  });

  it('노선별 역 수', () => {
    expect(getLine('2')!.segs.find((g) => g.kind === 'loop')!.stations.length).toBe(43);
    expect(getLine('3')!.segments[0].length).toBe(44);
    expect(getLine('4')!.segments[0].length).toBe(51);
  });

  it('주요 환승역', () => {
    const lines = (ko: string, region?: string) => [...stationByKo(ko, region)!.lines].sort();
    expect(lines('시청')).toEqual(['1', '2']);
    expect(lines('충무로')).toEqual(['3', '4']);
    expect(lines('종로3가')).toEqual(['1', '3', '5']);
    expect(lines('동대문역사문화공원')).toEqual(['2', '4', '5']);
    expect(lines('신도림')).toEqual(['1', '2']);
    expect(lines('금정')).toEqual(['1', '4']);
    expect(lines('서울역')).toEqual(['1', '4', 'AREX', 'GYEONGUI-JUNGANG']);
    expect(lines('서면', '부산권')).toEqual(['BUSAN-1', 'BUSAN-2']);
    expect(lines('반월당', '대구권')).toEqual(['DAEGU-1', 'DAEGU-2']);
  });
});

describe('역 ID 호환 (QR 표지·Supabase·?from= 이 깨지지 않게)', () => {
  it('시제품 1~4호선 역 235개의 ID가 모두 그대로 있다', () => {
    for (const [ko, id] of LEGACY_STATIONS) expect(getNetwork().stations.has(id), `${ko} ${id}`).toBe(true);
  });

  it('JSON 역 키 ↔ 앱 역 ID', () => {
    expect(stationIdFromKey('수도권:시청')).toBe('city-hall');
    expect(stationKeyFromId('city-hall')).toBe('수도권:시청');
    expect(stationIdFromKey('부산권:시청')).toBe('busan-city-hall');
    expect(stationIdFromKey('대전:시청')).toBe('daejeon-city-hall');
    expect(normalizeStationId('수도권:강남')).toBe('gangnam');
    expect(normalizeStationId('gangnam')).toBe('gangnam');
    for (const s of RAW_STATIONS) expect(stationIdFromKey(s.key)).toBe(s.id);
  });

  it('이름이 바뀐 역(신길온천 → 능길)도 예전 ID를 쓴다', () => {
    const st = stationByKo('능길')!;
    expect(st.id).toBe('singiloncheon');
    expect(st.aliases).toContain('신길온천');
  });

  it('시제품 갈래 노선 ID(1G·2S·2J)와 JSON 노선 ID를 지금 노선 ID로', () => {
    expect(normalizeLineId('1G')).toBe('1');
    expect(normalizeLineId('2S')).toBe('2');
    expect(normalizeLineId('2J')).toBe('2');
    expect(normalizeLineId('SEOUL-2')).toBe('2');
    expect(normalizeLineId('BUSAN-1')).toBe('BUSAN-1');
  });

  it('예전 형식으로 저장된 표지를 읽으면 지금 형식으로 맞춰진다', () => {
    const old = { ...SEED_SIGNS[0], id: 'SS-OLD', stationId: '수도권:성수', mappings: [{ side: 'left' as const, lineId: '2S', nextStationId: 'yongdap' }, { side: 'right' as const, lineId: '2', nextStationId: '수도권:뚝섬' }] };
    const s = normalizeSign(old);
    expect(s.stationId).toBe('seongsu');
    expect(s.mappings.map((m) => [m.lineId, m.nextStationId])).toEqual([['2', 'yongdap'], ['2', 'ttukseom']]);
    for (const m of s.mappings) expect(neighbors(m.lineId, s.stationId)).toContain(m.nextStationId);
  });

  it('시연 표지 매핑의 다음 역이 실제 이웃 역', () => {
    for (const s of SEED_SIGNS) {
      expect(getNetwork().stations.has(s.stationId), s.id).toBe(true);
      for (const m of s.mappings) expect(neighbors(m.lineId, s.stationId), s.id).toContain(m.nextStationId);
      expect(new Set(s.mappings.map((m) => m.side)).size).toBe(2);
    }
  });

  it('장소 데이터의 역이 모두 존재 (수도권)', () => {
    for (const [id, ko, , , , region] of RAW_PLACES) expect(stationByKo(ko, region ?? '수도권')?.region, id).toBe(region ?? '수도권');
  });
});

describe('같은 이름의 역', () => {
  it('권역이 다르면 다른 역 (서울·부산·대전 시청)', () => {
    expect(stationByKo('시청')!.id).toBe('city-hall');
    expect(stationByKo('시청', '부산권')!.id).toBe('busan-city-hall');
    expect(stationByKo('시청', '대전')!.id).toBe('daejeon-city-hall');
  });

  it('같은 권역의 동명이역: 화면 이름은 display_ko, 영어는 노선으로 구분', () => {
    const s2 = stationByKo('신촌')!;
    const sg = stationByKo('신촌(경의중앙선)')!;
    expect(s2.id).toBe('sinchon'); // 2호선 신촌은 시제품 ID 그대로
    expect(s2.ko).toBe('신촌(2호선)');
    expect(sg.id).not.toBe(s2.id);
    expect(stationName(sg, 'en')).toBe('Sinchon (Gyeongui-Jungang Line)');
    expect(stationName(stationByKo('양평(5호선)')!, 'ko')).toBe('양평(5호선)');
  });

  it('영어 화면은 name_en', () => {
    expect(stationName(stationByKo('시청')!, 'en')).toBe('City Hall');
    expect(stationName(stationByKo('서면', '부산권')!, 'en')).toBe('Seomyeon');
  });
});
