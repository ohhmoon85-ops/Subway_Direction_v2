import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/admin-api';
import { directionCode, getLine, getStation, terminalsToward } from '@/lib/network';
import { baseUrl, signUrl } from '@/lib/qr-sign';
import { getStore } from '@/lib/store';
import type { SignMapping } from '@/lib/types';
import { PrintButton } from './PrintButton';

/**
 * 인쇄용 기둥 QR 표지 (A5 세로). 브라우저 인쇄(Ctrl+P)로 바로 출력·PDF 저장.
 *  상단: 역명 · 노선색 띠 / 가운데: QR / 하단: "◀ ○○ 방면 | △△ 방면 ▶", "휴대폰 카메라로 찍으세요"(한국어 + 영어 작게)
 */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser(['operator', 'field']);
  const { id } = await params;
  const sign = await getStore().getSign(decodeURIComponent(id));
  if (!sign) notFound();
  const url = signUrl(baseUrl(), sign.id, sign.keyVersion);
  const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'Q', margin: 0 });
  const st = getStation(sign.stationId)!;
  const line = getLine(sign.mappings[0].lineId)!;

  const dirLabel = (m: SignMapping | undefined) => {
    if (!m) return { ko: '', en: '' };
    const code = directionCode(m.lineId, sign.stationId, m.nextStationId);
    if (code === 'inner') return { ko: '내선순환', en: 'Inner circle' };
    if (code === 'outer') return { ko: '외선순환', en: 'Outer circle' };
    const t = terminalsToward(m.lineId, sign.stationId, m.nextStationId).map((x) => getStation(x)!);
    const next = getStation(m.nextStationId)!;
    const names = t.length ? t.slice(0, 2) : [next];
    return { ko: `${names.map((s) => s.ko).join('·')} 방면`, en: `To ${names.map((s) => s.en).join(' / ')}` };
  };
  const L = dirLabel(sign.mappings.find((m) => m.side === 'left'));
  const R = dirLabel(sign.mappings.find((m) => m.side === 'right'));

  return (
    <div className="col">
      <style>{`
        @page { size: A5 portrait; margin: 0; }
        .a5 {
          width: 148mm; height: 210mm; margin: 0 auto; background: #fff; color: #111;
          display: flex; flex-direction: column; border: 1px solid #ddd; overflow: hidden;
          font-family: 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
        }
        .a5-top { padding: 9mm 10mm 6mm; border-top: 9mm solid var(--line-color); }
        .a5-line { display: inline-flex; align-items: center; gap: 2.5mm; font-size: 14pt; font-weight: 800; }
        .a5-line i { display: inline-grid; place-items: center; min-width: 9mm; height: 9mm; padding: 0 2mm; border-radius: 99px; background: var(--line-color); color: #fff; font-style: normal; font-size: 13pt; }
        .a5-station { font-size: 34pt; font-weight: 900; letter-spacing: -0.03em; line-height: 1.1; margin-top: 3mm; }
        .a5-station-en { font-size: 14pt; color: #555; font-weight: 600; }
        .a5-qr { flex: 1; display: grid; place-items: center; padding: 2mm 0; }
        .a5-qr svg { width: 82mm; height: 82mm; }
        .a5-dirs { display: grid; grid-template-columns: 1fr 1fr; }
        .a5-dirs > div { padding: 5mm 6mm; color: #fff; display: flex; flex-direction: column; gap: 1mm; }
        .a5-dirs .l { background: #1d4fc2; }
        .a5-dirs .r { background: #d4551a; text-align: right; align-items: flex-end; }
        .a5-dirs b { font-size: 17pt; letter-spacing: -0.02em; line-height: 1.2; }
        .a5-dirs span { font-size: 9.5pt; opacity: 0.9; }
        .a5-bottom { padding: 4mm 10mm 6mm; text-align: center; }
        .a5-bottom strong { font-size: 15pt; display: block; }
        .a5-bottom span { font-size: 10pt; color: #555; display: block; }
        .a5-bottom small { font-size: 7.5pt; color: #888; display: block; margin-top: 2mm; }
        @media print {
          html, body { background: #fff !important; }
          .wrap { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          header, .no-print { display: none !important; }
          .a5 { border: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="no-print row between">
        <h1>표지 인쇄 · {sign.id}</h1>
        <PrintButton />
      </div>
      <p className="no-print muted small">A5 세로 · 인쇄 창에서 용지를 A5로, 배율 100%(실제 크기)로 고르세요. 배경 그래픽 인쇄를 켜야 색이 나옵니다.</p>
      {sign.status === 'pending' && <p className="pill-warn no-print">아직 승인 전입니다. 승인 후 인쇄·부착하세요.</p>}

      <div className="a5" style={{ ['--line-color' as string]: line.color }}>
        <div className="a5-top">
          <span className="a5-line">
            <i>{line.num}</i>
            {line.name.ko}
          </span>
          <div className="a5-station">{st.ko.endsWith('역') ? st.ko : `${st.ko}역`}</div>
          <div className="a5-station-en">{st.en}</div>
        </div>
        <div className="a5-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="a5-dirs">
          <div className="l">
            <b>◀ {L.ko}</b>
            <span>{L.en}</span>
          </div>
          <div className="r">
            <b>{R.ko} ▶</b>
            <span>{R.en}</span>
          </div>
        </div>
        <div className="a5-bottom">
          <strong>휴대폰 카메라로 찍으세요</strong>
          <span>Scan with your phone camera</span>
          <small>
            {sign.id} · {sign.spot.ko}
          </small>
        </div>
      </div>
    </div>
  );
}
