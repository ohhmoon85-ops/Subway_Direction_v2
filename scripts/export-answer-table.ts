// 표지 × 모든 역 → 좌·우·정거장 수 전체 표를 CSV로 뽑는다 (사람이 검토하는 정답표 초안).
// 사용법: npm run answer-table   → answer-table.csv
import { writeFileSync } from 'node:fs';
import { SEED_SIGNS } from '../src/data/seed-signs';
import { getLine, getNetwork } from '../src/lib/network';
import { guide } from '../src/lib/route';

const net = getNetwork();
const ko = (id: string) => net.stations.get(id)!.ko;
const rows = [['표지', '출발역', '목적지', '첫 동작', '좌우', '첫 구간 노선', '내릴 역(첫 구간)', '정거장 수', '환승', '경로'].join(',')];

for (const sign of SEED_SIGNS) {
  for (const dest of net.stations.keys()) {
    const r = guide(sign, dest, SEED_SIGNS);
    if (!r || r.sameStation) continue;
    const f = r.legs[0];
    rows.push(
      [
        sign.id,
        ko(sign.stationId),
        ko(dest),
        r.moveToLineFirst ? `${getLine(r.moveToLineFirst)!.name.ko} 이동` : '탑승',
        f.side === 'left' ? '왼쪽' : f.side === 'right' ? '오른쪽' : '-',
        getLine(f.lineId)!.name.ko,
        ko(f.stations.at(-1)!),
        f.stops,
        r.transfers,
        `"${r.legs.map((l) => `${getLine(l.lineId)!.name.ko}:${ko(l.stations[0])}→${ko(l.stations.at(-1)!)}`).join(' / ')}"`,
      ].join(','),
    );
  }
}
writeFileSync('answer-table.csv', '﻿' + rows.join('\n'));
console.log(`answer-table.csv: ${rows.length - 1}행`);
