/**
 * 기획서 2판 10장 "고칠 것" 5가지 — 다시 생기지 않게 지키는 시험.
 *  1 환승 경로의 큰 카드가 환승역만 보여 목적지처럼 오해됨 → 갈아탈 노선 + 최종 도착역
 *  2 1개 역일 때 "1번째 역 / 수원 / 다음 역: 수원" 중복 → "다음 역에서 내리세요"
 *  3 노선 배지 글자가 세로로 쪼개짐 (CSS: globals.css .line-badge nowrap)
 *  4 외국어 화면의 한글 배지, 영어 복수형 오류 ("1 stops")
 *  5 '자주 찾는 곳'이 서울 관광지로 고정 → 현재 권역 기준
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGuide } from '@/lib/guide-view';
import { guideSentence } from '@/lib/guide-text';
import { badgeText, t } from '@/lib/i18n';
import { lineBadges } from '@/lib/nearby';
import { getLine, stationByKo } from '@/lib/network';
import { popular } from '@/lib/search';
import { LANGS, type Sign } from '@/lib/types';

const at = (ko: string, region = '수도권'): Sign => ({
  id: 'LOCATION',
  stationId: stationByKo(ko, region)!.id,
  spot: { ko: '' },
  mode: 'platform',
  mappings: [],
  status: 'active',
  keyVersion: 0,
  createdBy: 'location',
  createdAt: '',
  updatedAt: '',
  version: 0,
});

describe('고칠 점 1: 환승 경로', () => {
  it('매교 → 강남: 수인분당선 청량리 방면 14번째 역(정자) → 신분당선 신사 방면 5번째 역', () => {
    const v = buildGuide(at('매교'), 'gangnam', [], 'ko')!;
    expect(v.legs.map((l) => [l.lineName, l.stops, l.stations.at(-1)!.ko])).toEqual([
      ['수인분당선', 14, '정자'],
      ['신분당선', 5, '강남'],
    ]);
    expect(v.legs[0].terminals.map((s) => s.ko)).toEqual(['청량리']);
    expect(v.legs[0].stations[1].ko).toBe('수원시청');
  });

  it('한 문장에 갈아탈 노선과 최종 도착역이 들어간다 (환승역을 목적지로 오해하지 않게)', () => {
    const ko = guideSentence(buildGuide(at('매교'), 'gangnam', [], 'ko')!, 'ko', true);
    expect(ko).toContain('정자에서 신분당선(으)로 갈아타세요');
    expect(ko).toContain('최종 도착: 강남역');
    const en = guideSentence(buildGuide(at('매교'), 'gangnam', [], 'en')!, 'en', true);
    expect(en).toContain('Transfer at Jeongja to Shinbundang Line');
    expect(en).toContain('Final stop: Gangnam Station');
  });

  it('환승이 없으면 덧붙이지 않는다', () => {
    const s = guideSentence(buildGuide(at('매교'), stationByKo('정자')!.id, [], 'ko')!, 'ko', true);
    expect(s).not.toContain('갈아타');
    expect(s).not.toContain('최종 도착');
  });
});

describe('고칠 점 2: 바로 다음 역', () => {
  it('매교 → 수원: "1번째 역" 대신 "다음 역에서 내리세요"', () => {
    const v = buildGuide(at('매교'), stationByKo('수원')!.id, [], 'ko')!;
    expect(v.legs[0].stops).toBe(1);
    const s = guideSentence(v, 'ko', true);
    expect(s).toContain('다음 역에서 내리세요');
    expect(s).not.toContain('1번째');
  });

  it('모든 언어에서 1번째 역은 "다음 역"', () => {
    expect(t('en', 'getOffNth', { nth: t('en', 'nth', { n: 1 }) })).toBe('Get off at the next stop');
    expect(t('ja', 'getOffNth', { nth: t('ja', 'nth', { n: 1 }) })).toBe('次の駅で降りてください');
    expect(t('zh', 'getOffNth', { nth: t('zh', 'nth', { n: 1 }) })).toBe('在下一站下车');
    expect(t('es', 'getOffNth', { nth: t('es', 'nth', { n: 1 }) })).toBe('Bájate en la próxima parada');
    for (const l of LANGS) expect(t(l, 'nth', { n: 1 })).toBe(t(l, 'nthNext'));
  });
});

describe('고칠 점 3: 배지가 세로로 쪼개지지 않음', () => {
  it('CSS: 배지는 줄바꿈하지 않고, 배지 칸은 배지 단위로 넘긴다', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const start = css.indexOf('.line-badge {');
    const badge = css.slice(start, css.indexOf('}', start));
    expect(badge).toContain('white-space: nowrap');
    expect(badge).toContain('flex: none');
    expect(css).toMatch(/\.badges \{[^}]*flex-wrap: wrap/);
  });
});

describe('고칠 점 4: 외국어 화면에 한글이 남지 않음', () => {
  it('외국어 화면의 노선 배지는 라틴 문자', () => {
    const hangul = /[가-힣]/;
    for (const [id, b] of Object.entries(lineBadges())) {
      expect(badgeText('ko', b), id).toBe(b.num);
      for (const l of LANGS.filter((x) => x !== 'ko')) expect(badgeText(l, b), `${id} ${l}`).not.toMatch(hangul);
    }
    expect(badgeText('en', getLine('SUIN-BUNDANG')!)).toBe('SB');
    expect(badgeText('ko', getLine('SUIN-BUNDANG')!)).toBe('수인분당');
  });

  it('결과의 배지 글자도 언어에 맞춘다', () => {
    const v = buildGuide(at('매교'), 'gangnam', [], 'ja')!;
    expect(v.legs.map((l) => l.num)).toEqual(['SB', 'SBD']);
  });

  it('영어·스페인어·프랑스어 단수형', () => {
    expect(t('en', 'stops', { n: 1 })).toBe('1 stop');
    expect(t('en', 'stops', { n: 2 })).toBe('2 stops');
    expect(t('en', 'totalStops', { n: 1 })).toBe('1 stop in total');
    expect(t('en', 'transfers', { n: 1 })).toBe('1 transfer');
    expect(t('en', 'transfers', { n: 2 })).toBe('2 transfers');
    expect(t('en', 'remaining', { n: 1 })).toBe('1 stop to go');
    expect(t('es', 'stops', { n: 1 })).toBe('1 parada');
    expect(t('fr', 'stops', { n: 1 })).toBe('1 arrêt');
    for (const l of ['en', 'es', 'fr'] as const) {
      for (const k of ['stops', 'totalStops', 'otherWay', 'remaining', 'transfers'] as const) {
        expect(t(l, k, { n: 1 }), `${l} ${k}`).not.toMatch(/\(s\)|\b1 (stops|paradas|arrêts|transfers|transbordos|correspondances)\b/);
      }
    }
  });
});

describe('고칠 점 5: 자주 찾는 곳은 현재 권역 기준', () => {
  it('권역마다 자주 찾는 곳이 있고, 모두 그 권역의 역이다', () => {
    for (const region of ['수도권', '부산권', '대구권', '광주', '대전']) {
      const list = popular('ko', region);
      expect(list.length, region).toBeGreaterThan(2);
      for (const c of list) expect(c.region, `${region} ${c.id}`).toBe(region);
    }
  });

  it('부산에서는 해운대가 보이고 서울 관광지는 보이지 않는다', () => {
    const ids = popular('en', '부산권').map((c) => c.id);
    expect(ids).toContain('haeundae-beach');
    expect(ids).not.toContain('myeongdong-street');
  });

  it('대구 중앙로·대전 중앙로처럼 같은 이름의 역은 권역으로 고른다', () => {
    const daegu = popular('ko', '대구권').find((c) => c.id === 'dongseongno')!;
    const daejeon = popular('ko', '대전').find((c) => c.id === 'sungsimdang')!;
    expect(daegu.stationId).not.toBe(daejeon.stationId);
  });

  it('번체 중국어 장소 이름 (번체 표기가 없으면 간체)', () => {
    expect(popular('zh-TW', '부산권').find((c) => c.id === 'haeundae-beach')!.label).toBe('海雲台海水浴場');
    expect(popular('zh-TW', '수도권').find((c) => c.id === 'myeongdong-street')!.label).toBe('明洞');
  });
});
