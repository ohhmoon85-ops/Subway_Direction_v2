import { cookies, headers } from 'next/headers';
import { HomeView, type DemoSign } from '@/components/HomeView';
import { REGION_NAMES, REGIONS } from '@/data/network-data';
import { SEED_SIGNS } from '@/data/seed-signs';
import { isLang, pickLang, withStation } from '@/lib/i18n';
import { getLine, getStation, stationName } from '@/lib/network';
import { signUrl } from '@/lib/qr-sign';
import { LANGS, type Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';

function demoLinks(): DemoSign[] | null {
  try {
    return SEED_SIGNS.map((s) => {
      const line = getLine(s.mappings[0].lineId)!;
      const st = getStation(s.stationId)!;
      const all = (f: (l: Lang) => string) => Object.fromEntries(LANGS.map((l) => [l, f(l)])) as Record<Lang, string>;
      return {
        id: s.id,
        href: signUrl('', s.id, s.keyVersion),
        station: all((l) => withStation(l, stationName(st, l))),
        stationKo: st.ko,
        spot: all((l) => s.spot[l] ?? s.spot.en ?? s.spot.ko),
        num: line.num,
        color: line.color,
      };
    });
  } catch {
    return null; // QR_SECRET 미설정 등
  }
}

export default async function Home() {
  const c = await cookies();
  const h = await headers();
  const lang: Lang = isLang(c.get('lang')?.value) ? (c.get('lang')!.value as Lang) : pickLang(h.get('accept-language'));
  const showDemo = process.env.SHOW_DEMO !== 'false';
  const demos = showDemo ? demoLinks() : null;
  const regionLine = Object.fromEntries(LANGS.map((l) => [l, REGIONS.map((r) => REGION_NAMES[r][l]).join(' · ')])) as Record<Lang, string>;
  return <HomeView initialLang={lang} demos={demos} demoError={showDemo && !demos} regionLine={regionLine} />;
}
