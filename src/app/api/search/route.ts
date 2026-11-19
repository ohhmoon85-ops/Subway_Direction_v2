import { NextResponse } from 'next/server';
import { REGIONS } from '@/data/network-data';
import { isLang } from '@/lib/i18n';
import { addressCandidates } from '@/lib/kakao';
import { search, splitByRegion } from '@/lib/search';
import { cachedAliases } from '@/lib/store';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const lang = isLang(url.searchParams.get('lang')) ? (url.searchParams.get('lang') as any) : 'ko';
  // 출발역의 권역 (같은 이름 다른 도시면 그 권역을 먼저)
  const r = url.searchParams.get('region') ?? '';
  const region = (REGIONS as readonly string[]).includes(r) ? r : undefined;
  const onlyStation = url.searchParams.get('only') === 'station';
  // 목적지는 출발 권역 것만 남기므로 넉넉히 찾아 둔다
  let results = search(q, lang, await cachedAliases(), onlyStation || region ? 20 : 8, region);
  // 출발역 고르기: 역만
  if (onlyStation) {
    results = results.filter((r) => r.kind === 'station').slice(0, 8);
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  }
  // 사전에서 좋은 후보가 없을 때만 주소 검색 (카카오 결과는 저장하지 않음)
  if (url.searchParams.get('full') === '1' && (results.length === 0 || results[0].score < 55)) {
    results.push(...(await addressCandidates(q, lang)));
  }
  // 목적지: 출발역 권역만 (다른 도시 역은 안내할 수 없으므로 목록에 섞지 않는다)
  if (region) {
    const split = splitByRegion(results, region, lang);
    return NextResponse.json(split, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ results: results.slice(0, 8) }, { headers: { 'Cache-Control': 'no-store' } });
}
