import { NextResponse } from 'next/server';
import { login, makeSession, SESSION_COOKIE } from '@/lib/auth';

// 아주 단순한 시도 제한 (서버 인스턴스 단위)
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const username = String(b.username ?? '').slice(0, 40);
  const a = attempts.get(username);
  if (a && a.n >= 5 && a.until > Date.now()) return NextResponse.json({ error: 'locked' }, { status: 429 });

  const r = login(username, String(b.password ?? ''), b.otp ? String(b.otp) : undefined);
  if (r.needOtp) return NextResponse.json({ needOtp: true });
  if (!r.user) {
    const cur = attempts.get(username) ?? { n: 0, until: 0 };
    attempts.set(username, { n: cur.n + 1, until: Date.now() + 10 * 60_000 });
    return NextResponse.json({ error: r.error ?? 'invalid' }, { status: 401 });
  }
  attempts.delete(username);
  const res = NextResponse.json({ ok: true, user: r.user });
  res.cookies.set(SESSION_COOKIE, makeSession(r.user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 3600,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
