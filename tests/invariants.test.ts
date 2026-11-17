/**
 * 모든 표지 × 모든 역에 대해 성립해야 하는 규칙.
 * (정답표는 사람이 센 값, 여기는 "방향이 뒤집힐 수 없는 구조"를 확인한다.)
 */
import { describe, expect, it } from 'vitest';
import { guide } from '@/lib/route';
import { SEED_SIGNS } from '@/data/seed-signs';
import { getNetwork, linkedStations, neighbors } from '@/lib/network';

const net = getNetwork();

describe('경로 불변식', () => {
  for (const sign of SEED_SIGNS) {
    it(`${sign.id}: 모든 목적지`, () => {
      const region = net.stations.get(sign.stationId)!.region;
      for (const [dest, st] of net.stations) {
        const r = guide(sign, dest, SEED_SIGNS);
        // 다른 권역의 역은 이어지지 않는다 (도시철도끼리 연결 없음)
        if (st.region !== region) {
          expect(r, `${sign.id}→${dest}`).toBeNull();
          continue;
        }
        expect(r, `${sign.id}→${dest}`).not.toBeNull();
        if (r!.sameStation) continue;
        expect(r!.legs.length).toBeGreaterThan(0);
        expect(r!.legs[0].stations[0]).toBe(sign.stationId);
        // 목적지, 또는 이름만 다른 같은 환승역(이수 ↔ 총신대입구)에서 내린다
        expect([dest, ...linkedStations(dest)]).toContain(r!.legs.at(-1)!.stations.at(-1));
        r!.legs.forEach((leg, i) => {
          expect(leg.stops).toBe(leg.stations.length - 1);
          expect(leg.stops).toBeGreaterThan(0);
          // 연속한 두 역은 그 노선에서 실제로 이웃해야 한다
          for (let k = 0; k + 1 < leg.stations.length; k++) {
            expect(neighbors(leg.lineId, leg.stations[k])).toContain(leg.stations[k + 1]);
          }
          // 같은 역을 두 번 지나지 않는다
          expect(new Set(leg.stations).size).toBe(leg.stations.length);
          if (i > 0) {
            const prev = r!.legs[i - 1].stations.at(-1)!;
            expect([prev, ...linkedStations(prev)]).toContain(leg.stations[0]);
          }
        });
        // 첫 구간이 표지 노선이면 반드시 좌·우가 정해지고, 매핑의 다음 역과 일치해야 한다
        const first = r!.legs[0];
        if (!r!.moveToLineFirst) {
          const m = sign.mappings.find((x) => x.side === first.side);
          expect(m, `${sign.id}→${dest} side`).toBeDefined();
          expect(m!.lineId).toBe(first.lineId);
          expect(m!.nextStationId).toBe(first.stations[1]);
        }
      }
    });
  }

  it('같은 입력에는 항상 같은 답', () => {
    const a = JSON.stringify(guide(SEED_SIGNS[0], 'gangnam', SEED_SIGNS));
    const b = JSON.stringify(guide(SEED_SIGNS[0], 'gangnam', SEED_SIGNS));
    expect(a).toBe(b);
  });
});
