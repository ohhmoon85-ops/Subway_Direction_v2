import { describe, expect, it } from 'vitest';
import { search } from '@/lib/search';
import { signSignId, verifySignId } from '@/lib/qr-sign';
import { hashPassword, makeSession, readSession, totpCode } from '@/lib/auth';
import { validateMappings } from '@/lib/sign-admin';
import { pickLang, t } from '@/lib/i18n';

describe('목적지 검색 (다국어 역명 사전)', () => {
  const top = (q: string, lang: any = 'en') => search(q, lang)[0];
  it.each([
    ['景福宮', 'ja', 'station', 'gyeongbokgung'],
    ['Gyeongbokgung Palace', 'en', 'place', 'gyeongbokgung-palace'],
    ['경복궁', 'ko', 'station', 'gyeongbokgung'],
    ['Gyeongbokgung', 'en', 'station', 'gyeongbokgung'],
    ['seoul station', 'en', 'station', 'seoul-station'],
    ['서울역', 'ko', 'station', 'seoul-station'],
    ['홍대', 'ko', 'station', 'hongik-univ'],
    ['DDP', 'en', 'station', 'dongdaemun-history-and-culture-park'],
    ['明洞', 'zh', 'station', 'myeong-dong'],
    ['당고개', 'ko', 'station', 'buramsan'],
    // 전국 데이터에서 이수(7호선)는 따로 있는 역 (4호선 총신대입구와 환승 연결)
    ['이수', 'ko', 'station', 'isu'],
  ])('%s', (q, lang, kind, id) => {
    const r = top(q, lang);
    expect(r?.kind).toBe(kind);
    expect(r?.id).toBe(id);
  });

  it('이수: 7호선 이수와 4호선 총신대입구(별칭) 둘 다 후보', () => {
    const ids = search('이수', 'ko').map((c) => c.id);
    expect(ids).toContain('isu');
    expect(ids).toContain('chongshin-univ');
  });

  it('오타 허용', () => {
    expect(search('Gyeongbokgun', 'en').some((c) => c.stationId === 'gyeongbokgung')).toBe(true);
    expect(search('Sinchonn', 'en').some((c) => c.stationId === 'sinchon')).toBe(true);
  });

  it('장소 → 역·출구', () => {
    const r = search('N Seoul Tower', 'en')[0];
    expect(r.kind).toBe('place');
    expect(r.stationId).toBe('myeong-dong');
    expect(r.exit).toBe('3');
  });

  it('없는 말은 빈 결과', () => {
    expect(search('zzqqxx', 'en')).toEqual([]);
  });
});

describe('QR 서명', () => {
  it('맞는 서명만 통과', () => {
    const sig = signSignId('SC-101-A');
    expect(verifySignId('SC-101-A', sig)).toBe(true);
    expect(verifySignId('SC-101-B', sig)).toBe(false);
    expect(verifySignId('SC-101-A', sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'))).toBe(false);
    expect(verifySignId('SC-101-A', '')).toBe(false);
    expect(verifySignId('SC-101-A', null)).toBe(false);
  });
});

describe('관리자 인증', () => {
  it('세션 위조 방지', () => {
    const tok = makeSession({ username: 'admin', role: 'operator' });
    expect(readSession(tok)?.username).toBe('admin');
    const [p, s] = tok.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'admin', r: 'operator', e: Date.now() + 1e9 })).toString('base64url');
    expect(readSession(`${forged}.${s}`)).toBeNull();
    expect(readSession(`${p}.${s[0] === "A" ? "B" : "A"}${s.slice(1)}`)).toBeNull();
  });
  it('비밀번호 해시 형식', () => {
    expect(hashPassword('x', 'salt')).toMatch(/^salt\.[0-9a-f]{64}$/);
  });
  it('TOTP RFC 6238 시험 벡터', () => {
    // 비밀키 "12345678901234567890" (Base32), T=59s → 287082 (SHA1, 6자리)
    expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  });
});

describe('현장 등록 검증', () => {
  it('이웃이 아닌 다음 역은 거부', () => {
    expect(() => validateMappings('city-hall', [
      { side: 'left', lineId: '1', nextStationId: 'jongno-3-ga' },
      { side: 'right', lineId: '1', nextStationId: 'seoul-station' },
    ])).toThrow('next_not_adjacent');
  });
  it('왼쪽·오른쪽 같은 방향은 거부', () => {
    expect(() => validateMappings('city-hall', [
      { side: 'left', lineId: '1', nextStationId: 'jonggak' },
      { side: 'right', lineId: '1', nextStationId: 'jonggak' },
    ])).toThrow('duplicate_direction');
  });
  it('정상', () => {
    expect(validateMappings('city-hall', [
      { side: 'left', lineId: '1', nextStationId: 'jonggak' },
      { side: 'right', lineId: '1', nextStationId: 'seoul-station' },
    ])).toHaveLength(2);
  });
});

describe('언어', () => {
  it('Accept-Language', () => {
    expect(pickLang('ja-JP,ja;q=0.9,en;q=0.8')).toBe('ja');
    expect(pickLang('zh-CN,zh;q=0.9')).toBe('zh');
    expect(pickLang('de-DE,de;q=0.9')).toBe('en');
    expect(pickLang(null)).toBe('ko');
  });
  it('서수', () => {
    expect(t('en', 'nth', { n: 2 })).toBe('the 2nd stop');
    expect(t('ja', 'nth', { n: 2 })).toBe('2つ目の駅');
    expect(t('fr', 'nth', { n: 1 })).toBe('prochain arrêt'); // 1번째 역 → 다음 역 (2판 고칠 점 2)
  });
});
