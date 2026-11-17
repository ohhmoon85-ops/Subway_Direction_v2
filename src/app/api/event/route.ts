import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import type { EventType } from '@/lib/types';

const ALLOWED: EventType[] = ['scan', 'search_fail', 'feedback', 'board'];

/** 익명 이용 기록. IP·기기 정보는 저장하지 않는다. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !ALLOWED.includes(b.type)) return NextResponse.json({ ok: false }, { status: 400 });
  const clip = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : undefined);
  await getStore()
    .logEvent({
      type: b.type,
      signId: clip(b.signId, 40),
      lang: clip(b.lang, 5),
      dest: clip(b.dest, 80),
      query: clip(b.query, 80),
      hearing: typeof b.hearing === 'boolean' ? b.hearing : undefined,
      value: clip(b.value, 20),
      at: new Date().toISOString(),
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
