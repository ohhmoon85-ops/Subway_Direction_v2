import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { GuideApp, type Origin } from '@/components/GuideApp';
import { isLang, pickLang } from '@/lib/i18n';
import { cityPicks, lineBadges, stationPoints } from '@/lib/nearby';
import { getStation, normalizeStationId, stationName } from '@/lib/network';
import { popular } from '@/lib/search';
import { LANGS, type Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {};

/**
 * QR 표지 없이 시작: 내 위치(현재·직전 위치) 또는 도시·노선·역으로 출발역을 정한다.
 *  - /go?from=<역ID>  역 입구 안내문의 공용 QR: 그 역을 출발역으로 바로 연다
 *  - /go?pick=line    첫 화면의 "도시·노선·역 고르기"
 * 역 좌표는 휴대폰으로 내려보내고, 가까운 역 계산은 휴대폰에서 한다 (위치를 서버로 보내지 않음).
 */
export default async function GoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const c = await cookies();
  const h = await headers();
  const lang: Lang = isLang(sp.lang) ? sp.lang : isLang(c.get('lang')?.value) ? (c.get('lang')!.value as Lang) : pickLang(h.get('accept-language'));
  const pop = Object.fromEntries(LANGS.map((l) => [l, popular(l)])) as Record<Lang, ReturnType<typeof popular>>;
  // ?from= 은 앱 역 ID("city-hall")나 JSON 역 키("수도권:시청") 둘 다 받는다
  const from = sp.from ? getStation(normalizeStationId(sp.from)) : undefined;
  const initialOrigin: Origin | undefined = from ? { id: from.id, name: stationName(from, lang), ko: from.ko, lines: from.lines, region: from.region } : undefined;
  return (
    <GuideApp
      initialLang={lang}
      popular={pop}
      points={stationPoints()}
      cities={cityPicks()}
      initialOrigin={initialOrigin}
      startByLine={sp.pick === 'line'}
      badges={lineBadges()}
    />
  );
}
