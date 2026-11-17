/** 익명 통계 집계 (기획서 F11·11장 지표) */
import type { UsageEvent } from './types';

export interface SignStats {
  signId: string;
  scans: number;
  guides: number;
  boards: number;
  successRate: number | null;
  yes: number;
  no: number;
  hearing: number;
  langs: Record<string, number>;
  topDests: [string, number][];
}

export interface Summary {
  total: SignStats;
  bySign: SignStats[];
  searchFails: [string, number][];
  searchFailRate: number | null;
  fakeQr: number;
  days: number;
}

function blank(signId: string): SignStats & { _dest: Record<string, number> } {
  return { signId, scans: 0, guides: 0, boards: 0, successRate: null, yes: 0, no: 0, hearing: 0, langs: {}, topDests: [], _dest: {} };
}

export function summarize(events: UsageEvent[], days: number): Summary {
  const map = new Map<string, ReturnType<typeof blank>>();
  const total = blank('전체');
  const fails: Record<string, number> = {};
  let failCount = 0;
  let fakeQr = 0;
  for (const e of events) {
    if (e.type === 'fake_qr') {
      fakeQr++;
      continue;
    }
    if (e.type === 'search_fail') {
      failCount++;
      const q = (e.query ?? '').trim().toLowerCase();
      if (q) fails[q] = (fails[q] ?? 0) + 1;
      continue;
    }
    const id = e.signId ?? '?';
    if (!map.has(id)) map.set(id, blank(id));
    for (const s of [map.get(id)!, total]) {
      if (e.type === 'scan') {
        s.scans++;
        if (e.lang) s.langs[e.lang] = (s.langs[e.lang] ?? 0) + 1;
        if (e.hearing) s.hearing++;
      } else if (e.type === 'guide') {
        s.guides++;
        if (e.dest) s._dest[e.dest] = (s._dest[e.dest] ?? 0) + 1;
      } else if (e.type === 'board') s.boards++;
      else if (e.type === 'feedback') {
        if (e.value === 'yes') s.yes++;
        else if (e.value === 'no') s.no++;
      }
    }
  }
  const finish = (s: ReturnType<typeof blank>): SignStats => {
    const { _dest, ...rest } = s;
    return {
      ...rest,
      successRate: s.scans ? Math.min(1, s.guides / s.scans) : null,
      topDests: Object.entries(_dest).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  };
  const searches = total.guides + failCount;
  return {
    total: finish(total),
    bySign: [...map.values()].map(finish).sort((a, b) => b.scans - a.scans),
    searchFails: Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 30),
    searchFailRate: searches ? failCount / searches : null,
    fakeQr,
    days,
  };
}
