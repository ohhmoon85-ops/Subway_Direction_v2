/**
 * 결과 화면의 문장 (화면 낭독·소리 안내·큰 카드 문구). 화면 컴포넌트와 분리해 시험할 수 있게 둔다.
 */
import type { GuideView, LegView } from './guide-view';
import { joinNames, t, withStation } from './i18n';
import type { Lang } from './types';

export function towardsText(leg: LegView, lang: Lang): string {
  if (leg.loopDir) return t(lang, leg.loopDir);
  if (leg.terminals.length === 0) return '';
  return t(lang, 'towards', { names: joinNames(lang, leg.terminals.slice(0, 3).map((s) => s.name)) });
}

export function trainText(leg: LegView, lang: Lang): string {
  if (leg.loopDir) return t(lang, leg.loopDir);
  return t(lang, 'trainTowards', { names: joinNames(lang, leg.terminals.slice(0, 2).map((s) => s.name)) });
}

/**
 * 화면 낭독·소리 안내에 쓰는 한 문장.
 *  - 기둥 QR(좌우를 아는 경우): "표지를 마주 보고 왼쪽, 2번째 역, 종로3가입니다."
 *  - 기둥 QR인데 다른 노선 승강장: "이 승강장이 아닙니다. 4호선 사당 방면 승강장으로 이동하세요."
 *  - 내 위치·노선 고르기: "잠실 방면 열차. 6번째 역에서 내리세요. 잠실."
 */
export function guideSentence(g: GuideView, lang: Lang, locationMode: boolean): string {
  const first = g.legs[0];
  const alight = first?.stations.at(-1);
  if (g.sameStation) return t(lang, 'sameStation', { station: withStation(lang, g.dest.name) });
  if (!first || !alight) return t(lang, 'noRoute');
  const nth = t(lang, 'nth', { n: first.stops });
  // 환승이 있으면 첫 구간에서 내리는 역은 환승역 — 목적지로 오해하지 않게 갈아탈 노선과 최종 도착역을 붙인다
  const then = transferTail(g, lang);
  if (first.side) return t(lang, 'sentence', { side: t(lang, first.side), nth, station: alight.name }) + then;
  if (!locationMode && g.oppositePlatform) {
    return `${t(lang, 'wrongPlatform')}. ${t(lang, 'goOppositePlatform', { dir: towardsText(first, lang) })}. ${t(lang, 'getOffNth', { nth })}, ${alight.name}.${then}`;
  }
  if (!locationMode && g.moveToLine) {
    return `${t(lang, 'wrongPlatform')}. ${t(lang, 'goToPlatform', { line: first.lineName, dir: towardsText(first, lang) })}. ${t(lang, 'getOffNth', { nth })}, ${alight.name}.${then}`;
  }
  return `${trainText(first, lang)}. ${t(lang, 'getOffNth', { nth })}. ${alight.name}.${then}`;
}

/** " 정자에서 신분당선(으)로 갈아타세요. 최종 도착: 강남역." (환승 없으면 빈 문자열) */
export function transferTail(g: GuideView, lang: Lang): string {
  const next = g.legs[1];
  if (!next) return '';
  const at = g.legs[0].stations.at(-1)!;
  return ` ${t(lang, 'transferAt', { station: at.name, line: next.lineName })}. ${t(lang, 'finalDestBig', { station: withStation(lang, g.dest.name) })}.`;
}
