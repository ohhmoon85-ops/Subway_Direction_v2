import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/admin-api';
import { getLine, getStation } from '@/lib/network';
import { baseUrl, signUrl } from '@/lib/qr-sign';
import { getStore } from '@/lib/store';
import { SignDetail } from './SignDetail';

export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const store = getStore();
  const sign = await store.getSign(decodeURIComponent(id));
  if (!sign) notFound();
  const history = await store.listHistory(sign.id);
  const st = getStation(sign.stationId)!;
  const mapping = sign.mappings.map((m) => ({
    side: m.side,
    line: getLine(m.lineId)!.name.ko,
    color: getLine(m.lineId)!.color,
    next: getStation(m.nextStationId)!.ko,
  }));
  return (
    <SignDetail
      sign={sign}
      stationKo={st.ko}
      mapping={mapping}
      history={history.map((h) => ({ version: h.version, editor: h.editor, reason: h.reason, at: h.at }))}
      url={signUrl(baseUrl(), sign.id, sign.keyVersion)}
      role={user.role}
      me={user.username}
    />
  );
}
