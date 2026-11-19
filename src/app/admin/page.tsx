import Link from 'next/link';
import { requirePageUser } from '@/lib/admin-api';
import { getLine, getStation } from '@/lib/network';
import { getStore, storeStatus } from '@/lib/store';
import { SEED_SIGNS } from '@/data/seed-signs';
import { STATUS_KO } from '@/lib/admin-labels';


export default async function AdminHome() {
  const user = await requirePageUser();
  const status = await storeStatus();
  // 저장소 오류여도 화면은 열리게 (시연 표지만 보여 주고 위에 원인 표시)
  const signs = await getStore()
    .listSigns()
    .catch(() => SEED_SIGNS);
  const byStation = new Map<string, typeof signs>();
  for (const s of signs) {
    if (!byStation.has(s.stationId)) byStation.set(s.stationId, []);
    byStation.get(s.stationId)!.push(s);
  }
  const pending = signs.filter((s) => s.status === 'pending');
  const unverified = signs.filter((s) => s.status === 'active' && !s.installVerifiedAt && s.createdBy !== 'seed');

  return (
    <div className="col">
      {/* 저장소 상태: 표지 등록 정보가 계속 남는지 */}
      {status.kind === 'supabase' && status.ok ? (
        <p className="small muted">저장소: Supabase 연결됨 — 등록한 표지·이력·통계가 계속 저장됩니다.</p>
      ) : status.kind === 'supabase' ? (
        <div className="card notice">
          <strong>저장소: Supabase 연결 오류</strong>
          <p className="small">{status.problem}</p>
        </div>
      ) : status.kind === 'memory' ? (
        <div className="card notice">
          <strong>저장소: 임시(메모리)</strong>
          <p className="small">재배포하거나 서버가 다시 켜지면 등록한 표지가 사라집니다. Supabase를 연결하세요 (README 3장).</p>
        </div>
      ) : (
        <p className="small muted">저장소: 이 컴퓨터의 파일(.data/db.json) — 로컬 개발용</p>
      )}
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
