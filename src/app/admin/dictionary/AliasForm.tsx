'use client';
import { useState } from 'react';
import { LANG_LABEL } from '@/lib/i18n';
import { LANGS } from '@/lib/types';

export function AliasForm({ stations, suggestions }: { stations: { id: string; ko: string }[]; suggestions: string[] }) {
  const [text, setText] = useState('');
  const [stationId, setStationId] = useState('');
  const [lang, setLang] = useState('en');
  const [kind, setKind] = useState('통용 호칭');
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    const r = await fetch('/api/admin/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, stationId, lang, kind }),
    });
    if (!r.ok) return setErr('저장하지 못했습니다');
    location.reload();
  };

  return (
    <section className="card col">
      <h2>표현 추가</h2>
      <label className="field">
        <span>입력된 말</span>
        <input className="input" list="fails" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: Myungdong" />
        <datalist id="fails">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>뜻하는 역</span>
        <select className="input" value={stationId} onChange={(e) => setStationId(e.target.value)}>
          <option value="">역 고르기</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.ko}</option>
          ))}
        </select>
      </label>
      <div className="btns">
        <label className="field">
          <span>언어</span>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>{LANG_LABEL[l]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>종류</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {['표기', '통용 호칭', '음차', '의역', '축약'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="pill-warn small">{err}</p>}
      <button className="btn primary block" disabled={!text || !stationId} onClick={save}>추가</button>
    </section>
  );
}
