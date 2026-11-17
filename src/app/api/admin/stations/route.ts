import { withAdmin } from '@/lib/admin-api';
import { REGION_NAMES, type Region } from '@/data/network-data';
import { getLine, getNetwork, neighbors, terminalsToward, directionCode } from '@/lib/network';

/** 현장 등록 도구용: 역 목록과, 노선별로 "다음 역 → 방면" 선택지 */
export async function GET() {
  return withAdmin(['operator', 'field', 'viewer'], async () => {
    const net = getNetwork();
    const stations = [...net.stations.values()].map((st) => ({
      id: st.id,
      // 수도권 밖의 역은 권역을 붙여 구분 (서울 시청 / 부산 시청)
      ko: st.region === '수도권' ? st.ko : `${st.ko} (${REGION_NAMES[st.region as Region].ko})`,
      en: st.en,
      lines: st.lines.map((lid) => {
        const line = getLine(lid)!;
        return {
          id: lid,
          name: line.name.ko,
          color: line.color,
          options: neighbors(lid, st.id).map((nb) => {
            const dir = directionCode(lid, st.id, nb);
            const terms = terminalsToward(lid, st.id, nb).map((x) => net.stations.get(x)!.ko);
            return {
              nextStationId: nb,
              nextKo: net.stations.get(nb)!.ko,
              label: dir === 'inner' ? '내선순환' : dir === 'outer' ? '외선순환' : `${terms.join('·')} 방면`,
            };
          }),
        };
      }),
    }));
    stations.sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
    return { stations };
  });
}
