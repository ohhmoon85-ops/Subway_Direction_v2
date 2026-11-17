import { requirePageUser } from '@/lib/admin-api';
import { REGION_NAMES, type Region } from '@/data/network-data';
import { getNetwork } from '@/lib/network';
import { summarize } from '@/lib/stats';
import { getStore } from '@/lib/store';
import { AliasForm } from './AliasForm';

export default async function DictionaryPage() {
  await requirePageUser(['operator']);
  const store = getStore();
  const [aliases, events] = await Promise.all([store.listAliases(), store.listEvents(new Date(Date.now() - 90 * 86400_000).toISOString())]);
  const fails = summarize(events, 90).searchFails;
  const label = (s: { ko: string; region: string }) => (s.region === '수도권' ? s.ko : `${s.ko} (${REGION_NAMES[s.region as Region].ko})`);
  const stations = [...getNetwork().stations.values()].map((s) => ({ id: s.id, ko: label(s) })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
  const ko = (id: string) => {
    const s = getNetwork().stations.get(id);
    return s ? label(s) : id;
  };

  return (
    <div className="col">
      <h1>역명 사전</h1>
      <p className="small muted">검색에 실패한 말을 보고, 어느 역을 뜻했는지 연결해 두면 다음부터 찾아집니다. (표기·통용 호칭·음차·의역·축약)</p>
      <section className="card col">
        <h2>최근 90일 검색 실패어</h2>
        {fails.length === 0 ? <p className="muted small">없음</p> : (
          <ul className="list">
            {fails.map(([q, n]) => (
              <li key={q} className="row between">
                <span>{q}</span>
                <span className="muted small">{n}회</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AliasForm stations={stations} suggestions={fails.map(([q]) => q)} />
      <section className="card col">
        <h2>추가한 표현 ({aliases.length})</h2>
        <table className="table">
          <tbody>
            {aliases.map((a, i) => (
              <tr key={i}>
                <td>{a.text}</td>
                <td>→ {ko(a.stationId)}</td>
                <td className="muted">{a.lang} · {a.kind} · {a.addedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
