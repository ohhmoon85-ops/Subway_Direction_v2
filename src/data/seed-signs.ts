/**
 * 시험·시연용 기둥 표지 (기둥마다 고유 QR, 개정 기획서 2장 A 방식).
 * "이 기둥을 마주 볼 때 왼쪽 = ○○ 방면, 오른쪽 = △△ 방면"을 바로 다음 역으로 등록한다.
 * 왼쪽/오른쪽 배정은 현장 확인 전 가정값이다. 실제 부착 때 관리자 화면에서 다시 등록·2인 승인한다.
 *
 *  서울역 1·4호선 · 시청 1·2호선 · 강남 2호선 · 부산 서면 1·2호선 · 충무로 3·4호선(초기 시연용)
 */
import type { Localized, Sign } from '@/lib/types';

const base = {
  mode: 'platform' as const,
  status: 'active' as const,
  keyVersion: 1,
  createdBy: 'seed',
  createdAt: '2026-11-15T00:00:00.000Z',
  approvedBy: 'seed',
  approvedAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
  version: 1,
};

/** 기둥 위치 이름 (7개 언어) */
function spot(line: { ko: string; en: string; ja: string; zh: string; zhTW: string; es: string; fr: string }, where: 'stairs' | 'entrance' | 'pillar'): Localized {
  const w = {
    stairs: { ko: '계단 아래 기둥', en: 'Pillar at foot of stairs', ja: '階段下の柱', zh: '楼梯下的柱子', zhTW: '樓梯下的柱子', es: 'Pilar al pie de la escalera', fr: 'Pilier au bas de l’escalier' },
    entrance: { ko: '승강장 입구 기둥', en: 'Pillar at platform entrance', ja: 'ホーム入口の柱', zh: '站台入口的柱子', zhTW: '月台入口的柱子', es: 'Pilar en la entrada al andén', fr: 'Pilier à l’entrée du quai' },
    pillar: { ko: '승강장 중앙 기둥', en: 'Center platform pillar', ja: 'ホーム中央の柱', zh: '站台中央的柱子', zhTW: '月台中央的柱子', es: 'Pilar central del andén', fr: 'Pilier central du quai' },
  }[where];
  return {
    ko: `${line.ko} · ${w.ko}`,
    en: `${line.en} · ${w.en}`,
    ja: `${line.ja}・${w.ja}`,
    zh: `${line.zh}·${w.zh}`,
    'zh-TW': `${line.zhTW}·${w.zhTW}`,
    es: `${line.es} · ${w.es}`,
    fr: `${line.fr} · ${w.fr}`,
  };
}

const seoulLine = (n: number) => ({ ko: `${n}호선`, en: `Line ${n}`, ja: `${n}号線`, zh: `${n}号线`, zhTW: `${n}號線`, es: `Línea ${n}`, fr: `Ligne ${n}` });
const busanLine = (n: number) => ({ ko: `부산 ${n}호선`, en: `Busan Line ${n}`, ja: `釜山${n}号線`, zh: `釜山${n}号线`, zhTW: `釜山${n}號線`, es: `Línea ${n} de Busan`, fr: `Ligne ${n} de Busan` });

export const SEED_SIGNS: Sign[] = [
  // 서울역 1호선: 왼쪽 = 시청(청량리·연천 방면), 오른쪽 = 남영(인천·신창 방면)
  {
    ...base,
    id: 'SEO-101-A',
    stationId: 'seoul-station',
    spot: spot(seoulLine(1), 'stairs'),
    mappings: [
      { side: 'left', lineId: '1', nextStationId: 'city-hall' },
      { side: 'right', lineId: '1', nextStationId: 'namyeong' },
    ],
  },
  // 서울역 4호선: 왼쪽 = 회현(진접 방면), 오른쪽 = 숙대입구(오이도 방면)
  {
    ...base,
    id: 'SEO-401-A',
    stationId: 'seoul-station',
    spot: spot(seoulLine(4), 'stairs'),
    mappings: [
      { side: 'left', lineId: '4', nextStationId: 'hoehyeon' },
      { side: 'right', lineId: '4', nextStationId: 'sookmyung-women-s-univ' },
    ],
  },
  // 시청 1호선: 왼쪽 = 종각, 오른쪽 = 서울역
  {
    ...base,
    id: 'SC-101-A',
    stationId: 'city-hall',
    spot: spot(seoulLine(1), 'stairs'),
    mappings: [
      { side: 'left', lineId: '1', nextStationId: 'jonggak' },
      { side: 'right', lineId: '1', nextStationId: 'seoul-station' },
    ],
  },
  // 시청 2호선: 왼쪽 = 을지로입구(내선), 오른쪽 = 충정로(외선)
  {
    ...base,
    id: 'SC-201-A',
    stationId: 'city-hall',
    spot: spot(seoulLine(2), 'stairs'),
    mappings: [
      { side: 'left', lineId: '2', nextStationId: 'euljiro-1-ga' },
      { side: 'right', lineId: '2', nextStationId: 'chungjeongno' },
    ],
  },
  // 강남 2호선: 왼쪽 = 교대, 오른쪽 = 역삼
  {
    ...base,
    id: 'GN-201-A',
    stationId: 'gangnam',
    spot: spot(seoulLine(2), 'pillar'),
    mappings: [
      { side: 'left', lineId: '2', nextStationId: 'seoul-nat-l-univ-of-education' },
      { side: 'right', lineId: '2', nextStationId: 'yeoksam' },
    ],
  },
  // 부산 서면 1호선: 왼쪽 = 부전(노포 방면), 오른쪽 = 범내골(다대포해수욕장 방면)
  {
    ...base,
    id: 'SM-B101-A',
    stationId: 'busan-seomyeon',
    spot: spot(busanLine(1), 'stairs'),
    mappings: [
      { side: 'left', lineId: 'BUSAN-1', nextStationId: 'busan-bujeon' },
      { side: 'right', lineId: 'BUSAN-1', nextStationId: 'busan-beomnaegol' },
    ],
  },
  // 부산 서면 2호선: 왼쪽 = 부암(양산 방면), 오른쪽 = 전포(장산 방면)
  {
    ...base,
    id: 'SM-B201-A',
    stationId: 'busan-seomyeon',
    spot: spot(busanLine(2), 'stairs'),
    mappings: [
      { side: 'left', lineId: 'BUSAN-2', nextStationId: 'busan-buam' },
      { side: 'right', lineId: 'BUSAN-2', nextStationId: 'busan-jeonpo' },
    ],
  },
  // 충무로 3·4호선 (초기 시연용)
  {
    ...base,
    id: 'CM-301-A',
    stationId: 'chungmuro',
    spot: spot(seoulLine(3), 'entrance'),
    mappings: [
      { side: 'left', lineId: '3', nextStationId: 'euljiro-3-ga' },
      { side: 'right', lineId: '3', nextStationId: 'dongguk-univ' },
    ],
  },
  {
    ...base,
    id: 'CM-401-A',
    stationId: 'chungmuro',
    spot: spot(seoulLine(4), 'entrance'),
    mappings: [
      { side: 'left', lineId: '4', nextStationId: 'dongdaemun-history-and-culture-park' },
      { side: 'right', lineId: '4', nextStationId: 'myeong-dong' },
    ],
  },
];
