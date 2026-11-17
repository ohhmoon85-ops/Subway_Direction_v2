/**
 * 정답표 자동 시험 (기획서 6장·9장).
 * 아래 기대값은 노선도를 보고 사람이 직접 센 값이다. 알고리즘으로 만든 값이 아니다.
 * 방향(좌·우)이 하나라도 틀리면 배포(build)가 멈춘다.
 */
import { describe, expect, it } from 'vitest';
import { guide } from '@/lib/route';
import { SEED_SIGNS } from '@/data/seed-signs';
import { stationByKo } from '@/lib/network';
import type { Side } from '@/lib/types';

const sign = (id: string) => SEED_SIGNS.find((s) => s.id === id)!;
const sid = (ko: string) => {
  const st = stationByKo(ko);
  if (!st) throw new Error(ko);
  return st.id;
};

interface Case {
  sign: string;
  dest: string;
  side?: Side;
  stops?: number;
  lines?: string[];
  firstAlight?: string;
  moveFirst?: string;
  hint?: string[];
  opposite?: number;
  same?: boolean;
}

const CASES: Case[] = [
  // 시청역 1호선 표지: 왼쪽 → 종각, 오른쪽 → 서울역
  { sign: 'SC-101-A', dest: '종각', side: 'left', stops: 1, lines: ['1'] },
  { sign: 'SC-101-A', dest: '서울역', side: 'right', stops: 1, lines: ['1'] },
  { sign: 'SC-101-A', dest: '종로3가', side: 'left', stops: 2, lines: ['1'] },
  { sign: 'SC-101-A', dest: '경복궁', side: 'left', stops: 2, lines: ['1', '3'], firstAlight: '종로3가' },
  { sign: 'SC-101-A', dest: '인천', side: 'right', stops: 29, lines: ['1'], hint: ['인천'] },
  { sign: 'SC-101-A', dest: '수원', side: 'right', lines: ['1'], hint: ['병점', '서동탄', '천안', '신창'] },
  { sign: 'SC-101-A', dest: '의정부', side: 'left', lines: ['1'], hint: ['의정부', '양주', '동두천', '소요산', '연천'] },
  { sign: 'SC-101-A', dest: '신도림', side: 'right', stops: 8, lines: ['1'] },
  { sign: 'SC-101-A', dest: '강남', side: 'right', stops: 1, lines: ['1', '4', '2'], firstAlight: '서울역' },
  { sign: 'SC-101-A', dest: '명동', side: 'right', stops: 1, lines: ['1', '4'] },
  // 광명 셔틀은 1호선의 갈래지만 직통 열차가 없어 금천구청에서 갈아탄다 (경로 비용엔 환승 벌점 없음)
  { sign: 'SC-101-A', dest: '광명', side: 'right', stops: 12, lines: ['1', '1'], firstAlight: '금천구청' },
  { sign: 'SC-101-A', dest: '시청', same: true },
  // 시청역 2호선 표지: 왼쪽 → 을지로입구(내선), 오른쪽 → 충정로(외선)
  { sign: 'SC-201-A', dest: '충정로', side: 'right', stops: 1, lines: ['2'], opposite: 42 },
  { sign: 'SC-201-A', dest: '신촌', side: 'right', stops: 4, lines: ['2'], opposite: 39 },
  { sign: 'SC-201-A', dest: '을지로입구', side: 'left', stops: 1, lines: ['2'] },
  { sign: 'SC-201-A', dest: '강남', side: 'left', stops: 21, lines: ['2'], opposite: 22 },
  { sign: 'SC-201-A', dest: '종각', side: 'left', stops: 1, lines: ['1'], moveFirst: '1' }, // 1호선 표지(SC-101-A) 기준 왼쪽
  // 충무로역 3호선 표지: 왼쪽 → 을지로3가(대화 방면), 오른쪽 → 동대입구(오금 방면)
  { sign: 'CM-301-A', dest: '경복궁', side: 'left', stops: 4, lines: ['3'] },
  { sign: 'CM-301-A', dest: '압구정', side: 'right', stops: 5, lines: ['3'] },
  { sign: 'CM-301-A', dest: '오금', side: 'right', stops: 21, lines: ['3'] },
  { sign: 'CM-301-A', dest: '명동', side: 'right', stops: 1, lines: ['4'], moveFirst: '4' }, // 4호선 표지(CM-401-A) 기준
  // 충무로역 4호선 표지: 왼쪽 → 동대문역사문화공원(진접 방면), 오른쪽 → 명동(오이도 방면)
  { sign: 'CM-401-A', dest: '서울역', side: 'right', stops: 3, lines: ['4'] },
  { sign: 'CM-401-A', dest: '혜화', side: 'left', stops: 3, lines: ['4'] },
  { sign: 'CM-401-A', dest: '사당', side: 'right', stops: 10, lines: ['4'] },
  { sign: 'CM-401-A', dest: '동대입구', side: 'right', stops: 1, lines: ['3'], moveFirst: '3' }, // 3호선 표지(CM-301-A) 기준
];

describe('정답표: 표지 × 목적지 → 좌·우·정거장 수', () => {
  for (const c of CASES) {
    it(`${c.sign} → ${c.dest}`, () => {
      const r = guide(sign(c.sign), sid(c.dest), SEED_SIGNS)!;
      expect(r).not.toBeNull();
      if (c.same) {
        expect(r.sameStation).toBe(true);
        return;
      }
      const first = r.legs[0];
      if (c.side) expect(first.side).toBe(c.side);
      if (c.stops !== undefined) expect(first.stops).toBe(c.stops);
      if (c.lines) expect(r.legs.map((l) => l.lineId)).toEqual(c.lines);
      if (c.firstAlight) expect(first.stations.at(-1)).toBe(sid(c.firstAlight));
      expect(r.moveToLineFirst).toBe(c.moveFirst);
      if (c.hint) expect(first.serviceHint).toEqual(c.hint.map(sid));
      if (c.opposite !== undefined) expect(first.oppositeStops).toBe(c.opposite);
    });
  }
});
