import Link from 'next/link';
import { requirePageUser } from '@/lib/admin-api';
import { getLine, getStation } from '@/lib/network';
import { getStore } from '@/lib/store';
import { STATUS_KO } from '@/lib/admin-labels';


export default async function AdminHome() {
  const user = await requirePageUser();
  const signs = await getStore().listSigns();
  const byStation = new Map<string, typeof signs>();
  for (const s of signs) {
    if (!byStation.has(s.stationId)) byStation.set(s.stationId, []);
    byStation.get(s.stationId)!.push(s);
  }
  const pending = signs.filter((s) => s.status === 'pending');
  const unverified = signs.filter((s) => s.status === 'active' && !s.installVerifiedAt && s.createdBy !== 'seed');

  return (
    <div className="col">
      {user.role !== 'viewer' && pending.length > 0 && (
        <div className="card notice">
          <strong>승인 대기 {pending.length}장</strong>
          <p className="small muted">등록·수정한 사람과 다른 관리자가 현장에서 확인 후 승인해야 활성화됩니다.</p>
        </div>
      )}
      {user.role !== 'viewer' && unverified.length > 0 && (
        <div className="card notice">
          <strong>부착 후 재확인 필요 {unverified.length}장</strong>
          <p className="small muted">부착한 표지를 직접 찍어 왼쪽·오른쪽이 맞는지 확인하세요.</p>
        </div>
      )}
      {[...byStation.entries()].map(([sid, list]) => (
        <section key={sid} className="col" style={{ gap: 8 }}>
          <p className="section-label">{getStation(sid)?.ko}역</p>
          <ul className="list">
            {list.map((s) => (
              <li key={s.id}>
                <Link className="list-btn" href={`/admin/signs/${encodeURIComponent(s.id)}`}>
                  <span className="row" style={{ gap: 4 }}>
                    {[...new Set(s.mappings.map((m) => m.lineId))].map((l) => (
                      <span key={l} className="line-badge" style={{ background: getLine(l)?.color }}>
                        {getLine(l)?.num}
                      </span>
                    ))}
                  </span>
                  <span className="grow">
                    <span className="title">{s.spot.ko}</span>
                    <span className="sub">
                      {s.id}
                      {s.createdBy === 'seed' ? ' · 시연용' : ''}
                    </span>
                  </span>
                  <span className={`status ${s.status}`}>{STATUS_KO[s.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
