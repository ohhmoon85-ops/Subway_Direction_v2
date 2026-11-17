import { requirePageUser } from '@/lib/admin-api';
import { LANG_LABEL, isLang } from '@/lib/i18n';
import { getStation } from '@/lib/network';
import { summarize, type SignStats } from '@/lib/stats';
import { getStore } from '@/lib/store';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePageUser();
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 28));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const events = await getStore().listEvents(since);
  const s = summarize(events, days);
  const t = s.total;
  const foreign = t.scans ? (t.scans - (t.langs.ko ?? 0)) / t.scans : null;

  return (
    <div className="col">
      <div className="row between">
        <h1>통계 (최근 {days}일)</h1>
        <span className="row">
          {[7, 28, 84].map((d) => (
            <a key={d} className="chip" aria-pressed={d === days} href={`?days=${d}`}>
              {d}일
            </a>
          ))}
        </span>
      </div>
      <p className="small muted">개인을 식별할 수 있는 정보는 모으지 않습니다. 목표치는 기획서 11장의 제안값입니다.</p>

      <section className="kpis">
        <Kpi label="QR 스캔" value={String(t.scans)} />
        <Kpi label="안내 성공률" value={pct(t.successRate)} goal="70% 이상" />
        <Kpi label="검색 실패율" value={pct(s.searchFailRate)} goal="5% 미만" />
        <Kpi label="만족도(예)" value={pct(t.yes + t.no ? t.yes / (t.yes + t.no) : null)} goal="80% 이상" />
        <Kpi label="외국어 화면 비율" value={pct(foreign)} />
        <Kpi label="청각 지원 사용" value={pct(t.scans ? t.hearing / t.scans : null)} />
        <Kpi label="탑승 후 알림 사용" value={String(t.boards)} />
        <Kpi label="위조·무효 QR 접속" value={String(s.fakeQr)} />
      </section>

      <section className="card col">
        <h2>언어 비율</h2>
        <Bars data={Object.entries(t.langs).map(([k, v]) => [isLang(k) ? LANG_LABEL[k] : k, v])} />
      </section>

      <section className="card col">
        <h2>표지별</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>표지</th>
                <th>스캔</th>
                <th>성공률</th>
                <th>예/아니오</th>
                <th>인기 목적지</th>
              </tr>
            </thead>
            <tbody>
              {s.bySign.map((b: SignStats) => (
                <tr key={b.signId}>
                  <td>{b.signId}</td>
                  <td>{b.scans}</td>
                  <td>{pct(b.successRate)}</td>
                  <td>
                    {b.yes}/{b.no}
                  </td>
                  <td>{b.topDests.map(([d, n]) => `${getStation(d)?.ko ?? d}(${n})`).join(', ')}</td>
                </tr>
              ))}
              {s.bySign.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    아직 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card col">
        <h2>검색 실패어 (역명 사전 보강용)</h2>
        {s.searchFails.length === 0 ? (
          <p className="muted small">없음</p>
        ) : (
          <Bars data={s.searchFails} />
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, goal }: { label: string; value: string; goal?: string }) {
  return (
    <div className="card kpi">
      <div className="small muted">{label}</div>
      <div className="v">{value}</div>
      {goal && <div className="small muted">목표 {goal}</div>}
    </div>
  );
}

function Bars({ data }: { data: [string, number][] }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  if (data.length === 0) return <p className="muted small">없음</p>;
  return (
    <div className="col" style={{ gap: 6 }}>
      {data
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <div key={k} className="bar">
            <span style={{ width: 110, flex: 'none' }} className="small">
              {k}
            </span>
            <b style={{ width: `${(v / max) * 60}%` }} />
            <span className="small">{v}</span>
          </div>
        ))}
    </div>
  );
}
