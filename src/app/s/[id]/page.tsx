import { Icon } from '@/components/Icon';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { GuideApp, type SignClientInfo } from '@/components/GuideApp';
import { isLang, pickLang, t } from '@/lib/i18n';
import { getLine, getStation, stationName } from '@/lib/network';
import { verifySignId } from '@/lib/qr-sign';
import { popular } from '@/lib/search';
import { getStore } from '@/lib/store';
import { lineBadges, stationCoord } from '@/lib/nearby';
import { LANGS, type Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function SignPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const signId = decodeURIComponent(id);
  const c = await cookies();
  const h = await headers();
  const lang: Lang = isLang(sp.lang) ? sp.lang : isLang(c.get('lang')?.value) ? (c.get('lang')!.value as Lang) : pickLang(h.get('accept-language'));

  const store = getStore();
  const sign = await store.getSign(signId).catch(() => undefined);
  const version = Number(sp.v) || sign?.keyVersion || 1;
  const valid = !!sign && verifySignId(sign.id, sp.sig, version);

  if (!valid) {
    store.logEvent({ type: 'fake_qr', signId: signId.slice(0, 40), lang, at: new Date().toISOString() }).catch(() => {});
    return (
      <main className="wrap" lang={lang}>
        <div className="card warn-page col" role="alert">
          <span style={{ color: 'var(--warn)' }}><Icon name="alert" size={40} stroke={1.5} /></span>
          <h1>{sign || sp.sig ? t(lang, 'fakeTitle') : t(lang, 'notFound')}</h1>
          <p>{t(lang, 'fakeBody')}</p>
        </div>
      </main>
    );
  }

  if (sign.status !== 'active') {
    return (
      <main className="wrap" lang={lang}>
        <div className="card col" role="alert">
          <h1>{t(lang, 'inactiveTitle')}</h1>
          <p>{t(lang, 'inactiveBody')}</p>
        </div>
      </main>
    );
  }

  const st = getStation(sign.stationId)!;
  const all = <T,>(f: (l: Lang) => T) => Object.fromEntries(LANGS.map((l) => [l, f(l)])) as Record<Lang, T>;
  const lineIds = [...new Set(sign.mappings.map((m) => m.lineId))];
  const info: SignClientInfo = {
    id: sign.id,
    stationId: st.id,
    mappings: sign.mappings,
    sig: sp.sig!,
    v: version,
    station: all((l) => stationName(st, l)),
    stationKo: st.ko,
    spot: all((l) => sign.spot[l] ?? sign.spot.en ?? sign.spot.ko),
    photo: sign.photo,
    lines: lineIds.map((lid) => {
      const line = getLine(lid)!;
      return { id: lid, num: line.num, abbr: line.abbr, color: line.color, name: line.name };
    }),
    notice: sign.notice && Object.values(sign.notice).some(Boolean) ? sign.notice : undefined,
    coord: stationCoord(st.id),
    region: st.region,
  };
  return <GuideApp sign={info} initialLang={lang} popular={all((l) => popular(l))} badges={lineBadges()} />;
}
