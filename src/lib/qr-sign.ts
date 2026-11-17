/** 표지 QR 서명 (HMAC-SHA256). QR에는 주소·표지 ID·서명만 담는다. */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(version: number): string {
  const s = process.env[`QR_SECRET_V${version}`] ?? (version === 1 ? process.env.QR_SECRET : undefined);
  if (s) return s;
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new Error('QR_SECRET is not set');
  }
  return 'dev-only-qr-secret-change-me';
}

export function signSignId(signId: string, version = 1): string {
  return createHmac('sha256', secret(version)).update(`sign:${signId}:v${version}`).digest('base64url').slice(0, 22);
}

export function verifySignId(signId: string, sig: string | null | undefined, version = 1): boolean {
  if (!sig) return false;
  const expected = Buffer.from(signSignId(signId, version));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function signUrl(baseUrl: string, signId: string, version = 1): string {
  const v = version === 1 ? '' : `&v=${version}`;
  return `${baseUrl.replace(/\/$/, '')}/s/${encodeURIComponent(signId)}?sig=${signSignId(signId, version)}${v}`;
}

export function baseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
