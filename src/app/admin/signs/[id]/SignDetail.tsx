'use client';
import { DirArrow, Icon } from '@/components/Icon';
import Link from 'next/link';
import { useState } from 'react';
import { STATUS_KO } from '@/lib/admin-labels';
import { LANG_LABEL } from '@/lib/i18n';
import { LANGS, type Lang, type Role, type Sign } from '@/lib/types';
import { SignEditor } from '../../SignEditor';

const ERR: Record<string, string> = {
  same_person: '등록·수정한 사람과 다른 관리자가 승인해야 합니다 (2인 확인)',
  not_pending: '승인 대기 상태가 아닙니다',
  not_active: '활성 상태의 표지만 부착 확인할 수 있습니다',
  not_approved: '승인되지 않은 표지는 활성화할 수 없습니다',
  reason_required: '사유를 입력하세요',
  forbidden: '권한이 없습니다',
};

export function SignDetail({
  sign,
  stationKo,
  mapping,
  history,
  url,
  role,
  me,
}: {
  sign: Sign;
  stationKo: string;
  mapping: { side: string; line: string; color: string; next: string }[];
  history: { version: number; editor: string; reason: string; at: string }[];
  url: string;
  role: Role;
  me: string;
}) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState<Partial<Record<Lang, string>>>(sign.notice ?? {});
  const canEdit = role !== 'viewer';
  const editor = sign.editedBy ?? sign.createdBy;

  const act = async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setErr('');
    const r = await fetch(`/api/admin/signs/${encodeURIComponent(sign.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(ERR[j.error] ?? j.error);
    location.reload();
  };

  if (editing) {
    return (
      <div className="col">
        <div className="row between">
          <h1>표지 수정 · {sign.id}</h1>
          <button className="chip" onClick={() => setEditing(false)}>취소</button>
        </div>
        <SignEditor existing={sign} />
      </div>
    );
  }

  return (
    <div className="col">
      <div className="row between">
        <h1>
          {stationKo}역 · {sign.spot.ko}
        </h1>
        <span className={`status ${sign.status}`}>{STATUS_KO[sign.status]}</span>
      </div>
      <p className="muted small">
        {sign.id} · v{sign.version} · 등록 {sign.createdBy} · 최근 수정 {editor}
        {sign.approvedBy ? ` · 승인 ${sign.approvedBy}` : ''}
        {sign.installVerifiedAt ? ` · 부착 확인 ${sign.installVerifiedBy}` : ''}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      {sign.photo && <img src={sign.photo} alt="표지 위치" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12 }} />}

      <section className="btns">
        {[...mapping]
          .sort((a) => (a.side === 'left' ? -1 : 1))
          .map((m) => (
            <div key={m.side} className="side-pick col" style={{ ['--c' as string]: m.side === 'left' ? 'var(--left)' : 'var(--right)', gap: 6 }}>
              <span className="head">
                {m.side === 'left' && <DirArrow side="left" />}
                {m.side === 'left' ? '왼쪽' : '오른쪽'}
                {m.side === 'right' && <DirArrow side="right" />}
              </span>
              <span className="line-tag small">
                <span className="line-badge sm" style={{ background: m.color }}>{m.line.replace(/\D.*$/, '')}</span>
                {m.line}
              </span>
              <span className="small muted">다음 역</span>
              <strong>{m.next}</strong>
            </div>
          ))}
      </section>

      {err && <p className="pill-warn">{err}</p>}

      {canEdit && sign.status === 'pending' && (
        <section className="card col notice">
          <strong>2인 확인</strong>
          <p className="small">
            {editor === me
              ? '내가 등록·수정한 표지입니다. 다른 관리자가 같은 자리에서 화면을 보고 승인해야 합니다.'
              : `${editor} 님이 등록·수정했습니다. 표지 자리에 서서 왼쪽·오른쪽 다음 역이 맞는지 확인한 뒤 승인하세요.`}
          </p>
          <button className="btn primary block" disabled={editor === me} onClick={() => act({ action: 'approve' }, '현장에서 왼쪽·오른쪽 방향을 직접 확인했습니까?')}>
            <Icon name="check" size={18} /> 현장 확인 완료 · 승인
          </button>
        </section>
      )}

      {canEdit && sign.status === 'active' && !sign.installVerifiedAt && (
        <section className="card col notice">
          <strong>부착 후 재확인</strong>
          <p className="small">표지를 붙인 뒤 휴대폰으로 직접 찍어, 화면의 왼쪽·오른쪽이 실제와 맞는지 확인하세요.</p>
          <a className="btn block" href={url} target="_blank" rel="noreferrer"><Icon name="external" size={18} /> 이용자 화면 열기</a>
          <button className="btn primary block" onClick={() => act({ action: 'verifyInstall' }, '부착한 표지를 찍어 왼쪽·오른쪽이 맞는 것을 확인했습니까?')}>
            <Icon name="check" size={18} /> 부착 확인 완료
          </button>
        </section>
      )}

      <section className="card col">
        <h2>QR · 인쇄</h2>
        <p className="small muted" style={{ wordBreak: 'break-all' }}>{url}</p>
        <div className="btns">
          <Link className="btn" href={`/admin/signs/${encodeURIComponent(sign.id)}/print`}><Icon name="printer" size={18} /> 표지 인쇄</Link>
          <a className="btn" href={url} target="_blank" rel="noreferrer"><Icon name="qr" size={18} /> 미리 보기</a>
        </div>
        {sign.status === 'pending' && <p className="small muted">승인 전 표지는 이용자 화면에서 "사용할 수 없는 표지"로 나옵니다.</p>}
      </section>

      {canEdit && (
        <section className="card col">
          <h2>임시 공지 (공사·승강장 변경 등)</h2>
          {LANGS.map((l) => (
            <label key={l} className="field">
              <span>{LANG_LABEL[l]}</span>
              <input className="input" value={notice[l] ?? ''} onChange={(e) => setNotice({ ...notice, [l]: e.target.value })} />
            </label>
          ))}
          <div className="btns">
            <button className="btn primary" onClick={() => act({ action: 'notice', notice })}>공지 저장</button>
            <button className="btn" onClick={() => act({ action: 'notice', notice: {} })}>공지 해제</button>
          </div>
        </section>
      )}

      {canEdit && (
        <section className="card col">
          <h2>관리</h2>
          <button className="btn block" onClick={() => setEditing(true)}><Icon name="pen" size={18} /> 방향·지점 정보 수정</button>
          <div className="btns">
            {sign.status !== 'active' && sign.approvedBy && sign.status !== 'pending' && (
              <button className="btn" onClick={() => act({ action: 'status', status: 'active' })}>정상으로</button>
            )}
            {sign.status !== 'damaged' && sign.status !== 'pending' && (
              <button className="btn" onClick={() => act({ action: 'status', status: 'damaged' }, '훼손으로 표시하면 이용자 화면에서 안내가 멈춥니다.')}>훼손</button>
            )}
            {sign.status !== 'replace' && sign.status !== 'pending' && (
              <button className="btn" onClick={() => act({ action: 'status', status: 'replace' }, '교체 필요로 표시하면 이용자 화면에서 안내가 멈춥니다.')}>교체 필요</button>
            )}
            {role === 'operator' && sign.status !== 'retired' && (
              <button className="btn danger" onClick={() => act({ action: 'status', status: 'retired' }, '이 표지를 철거 처리할까요?')}>철거</button>
            )}
          </div>
        </section>
      )}

      <section className="card col">
        <h2>수정 이력</h2>
        {history.length === 0 && <p className="muted small">이력이 없습니다 (시연용 기본 표지).</p>}
        <table className="table">
          <tbody>
            {history.map((h) => (
              <tr key={h.version}>
                <td>v{h.version}</td>
                <td>
                  {h.reason}
                  <br />
                  <span className="muted">{h.editor} · {new Date(h.at).toLocaleString('ko-KR')}</span>
                </td>
                <td>
                  {canEdit && h.version !== sign.version && (
                    <button
                      className="chip"
                      onClick={() => {
                        const reason = prompt(`v${h.version}의 방향·지점 정보로 되돌립니다. 사유를 입력하세요.`);
                        if (reason) act({ action: 'revert', version: h.version, reason });
                      }}
                    >
                      복구
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
