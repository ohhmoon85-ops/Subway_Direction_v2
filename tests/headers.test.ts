import { describe, expect, it } from 'vitest';
import type { NextConfig } from 'next';
// @ts-expect-error — 설정 파일은 .mjs (타입 선언 없음)
import rawConfig from '../next.config.mjs';

const nextConfig = rawConfig as NextConfig;

/** 보안 헤더가 위치·마이크를 막으면 "내 위치로 시작"과 음성 입력이 조용히 실패한다 (권한 창도 안 뜸). */
describe('Permissions-Policy', () => {
  it('위치·마이크를 이 사이트에서 허용한다', async () => {
    const rules = await nextConfig.headers!();
    const pp = rules.flatMap((r) => r.headers).find((h) => h.key === 'Permissions-Policy')!.value;
    expect(pp).toContain('geolocation=(self)');
    expect(pp).toContain('microphone=(self)');
  });
});
