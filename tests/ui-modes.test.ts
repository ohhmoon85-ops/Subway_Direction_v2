/**
 * 결과 화면 두 가지 (2026-11-17 UI 개편 지시)
 *  - 기둥 QR: 첫 구간만 왼쪽/오른쪽, 환승역부터는 방면·몇 번째 역. 다른 노선 승강장이면 좌우 없이 이동 안내.
 *  - 내 위치·노선 고르기: 좌우 없음, 방면 중심.
 * 그리고 언어: 휴대폰 언어 하나 (중국어 번체 포함), 외국어 화면 역명은 영어 + 한글.
 */
import { describe, expect, it } from 'vitest';
import { SEED_SIGNS } from '@/data/seed-signs';
import { buildGuide } from '@/lib/guide-view';
import { MESSAGES, langFromList, pickLang, t } from '@/lib/i18n';
import { getStation, neighbors, stationName } from '@/lib/network';
import { LANGS, type Sign } from '@/lib/types';

const sign = (id: string) => SEED_SIGNS.find((s) => s.id === id)!;
const locationSign = (stationId: string): Sign => ({
  id: 'LOCATION', stationId, spot: { ko: '' }, mode: 'platform', mappings: [], status: 'active',
  keyVersion: 0, createdBy: 'location', createdAt: '', updatedAt: '', version: 0,
});

describe('기둥 QR 모드', () => {
  it('서울역 4호선 기둥 → 강남: 오른쪽(숙대입구 방향), 첫 구간만 좌우', () => {
    const v = buildGuide(sign('SEO-401-A'), 'gangnam', SEED_SIGNS, 'ko')!;
    expect(v.moveToLine).toBeUndefined();
    expect(v.legs[0].lineId).toBe('4');
    expect(v.legs[0].side).toBe('right');
    expect(v.legs[0].stations[1].ko).toBe('숙대입구');
    expect(v.legs[0].terminals.map((s) => s.ko)).toContain('오이도');
    expect(v.legs.at(-1)!.stations.at(-1)!.id).toBe('gangnam');
    // 환승역부터는 좌우를 내지 않는다 (그곳 기둥 QR을 다시 찍게)
    for (const leg of v.legs.slice(1)) expect(leg.side).toBeUndefined();
  });

  it('서울역 1호선 기둥 → 강남: 이 승강장이 아님 → 좌우 없이 4호선 승강장으로 이동', () => {
    const v = buildGuide(sign('SEO-101-A'), 'gangnam', SEED_SIGNS, 'ko')!;
    expect(v.moveToLine?.id).toBe('4');
    expect(v.legs.every((l) => l.side === undefined)).toBe(true);
  });

  it('시청 1호선 기둥 → 서울역: 오른쪽 1번째 역', () => {
    const v = buildGuide(sign('SC-101-A'), 'seoul-station', SEED_SIGNS, 'ko')!;
    expect(v.legs[0].side).toBe('right');
    expect(v.legs[0].stops).toBe(1);
  });

  it('부산 서면 1호선 기둥 → 노포 방향 왼쪽', () => {
    const v = buildGuide(sign('SM-B101-A'), getStation('busan-bujeon')!.id, SEED_SIGNS, 'ko')!;
    expect(v.legs[0].side).toBe('left');
    expect(v.legs[0].stops).toBe(1);
  });

  it('시험 표지 7곳(서울역 1·4, 시청 1·2, 강남 2, 서면 1·2)의 매핑이 실제 이웃 역', () => {
    for (const id of ['SEO-101-A', 'SEO-401-A', 'SC-101-A', 'SC-201-A', 'GN-201-A', 'SM-B101-A', 'SM-B201-A']) {
      const s = sign(id);
      expect(s, id).toBeDefined();
      for (const m of s.mappings) expect(neighbors(m.lineId, s.stationId), id).toContain(m.nextStationId);
      expect(new Set(s.mappings.map((m) => m.lineId)).size, id).toBe(1);
    }
  });
});

describe('내 위치·노선 고르기 모드', () => {
  it('서울역 → 강남: 좌우 없이 방면·다음 역·몇 번째 역', () => {
    const v = buildGuide(locationSign('seoul-station'), 'gangnam', SEED_SIGNS, 'ko')!;
    expect(v.legs.every((l) => l.side === undefined)).toBe(true);
    expect(v.legs[0].lineId).toBe('4');
    expect(v.legs[0].stations[1].ko).toBe('숙대입구');
    expect(v.legs[0].stops).toBeGreaterThan(0);
  });
});

describe('언어 하나만', () => {
  it('휴대폰 언어 → 지원 언어 (번체 포함, 미지원은 영어)', () => {
    expect(langFromList(['zh-TW', 'en'])).toBe('zh-TW');
    expect(langFromList(['zh-Hant-HK'])).toBe('zh-TW');
    expect(langFromList(['zh-CN'])).toBe('zh');
    expect(langFromList(['zh-Hans'])).toBe('zh');
    expect(langFromList(['vi-VN', 'fr-FR'])).toBe('fr');
    expect(langFromList(['vi-VN'])).toBe('en');
    expect(pickLang('es-ES,es;q=0.9')).toBe('es');
    expect(pickLang('zh-TW,zh;q=0.9')).toBe('zh-TW');
  });

  it('7개 언어 모두 같은 문구 키를 갖고, 빈 문구가 없다', () => {
    const keys = Object.keys(MESSAGES.ko).sort();
    for (const l of LANGS) {
      expect(Object.keys(MESSAGES[l]).sort(), l).toEqual(keys);
      for (const k of keys) expect((MESSAGES[l] as Record<string, string>)[k], `${l}.${k}`).toBeTruthy();
    }
  });

  it('외국어 화면의 문구에 한글이 섞이지 않는다 (역명 제외)', () => {
    for (const l of LANGS.filter((x) => x !== 'ko')) {
      for (const [k, v] of Object.entries(MESSAGES[l])) expect(/[가-힣]/.test(v), `${l}.${k}: ${v}`).toBe(false);
    }
  });

  it('역 이름: 한국어 화면은 한국어, 그 밖의 언어는 영어', () => {
    const st = getStation('seoul-station')!;
    expect(stationName(st, 'ko')).toBe('서울역');
    for (const l of ['en', 'ja', 'zh', 'zh-TW', 'es', 'fr'] as const) expect(stationName(st, l)).toBe(st.en);
  });

  it('주요 결과 문구', () => {
    expect(t('ko', 'getOffNth', { nth: t('ko', 'nth', { n: 2 }) })).toBe('2번째 역에서 내리세요');
    expect(t('en', 'getOffNth', { nth: t('en', 'nth', { n: 2 }) })).toBe('Get off at the 2nd stop');
    expect(t('ja', 'getOffNth', { nth: t('ja', 'nth', { n: 2 }) })).toBe('2つ目の駅で降りてください');
    expect(t('zh-TW', 'getOffNth', { nth: t('zh-TW', 'nth', { n: 2 }) })).toBe('在第2站下車');
    expect(t('fr', 'getOffNth', { nth: t('fr', 'nth', { n: 1 }) })).toBe('Descendez au prochain arrêt');
  });
});
