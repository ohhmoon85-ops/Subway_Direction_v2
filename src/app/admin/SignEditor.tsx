'use client';
/**
 * 기둥 표지 등록 (현장·시험용, 휴대폰). 표지 1장 5분 이내 목표.
 * 역 → 노선 → 기둥 이름 → 기둥을 마주 보고 왼쪽 방면 / 오른쪽 방면(바로 다음 역 기준).
 * 진행 방향(방면)은 다음 역으로부터 자동으로 정해진다. 등록 후 다른 관리자가 승인해야 켜진다.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Sign, Side } from '@/lib/types';
import { DirArrow } from '@/components/Icon';

interface Option { nextStationId: string; nextKo: string; label: string }
interface LineOpt { id: string; name: string; color: string; options: Option[] }
interface StationOpt { id: string; ko: string; en: string; lines: LineOpt[] }

const ERR: Record<string, string> = {
  unknown_station: '역을 고르세요',
  next_not_adjacent: '다음 역이 이웃 역이 아닙니다',
  duplicate_direction: '왼쪽과 오른쪽에 같은 방향이 들어갔습니다',
  need_both_sides: '왼쪽과 오른쪽을 모두 고르세요',
  spot_required: '기둥 이름을 입력하세요',
  photo_too_large: '사진이 너무 큽니다',
  reason_required: '수정 사유를 입력하세요',
  forbidden: '권한이 없습니다',
};

async function resizePhoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const max = 800;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

export function SignEditor({ existing }: { existing?: Sign }) {
  const [stations, setStations] = useState<StationOpt[]>([]);
  const [filter, setFilter] = useState('');
  const [stationId, setStationId] = useState(existing?.stationId ?? '');
  const [lineId, setLineId] = useState(existing?.mappings[0]?.lineId ?? '');
  const [spotKo, setSpotKo] = useState(existing?.spot.ko ?? '');
  const [spotEn, setSpotEn] = useState(existing?.spot.en ?? '');
  const [photo, setPhoto] = useState<string | undefined>(existing?.photo);
  const initNext = (side: Side) => existing?.mappings.find((x) => x.side === side)?.nextStationId ?? '';
  const [left, setLeft] = useState(initNext('left'));
  const [right, setRight] = useState(initNext('right'));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/stations')
      .then((r) => r.json())
      .then((j) => setStations(j.stations ?? []));
  }, []);

  const station = stations.find((s) => s.id === stationId);
  const line = station?.lines.find((l) => l.id === lineId);
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return [];
    return stations.filter((s) => s.ko.includes(f) || s.en.toLowerCase().includes(f)).slice(0, 8);
  }, [filter, stations]);

  // 노선이 하나뿐인 역은 자동 선택
  useEffect(() => {
    if (station && !lineId && station.lines.length === 1) setLineId(station.lines[0].id);
  }, [station, lineId]);

  // 다음 역이 둘뿐이면(대부분의 역) 왼쪽에 하나를 고르면 오른쪽은 나머지로
  const pickLeft = (id: string) => {
    setLeft(id);
    if (line?.options.length === 2 && (!right || right === id)) setRight(line.options.find((o) => o.nextStationId !== id)!.nextStationId);
  };
  const pickRight = (id: string) => {
    setRight(id);
    if (line?.options.length === 2 && (!left || left === id)) setLeft(line.options.find((o) => o.nextStationId !== id)!.nextStationId);
  };

  const same = !!left && left === right;
  const labelOf = (id: string) => line?.options.find((o) => o.nextStationId === id);

  const submit = async () => {
    setErr('');
    if (same) return setErr('왼쪽과 오른쪽에 같은 방향을 골랐습니다. 다시 확인하세요.');
    setBusy(true);
    const body = {
      stationId,
      spot: { ko: spotKo, en: spotEn || undefined },
      photo,
      mappings: [
        { side: 'left', lineId, nextStationId: left },
        { side: 'right', lineId, nextStationId: right },
      ],
    };
    const res = existing
      ? await fetch(`/api/admin/signs/${encodeURIComponent(existing.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'edit', reason, ...body }),
        })
      : await fetch('/api/admin/signs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(ERR[j.error] ?? j.error ?? '저장하지 못했습니다');
    location.href = `/admin/signs/${encodeURIComponent(j.sign.id)}`;
  };

  const SidePicker = (side: Side, value: string, pick: (id: string) => void) => (
    <div className="side-pick col" style={{ ['--c' as string]: side === 'left' ? 'var(--left)' : 'var(--right)' }}>
      <span className="head">
        {side === 'left' && <DirArrow side="left" />}
        {side === 'left' ? '왼쪽 방면' : '오른쪽 방면'}
        {side === 'right' && <DirArrow side="right" />}
      </span>
      <div className="col" role="radiogroup" aria-label={`${side === 'left' ? '왼쪽' : '오른쪽'} 다음 역`} style={{ gap: 8 }}>
        <span className="small muted">기둥을 마주 보고 {side === 'left' ? '왼쪽' : '오른쪽'}으로 가서 타는 열차의 바로 다음 역</span>
        {line!.options.map((o) => (
          <label key={o.nextStationId} className="radio-row">
            <input type="radio" name={`next-${side}`} checked={value === o.nextStationId} onChange={() => pick(o.nextStationId)} />
            <span className="grow">
              <strong>{o.label || '방면 정보 없음'}</strong>
              <br />
              <span className="small muted">다음 역 {o.nextKo}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="col">
      <section className="card col">
        <h2>1. 역</h2>
        {existing ? (
          <p>
            <strong>{station?.ko ?? existing.stationId}</strong> <span className="muted small">(역은 바꿀 수 없음)</span>
          </p>
        ) : station ? (
          <div className="row between">
            <strong>{station.ko}</strong>
            <button
              className="chip"
              onClick={() => {
                setStationId('');
                setLineId('');
                setLeft('');
                setRight('');
              }}
            >
              다시 고르기
            </button>
          </div>
        ) : (
          <div className="col">
            <input className="input" placeholder="역 이름 (예: 서울역, 서면)" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {filtered.length > 0 && (
              <ul className="list">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      className="list-btn"
                      onClick={() => {
                        setStationId(s.id);
                        setFilter('');
                        setLineId('');
                      }}
                    >
                      <span className="grow">
                        <span className="title">{s.ko}</span>
                        <span className="sub">{s.lines.map((l) => l.name).join(', ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {station && (
        <section className="card col">
          <h2>2. 노선</h2>
          <div className="chips" role="radiogroup" aria-label="노선">
            {station.lines.map((l) => (
              <button
                key={l.id}
                className="chip"
                aria-pressed={l.id === lineId}
                onClick={() => {
                  setLineId(l.id);
                  setLeft('');
                  setRight('');
                }}
              >
                <span className="line-badge sm" style={{ background: l.color }} aria-hidden>
                  ●
                </span>
                {l.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {station && line && (
        <section className="card col">
          <h2>3. 기둥</h2>
          <label className="field">
            <span>기둥 이름 (한국어, 필수)</span>
            <input className="input" placeholder="예: 계단 아래 기둥, 3-2번 승강장 입구 기둥" value={spotKo} onChange={(e) => setSpotKo(e.target.value)} />
          </label>
          <label className="field">
            <span>기둥 이름 (영어, 선택)</span>
            <input className="input" placeholder="e.g. Pillar at foot of stairs" value={spotEn} onChange={(e) => setSpotEn(e.target.value)} />
          </label>
          <label className="field">
            <span>기둥을 마주 보고 찍은 사진 (선택)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="input"
              style={{ paddingTop: 10 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await resizePhoto(f));
              }}
            />
          </label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="기둥 사진" style={{ width: '100%', borderRadius: 12 }} />}
        </section>
      )}

      {station && line && (
        <section className="card col">
          <h2>4. 왼쪽 방면 / 오른쪽 방면</h2>
          <p className="small muted">기둥(표지를 붙일 면)을 마주 보고 섰을 때를 기준으로 고르세요.</p>
          {SidePicker('left', left, pickLeft)}
          {SidePicker('right', right, pickRight)}
          {left && right && !same && (
            <p className="note small">
              ◀ {labelOf(left)?.label} | {labelOf(right)?.label} ▶
            </p>
          )}
          {same && <p className="pill-warn small">왼쪽과 오른쪽이 같은 방향입니다.</p>}
        </section>
      )}

      {existing && (
        <section className="card col">
          <label className="field">
            <span>수정 사유 (필수, 이력에 남음)</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 승강장 공사로 계단 위치 변경" />
          </label>
          <p className="small muted">방향을 바꾸면 다시 승인 대기 상태가 되고, 다른 관리자의 확인이 필요합니다.</p>
        </section>
      )}

      {err && <p className="pill-warn">{err}</p>}
      <button className="btn primary block" disabled={busy || !stationId || !lineId || !spotKo || !left || !right || same || (!!existing && !reason)} onClick={submit}>
        {existing ? '수정 저장 (승인 요청)' : '등록하고 2인 확인 요청'}
      </button>
    </div>
  );
}
