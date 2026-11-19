/**
 * 목적지 입력: 이용자가 자기 언어로 치거나 말한 역명을 찾는다 (음성 인식 결과도 같은 검색을 거친다).
 * 예: 서울역의 프랑스인이 "gare d'Anguk"을 치면 안국역이 맨 위에 나와야 한다.
 */
import { describe, expect, it } from 'vitest';
import { foldVoicing, hangulToJaRomaji, kanaToRomaji } from '@/lib/kana';
import { stationByKo } from '@/lib/network';
import { search } from '@/lib/search';
import type { Lang } from '@/lib/types';

const id = (ko: string, region = '수도권') => stationByKo(ko, region)!.id;
const top = (q: string, lang: Lang) => search(q, lang, [], 8)[0]?.stationId;

describe('각 언어로 친 역명 → 맨 위 후보', () => {
  const cases: [Lang, string, string, string?][] = [
    ['fr', 'Anguk', '안국'],
    ['fr', "gare d'Anguk", '안국'],
    ['fr', 'Gare d’Anguk', '안국'],
    ['fr', 'station Anguk', '안국'],
    ['fr', 'Angouk', '안국'],
    ['fr', 'Gare de Séoul', '서울역'],
    ['fr', 'Hôtel de ville', '시청'],
    ['es', 'Estación Anguk', '안국'],
    ['es', 'estación de Seúl', '서울역'],
    ['es', 'Estación del Ayuntamiento', '시청'],
    ['en', 'Anguk Station', '안국'],
    ['en', 'Hongik Univ', '홍대입구'],
    ['ja', '安国', '안국'],
    ['ja', 'アングク', '안국'],
    ['ja', 'あんぐく', '안국'],
    ['ja', 'アングク駅', '안국'],
    ['ja', 'ミョンドン', '명동'],
    ['ja', 'カンナム', '강남'],
    ['ja', 'チョンジャ', '정자'],
    ['ja', 'ヨイド', '여의도'],
    ['ja', 'ウルチロイプク', '을지로입구'],
    ['ja', 'クァンファムン', '광화문'],
    ['ja', 'ヘウンデ', '해운대', '부산권'],
    ['zh', '安国站', '안국'],
    ['zh-TW', '安國站', '안국'],
    ['zh', '首尔站', '서울역'],
    ['ko', '안국역', '안국'],
    ['ko', '앙국', '안국'], // 받침 오타
    ['ko', '갱남', '강남'], // 모음 오타
  ];
  for (const [lang, q, ko, region] of cases) {
    it(`[${lang}] ${q} → ${ko}`, () => expect(top(q, lang)).toBe(id(ko, region)));
  }
});

describe('일본식 발음 만들기', () => {
  it('한글 역명 → 가나와 같은 로마자', () => {
    expect(hangulToJaRomaji('안국')).toBe(kanaToRomaji('アングク'));
    expect(hangulToJaRomaji('서울')).toBe(kanaToRomaji('ソウル'));
    expect(hangulToJaRomaji('명동')).toBe(kanaToRomaji('ミョンドン'));
    expect(hangulToJaRomaji('여의도')).toBe(kanaToRomaji('ヨイド'));
    expect(foldVoicing(hangulToJaRomaji('을지로입구'))).toBe(foldVoicing(kanaToRomaji('ウルチロイプク')));
  });
  it('일본어로 같은 표기가 되는 역은 후보로 함께 보여 준다 (신촌·신천)', () => {
    const ids = search('シンチョン', 'ja', [], 8).map((c) => c.stationId);
    expect(ids).toContain(id('신촌'));
  });
});
