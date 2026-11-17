'use client';
import { useState } from 'react';

export function LoginForm() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, otp: needOtp ? otp : undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.needOtp) return setNeedOtp(true);
    if (!r.ok) return setErr(j.error === 'locked' ? '시도가 너무 많습니다. 10분 뒤 다시 시도하세요.' : j.error === 'otp' ? '인증 코드가 맞지 않습니다.' : '이름 또는 비밀번호가 맞지 않습니다.');
    location.href = '/admin';
  };

  return (
    <form className="col" onSubmit={submit}>
      <label className="field">
        <span>이름</span>
        <input className="input" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required />
      </label>
      {needOtp && (
        <label className="field">
          <span>인증 앱 6자리 코드 (2단계 인증)</span>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value)} required autoFocus />
        </label>
      )}
      {err && <p className="pill-warn small">{err}</p>}
      <button className="btn primary block" disabled={busy}>
        로그인
      </button>
    </form>
  );
}
