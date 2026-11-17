/**
 * 관리자 인증 (기획서 8장·9장).
 * - 계정은 환경 변수 ADMIN_USERS 로 둔다:  이름:역할:비밀번호해시[:TOTP비밀키] 를 ; 로 구분
 *   역할 = operator(운영자) | field(현장 등록자) | viewer(공사 열람자)
 *   비밀번호 해시는 `npm run hash-password -- <비밀번호>` 로 만든다.
 * - TOTP 비밀키(Base32)를 넣으면 2단계 인증(인증 앱 6자리)을 요구한다.
 * - 로컬 개발(Vercel 밖)에서 ADMIN_USERS 가 없으면 시연 계정을 쓴다.
 */
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { AdminUser, Role } from './types';

interface UserRec extends AdminUser {
  hash: string;
  totp?: string;
}

export const SESSION_COOKIE = 'dap_admin';

export function hashPassword(pw: string, salt = Math.random().toString(36).slice(2, 12)): string {
  return `${salt}.${scryptSync(pw, salt, 32).toString('hex')}`;
}

function checkPassword(pw: string, stored: string): boolean {
  const [salt, hex] = stored.split('.');
  if (!salt || !hex) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

let devUsers: UserRec[] | null = null;

export function usingDevAccounts(): boolean {
  return !process.env.ADMIN_USERS && !process.env.VERCEL;
}

function users(): UserRec[] {
  const env = process.env.ADMIN_USERS;
  if (env) {
    return env
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [username, role, hash, totp] = s.split(':');
        return { username, role: role as Role, hash, totp: totp || undefined };
      });
  }
  if (process.env.VERCEL) return [];
  devUsers ??= [
    { username: 'admin', role: 'operator', hash: hashPassword('admin1234', 'devsalt1') },
    { username: 'field1', role: 'field', hash: hashPassword('field1234', 'devsalt2') },
    { username: 'field2', role: 'field', hash: hashPassword('field1234', 'devsalt3') },
    { username: 'metro', role: 'viewer', hash: hashPassword('viewer1234', 'devsalt4') },
  ];
  return devUsers;
}

// ── TOTP (RFC 6238)
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

function checkTotp(secret: string, code: string): boolean {
  const c = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => totpCode(secret, c + d) === code.trim());
}

export function login(username: string, password: string, otp?: string): { user?: AdminUser; needOtp?: boolean; error?: string } {
  const u = users().find((x) => x.username === username);
  if (!u || !checkPassword(password, u.hash)) return { error: 'invalid' };
  if (u.totp) {
    if (!otp) return { needOtp: true };
    if (!checkTotp(u.totp, otp)) return { error: 'otp' };
  }
  return { user: { username: u.username, role: u.role } };
}

// ── 세션 쿠키 (HMAC 서명)
function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.QR_SECRET ?? 'dev-only-session-secret';
}

export function makeSession(user: AdminUser, hours = 12): string {
  const payload = Buffer.from(JSON.stringify({ u: user.username, r: user.role, e: Date.now() + hours * 3600_000 })).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readSession(token: string | undefined): AdminUser | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (d.e < Date.now()) return null;
    // 계정이 삭제되었으면 무효
    if (!users().some((u) => u.username === d.u && u.role === d.r)) return null;
    return { username: d.u, role: d.r };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<AdminUser | null> {
  const c = await cookies();
  return readSession(c.get(SESSION_COOKIE)?.value);
}

export const CAN = {
  editSigns: (r: Role) => r === 'operator' || r === 'field',
  manage: (r: Role) => r === 'operator',
  view: (_r: Role) => true,
};
