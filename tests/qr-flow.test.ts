/**
 * 기획서 2판 10장 "아직 확인 못 한 것" 중 계산으로 확인할 수 있는 부분:
 *  - QR 진입 시 좌·우 (ui-modes.test.ts)
 *  - 다른 노선 표지 → 승강장 이동, 반대편 승강장 표지 → 건너가기 (F7)
 *  - 환승역 QR 재인식 시 목적지 유지 (F6, 3장)
 */
import { describe, expect, it } from 'vitest';
import { SEED_SIGNS } from '@/data/seed-signs';
import { ACTIVE_DEST_TTL_MS, parseActiveDest, shouldResume } from '@/lib/active-dest';
import { buildGuide } from '@/lib/guide-view';
import { guideSentence } from '@/lib/guide-text';
import { stationByKo } from '@/lib/network';
import type { Candidate } from '@/lib/search';
import type { Sign } from '@/lib/types';

const seed = (id: string) => SEED_SIGNS.find((s) => s.id === id)!;
const pillar = (stationId: string, mappings: Sign['mappings']): Sign => ({
  id: 'TEST',
  stationId,
  spot: { ko: '시험' },
  mode: 'platform',
  mappings,
  status: 'active',
  keyVersion: 1,
  createdBy: 'a',
  createdAt: '',
  updatedAt: '',
  version: 1,
});

describe('F7 다른 노선·반대편 승강장 표지', () => {
  it('서울역 1호선 기둥에서 강남: "이 승강장이 아닙니다" + 4호선 승강장으로', () => {
    const v = buildGuide(seed('SEO-101-A'), 'gangnam', SEED_SIGNS, 'ko')!;
    expect(v.moveToLine?.id).toBe('4');
    expect(v.oppositePlatform).toBeUndefined();
    const s = guideSentence(v, 'ko', false);
    expect(s).toContain('이 승강장이 아닙니다');
    expect(s).toContain('4호선');
    expect(s).not.toMatch(/왼쪽|오른쪽/);
  });

  it('한 방향(회현)만 가리키는 4호선 표지에서 강남(숙대입구 방향): 반대편 승강장으로', () => {
    const one = pillar('seoul-station', [{ side: 'left', lineId: '4', nextStationId: 'hoehyeon' }]);
    const v = buildGuide(one, 'gangnam', [one], 'ko')!;
    expect(v.legs[0].side).toBeUndefined();
    expect(v.oppositePlatform).toBe(true);
    const s = guideSentence(v, 'ko', false);
    expect(s).toContain('반대편');
    expect(s).not.toMatch(/왼쪽|오른쪽/);
  });

  it('같은 표지에서 회현 방향 목적지면 그대로 왼쪽', () => {
    const one = pillar('seoul-station', [{ side: 'left', lineId: '4', nextStationId: 'hoehyeon' }]);
    const v = buildGuide(one, stationByKo('명동')!.id, [one], 'ko')!;
    expect(v.legs[0].side).toBe('left');
    expect(v.oppositePlatform).toBeUndefined();
  });

  it('갈래가 나뉘는 역(구로)에서 표지가 본선 두 방향만 가리키면, 갈래 목적지에 "반대편"이라 단정하지 않는다', () => {
    const guro = pillar('guro', [
      { side: 'left', lineId: '1', nextStationId: 'sindorim' },
      { side: 'right', lineId: '1', nextStationId: 'guil' },
    ]);
    const v = buildGuide(guro, 'gasan-digital-complex', [guro], 'ko')!;
    expect(v.legs[0].side).toBeUndefined();
    expect(v.oppositePlatform).toBeUndefined();
  });
});

describe('F6 목적지 유지 (QR을 찍어도 다시 묻지 않음)', () => {
  const gangnam: Candidate = {
    kind: 'station', id: 'gangnam', stationId: 'gangnam', label: '강남', sub: '', stationKo: '강남', lines: ['2'], region: '수도권', score: 0,
  };
  const now = 1_800_000_000_000;

  it('저장 후 90분 안이면 쓰고, 지나면 버린다', () => {
    expect(parseActiveDest(JSON.stringify({ c: gangnam, at: now - 10 * 60_000 }), now)?.id).toBe('gangnam');
    expect(parseActiveDest(JSON.stringify({ c: gangnam, at: now - ACTIVE_DEST_TTL_MS - 1 }), now)).toBeNull();
  });

  it('깨진 값·빈 값은 무시', () => {
    expect(parseActiveDest(null, now)).toBeNull();
    expect(parseActiveDest('{', now)).toBeNull();
    expect(parseActiveDest(JSON.stringify({ c: { id: 'x' }, at: now }), now)).toBeNull();
  });

  it('같은 도시의 다른 역 표지면 이어 가고, 목적지 역이거나 다른 도시면 이어 가지 않는다', () => {
    expect(shouldResume(gangnam, { stationId: 'seoul-station', region: '수도권' })).toBe(true);
    expect(shouldResume(gangnam, { stationId: 'gangnam', region: '수도권' })).toBe(false);
    expect(shouldResume(gangnam, { stationId: 'busan-seomyeon', region: '부산권' })).toBe(false);
    expect(shouldResume(null, { stationId: 'seoul-station', region: '수도권' })).toBe(false);
  });

  it('QR 없이 본 안내(방면) → 같은 역 기둥 QR: 같은 목적지로 좌·우가 나온다', () => {
    const loc = pillar('seoul-station', []);
    const before = buildGuide(loc, 'gangnam', [], 'ko')!;
    expect(before.legs[0].side).toBeUndefined();
    const after = buildGuide(seed('SEO-401-A'), 'gangnam', SEED_SIGNS, 'ko')!;
    expect(after.dest.id).toBe(before.dest.id);
    expect(after.legs[0].side).toBe('right');
    expect(after.legs[0].stops).toBe(before.legs[0].stops);
  });
});
