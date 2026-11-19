/**
 * 저장소. Vercel에서는 파일에 쓸 수 없으므로 Supabase(PostgreSQL)를 쓴다.
 *  - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있으면 Supabase (PostgREST 직접 호출)
 *  - 없으면 로컬 개발용 파일 저장소(.data/)
 *  - Vercel에서 Supabase 설정이 없으면 메모리 저장소(재시작하면 사라짐 → 관리 화면에 경고)
 * 시연 표지(SEED_SIGNS)는 항상 기본으로 깔리고, 저장된 같은 ID가 있으면 그것을 쓴다.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SEED_SIGNS } from '@/data/seed-signs';
import { normalizeLineId, normalizeStationId } from './network';
import type { AliasEntry, Sign, SignHistory, UsageEvent } from './types';

export interface Store {
  kind: 'supabase' | 'file' | 'memory';
  listSigns(): Promise<Sign[]>;
  getSign(id: string): Promise<Sign | undefined>;
  saveSign(sign: Sign): Promise<void>;
  addHistory(h: SignHistory): Promise<void>;
  listHistory(signId: string): Promise<SignHistory[]>;
  logEvent(e: UsageEvent): Promise<void>;
  listEvents(sinceIso: string): Promise<UsageEvent[]>;
  listAliases(): Promise<AliasEntry[]>;
  addAlias(a: AliasEntry): Promise<void>;
}

/**
 * 저장된 표지의 역·노선 ID를 지금 형식으로 맞춘다 (저장된 데이터는 고치지 않고 읽을 때만).
 *  - 시제품의 갈래 노선 ID 1G·2S·2J → 1·2 (갈래를 본선에 합쳤다)
 *  - JSON 역 키("수도권:시청")로 저장된 경우 → 앱 역 ID("city-hall")
 */
export function normalizeSign(s: Sign): Sign {
  const stationId = normalizeStationId(s.stationId);
  const mappings = s.mappings.map((m) => ({ ...m, lineId: normalizeLineId(m.lineId), nextStationId: normalizeStationId(m.nextStationId) }));
  const same = stationId === s.stationId && mappings.every((m, i) => m.lineId === s.mappings[i].lineId && m.nextStationId === s.mappings[i].nextStationId);
  return same ? s : { ...s, stationId, mappings };
}

function mergeSeeds(stored: Sign[]): Sign[] {
  const byId = new Map(SEED_SIGNS.map((s) => [s.id, s]));
  for (const s of stored) byId.set(s.id, normalizeSign(s));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ───────── Supabase
class SupabaseStore implements Store {
  kind = 'supabase' as const;
  constructor(private url: string, private key: string) {}

  /** 네 테이블을 하나씩 읽어 본다 (관리 화면의 저장소 상태 표시용) */
  async check(): Promise<void> {
    for (const t of ['signs', 'sign_history', 'events', 'aliases']) await this.req(`${t}?select=*&limit=1`);
  }

  private async req(pathq: string, init: RequestInit = {}) {
    const res = await fetch(`${this.url}/rest/v1/${pathq}`, {
      ...init,
      cache: 'no-store',
      headers: {
        apikey: this.key,
        // 새 Secret key(sb_secret_…)는 JWT가 아니므로 apikey 헤더로만 보낸다.
        // 예전 service_role 키(eyJ…)일 때만 Authorization 헤더를 함께 보낸다.
        ...(this.key.startsWith('eyJ') ? { Authorization: `Bearer ${this.key}` } : {}),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async listSigns() {
    const rows: { data: Sign }[] = await this.req('signs?select=data');
    return mergeSeeds(rows.map((r) => r.data));
  }
  async getSign(id: string) {
    return (await this.listSigns()).find((s) => s.id === id);
  }
  async saveSign(sign: Sign) {
    await this.req('signs?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: sign.id, data: sign, updated_at: sign.updatedAt }),
    });
  }
  async addHistory(h: SignHistory) {
    await this.req('sign_history', {
      method: 'POST',
      body: JSON.stringify({ sign_id: h.signId, version: h.version, editor: h.editor, reason: h.reason, snapshot: h.snapshot, created_at: h.at }),
    });
  }
  async listHistory(signId: string) {
    const rows = await this.req(`sign_history?sign_id=eq.${encodeURIComponent(signId)}&order=version.desc&limit=50`);
    return (rows as any[]).map((r) => ({ signId: r.sign_id, version: r.version, editor: r.editor, reason: r.reason, snapshot: r.snapshot, at: r.created_at }));
  }
  async logEvent(e: UsageEvent) {
    await this.req('events', {
      method: 'POST',
      body: JSON.stringify({ type: e.type, sign_id: e.signId ?? null, lang: e.lang ?? null, dest: e.dest ?? null, query: e.query ?? null, hearing: e.hearing ?? null, value: e.value ?? null, created_at: e.at }),
    });
  }
  async listEvents(sinceIso: string) {
    const rows = await this.req(`events?created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=20000`);
    return (rows as any[]).map((r) => ({ type: r.type, signId: r.sign_id ?? undefined, lang: r.lang ?? undefined, dest: r.dest ?? undefined, query: r.query ?? undefined, hearing: r.hearing ?? undefined, value: r.value ?? undefined, at: r.created_at }));
  }
  async listAliases() {
    const rows = await this.req('aliases?select=*&limit=5000');
    return (rows as any[]).map((r) => ({ stationId: r.station_id, lang: r.lang, text: r.text, kind: r.kind, addedBy: r.added_by, at: r.created_at }));
  }
  async addAlias(a: AliasEntry) {
    await this.req('aliases', {
      method: 'POST',
      body: JSON.stringify({ station_id: a.stationId, lang: a.lang, text: a.text, kind: a.kind, added_by: a.addedBy, created_at: a.at }),
    });
  }
}

// ───────── 메모리 / 파일
interface Db {
  signs: Sign[];
  history: SignHistory[];
  events: UsageEvent[];
  aliases: AliasEntry[];
}
const empty = (): Db => ({ signs: [], history: [], events: [], aliases: [] });

class LocalStore implements Store {
  private db: Db | null = null;
  constructor(public kind: 'file' | 'memory', private file?: string) {}

  private async load(): Promise<Db> {
    if (this.db) return this.db;
    if (this.kind === 'file' && this.file) {
      try {
        this.db = { ...empty(), ...JSON.parse(await fs.readFile(this.file, 'utf8')) };
      } catch {
        this.db = empty();
      }
    } else this.db = empty();
    return this.db!;
  }
  private async flush() {
    if (this.kind !== 'file' || !this.file || !this.db) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.db, null, 1));
  }

  async listSigns() {
    return mergeSeeds((await this.load()).signs);
  }
  async getSign(id: string) {
    return (await this.listSigns()).find((s) => s.id === id);
  }
  async saveSign(sign: Sign) {
    const db = await this.load();
    db.signs = db.signs.filter((s) => s.id !== sign.id).concat(sign);
    await this.flush();
  }
  async addHistory(h: SignHistory) {
    (await this.load()).history.push(h);
    await this.flush();
  }
  async listHistory(signId: string) {
    return (await this.load()).history.filter((h) => h.signId === signId).sort((a, b) => b.version - a.version);
  }
  async logEvent(e: UsageEvent) {
    const db = await this.load();
    db.events.push(e);
    if (db.events.length > 50000) db.events.splice(0, db.events.length - 50000);
    await this.flush();
  }
  async listEvents(sinceIso: string) {
    return (await this.load()).events.filter((e) => e.at >= sinceIso);
  }
  async listAliases() {
    return (await this.load()).aliases;
  }
  async addAlias(a: AliasEntry) {
    (await this.load()).aliases.push(a);
    await this.flush();
  }
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) store = new SupabaseStore(url.replace(/\/$/, ''), key);
  else if (process.env.VERCEL) store = new LocalStore('memory');
  else store = new LocalStore('file', path.join(process.cwd(), '.data', 'db.json'));
  return store;
}

export interface StoreStatus {
  kind: Store['kind'];
  ok: boolean;
  /** 사람이 읽을 원인과 조치 */
  problem?: string;
}

/** 저장소가 실제로 쓸 수 있는 상태인지 (관리 화면 맨 위에 표시) */
export async function storeStatus(): Promise<StoreStatus> {
  const s = getStore();
  if (!(s instanceof SupabaseStore)) return { kind: s.kind, ok: s.kind === 'file' };
  try {
    await s.check();
    return { kind: 'supabase', ok: true };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    let problem = `연결 오류: ${msg.slice(0, 200)}`;
    if (/supabase 40[13]/.test(msg)) problem = 'Supabase 키가 맞지 않습니다. Vercel의 SUPABASE_SERVICE_ROLE_KEY 에 Secret key(sb_secret_…)를 넣었는지 확인하세요.';
    else if (/PGRST205|42P01|does not exist|Could not find the table/.test(msg)) problem = '테이블이 없습니다. Supabase SQL Editor 에서 supabase/schema.sql 을 실행하세요.';
    else if (/fetch failed|ENOTFOUND|getaddrinfo/.test(msg)) problem = 'Supabase 주소에 접속할 수 없습니다. Vercel의 SUPABASE_URL(https://프로젝트ID.supabase.co)을 확인하세요.';
    return { kind: 'supabase', ok: false, problem };
  }
}

/** 역명 사전 추가분은 1분 캐시 */
let aliasCache: { at: number; list: AliasEntry[] } | null = null;
export async function cachedAliases(): Promise<AliasEntry[]> {
  if (aliasCache && Date.now() - aliasCache.at < 60_000) return aliasCache.list;
  try {
    aliasCache = { at: Date.now(), list: await getStore().listAliases() };
  } catch {
    aliasCache = { at: Date.now(), list: aliasCache?.list ?? [] };
  }
  return aliasCache.list;
}
export function invalidateAliases() {
  aliasCache = null;
}
