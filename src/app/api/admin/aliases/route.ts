import { withAdmin } from '@/lib/admin-api';
import { getStation } from '@/lib/network';
import { AdminError } from '@/lib/sign-admin';
import { getStore, invalidateAliases } from '@/lib/store';

export async function GET() {
  return withAdmin(['operator', 'field', 'viewer'], async () => ({ aliases: await getStore().listAliases() }));
}

/** 역명 사전 보강: 검색 실패어를 보고 새 표기·호칭을 추가 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  return withAdmin(['operator'], async (u) => {
    const text = String(b.text ?? '').trim().slice(0, 60);
    if (!text) throw new AdminError('text_required');
    if (!getStation(String(b.stationId))) throw new AdminError('unknown_station');
    await getStore().addAlias({
      stationId: String(b.stationId),
      lang: String(b.lang ?? 'en').slice(0, 5),
      text,
      kind: ['표기', '통용 호칭', '음차', '의역', '축약'].includes(b.kind) ? b.kind : '통용 호칭',
      addedBy: u.username,
      at: new Date().toISOString(),
    });
    invalidateAliases();
    return { ok: true };
  });
}
