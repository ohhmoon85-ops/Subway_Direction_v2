export const LANGS = ['ko', 'en', 'ja', 'zh', 'zh-TW', 'es', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export type Side = 'left' | 'right';
export type Localized = Partial<Record<Lang, string>> & { ko: string };

export interface Station {
  id: string;
  /** stations.json 의 역 키 ("수도권:시청") */
  key: string;
  /** 화면용 한국어 이름 (동명이역은 "신촌(2호선)") */
  ko: string;
  /** 원래 역명 */
  nameKo: string;
  en: string;
  ja?: string;
  zh?: string;
  hanja?: string;
  aliases: string[];
  lines: string[];
  /** 권역: 수도권 · 부산권 · 대구권 · 광주 · 대전 */
  region: string;
}

export type SegmentKind = 'line' | 'loop' | 'oneway_loop';

export interface Segment {
  name: string;
  kind: SegmentKind;
  stations: string[];
}

export interface Line {
  id: string;
  /** lines.json 의 노선 ID */
  key: string;
  /** 배지 글자 */
  num: string;
  /** 외국어 화면 배지 글자 */
  abbr: string;
  name: Record<Lang, string>;
  color: string;
  region: string;
  /** 순환 구간(kind: loop)이 있는가 */
  loop: boolean;
  /** 구간별 역 순서. 이웃한 두 역이 연결선이 된다. */
  segments: string[][];
  segs: Segment[];
}

export interface SignMapping {
  side: Side;
  lineId: string;
  nextStationId: string;
}

export type SignStatus = 'pending' | 'active' | 'damaged' | 'replace' | 'retired';

export interface Sign {
  id: string;
  stationId: string;
  spot: Localized;
  photo?: string;
  mode: 'platform' | 'exit' | 'rail';
  mappings: SignMapping[];
  status: SignStatus;
  keyVersion: number;
  createdBy: string;
  createdAt: string;
  /** 마지막으로 방향·지점 정보를 고친 사람 (승인은 이 사람과 다른 사람이 해야 함) */
  editedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  installVerifiedBy?: string;
  installVerifiedAt?: string;
  notice?: Partial<Record<Lang, string>>;
  updatedAt: string;
  version: number;
}

export interface Place {
  id: string;
  name: Localized;
  aliases: string[];
  stationId: string;
  exit?: string;
}

export type Role = 'operator' | 'field' | 'viewer';

export interface AdminUser {
  username: string;
  role: Role;
}

export type EventType = 'scan' | 'guide' | 'search_fail' | 'feedback' | 'board' | 'fake_qr';

export interface UsageEvent {
  type: EventType;
  signId?: string;
  lang?: string;
  dest?: string;
  query?: string;
  hearing?: boolean;
  value?: string;
  at: string;
}

export interface SignHistory {
  signId: string;
  version: number;
  editor: string;
  reason: string;
  snapshot: Sign;
  at: string;
}

export interface AliasEntry {
  stationId: string;
  lang: string;
  text: string;
  kind: string;
  addedBy: string;
  at: string;
}
