/**
 * 표지 등록·수정·승인 규칙 (기획서 8장).
 * - 방향 매핑은 "왼쪽/오른쪽으로 가면 타는 열차의 다음 역"만 고르면 노선·진행 방향이 정해진다.
 * - 등록·수정한 사람과 다른 관리자가 승인해야 활성화된다(2인 확인).
 * - 방향 매핑을 고치면 다시 승인 대기로 돌아가고, 이전 버전은 이력에 남는다.
 */
import { getStation, neighbors, normalizeLineId } from './network';
import type { AdminUser, Lang, Localized, Sign, SignMapping, SignStatus } from './types';
import { getStore } from './store';

export class AdminError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

export function validateMappings(stationId: string, mappings: SignMapping[]): SignMapping[] {
  if (!getStation(stationId)) throw new AdminError('unknown_station');
  if (!Array.isArray(mappings) || mappings.length === 0) throw new AdminError('no_mappings');
  const clean: SignMapping[] = [];
  const seen = new Set<string>();
  for (const raw of mappings) {
    const m = { ...raw, lineId: normalizeLineId(String(raw.lineId)) };
    if (m.side !== 'left' && m.side !== 'right') throw new AdminError('bad_side');
    if (!neighbors(m.lineId, stationId).includes(m.nextStationId)) throw new AdminError('next_not_adjacent');
    const k = `${m.lineId}|${m.nextStationId}`;
    if (seen.has(k)) throw new AdminError('duplicate_direction'); // 같은 방향이 양쪽에 있으면 안 됨
    seen.add(k);
    clean.push({ side: m.side, lineId: m.lineId, nextStationId: m.nextStationId });
  }
  if (!clean.some((m) => m.side === 'left') || !clean.some((m) => m.side === 'right')) throw new AdminError('need_both_sides');
  return clean;
}

function cleanSpot(spot: Partial<Record<Lang, string>>): Localized {
  const out: Partial<Record<Lang, string>> = {};
  for (const [k, v] of Object.entries(spot ?? {})) if (typeof v === 'string' && v.trim()) out[k as Lang] = v.trim().slice(0, 60);
  if (!out.ko) throw new AdminError('spot_required');
  return out as Localized;
}

function cleanPhoto(photo: unknown): string | undefined {
  if (typeof photo !== 'string' || !photo) return undefined;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new AdminError('bad_photo');
  if (photo.length > 400_000) throw new AdminError('photo_too_large');
  return photo;
}

async function nextId(stationId: string, lineId: string): Promise<string> {
  const st = getStation(stationId)!;
  const prefix = st.id.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase().padEnd(2, 'X');
  const signs = await getStore().listSigns();
  for (let n = 1; n < 1000; n++) {
    const id = `${prefix}-${lineId}${String(n).padStart(2, '0')}`;
    if (!signs.some((s) => s.id === id)) return id;
  }
  throw new AdminError('id_exhausted');
}

export async function createSign(user: AdminUser, body: any): Promise<Sign> {
  const stationId = String(body.stationId ?? '');
  const mappings = validateMappings(stationId, body.mappings);
  const now = new Date().toISOString();
  const sign: Sign = {
    id: await nextId(stationId, mappings[0].lineId),
    stationId,
    spot: cleanSpot(body.spot),
    photo: cleanPhoto(body.photo),
    mode: body.mode === 'exit' || body.mode === 'rail' ? body.mode : 'platform',
    mappings,
    status: 'pending',
    keyVersion: 1,
    createdBy: user.username,
    createdAt: now,
    editedBy: user.username,
    updatedAt: now,
    version: 1,
  };
  const store = getStore();
  await store.saveSign(sign);
  await store.addHistory({ signId: sign.id, version: 1, editor: user.username, reason: '신규 등록', snapshot: sign, at: now });
  return sign;
}

export async function updateSign(user: AdminUser, id: string, body: any): Promise<Sign> {
  const store = getStore();
  const sign = await store.getSign(id);
  if (!sign) throw new AdminError('not_found', 404);
  const now = new Date().toISOString();
  const action = String(body.action ?? '');
  let next: Sign = { ...sign };
  let reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';

  switch (action) {
    case 'approve': {
      if (sign.status !== 'pending') throw new AdminError('not_pending');
      if (user.username === sign.editedBy || (!sign.editedBy && user.username === sign.createdBy)) throw new AdminError('same_person', 403);
      next = { ...sign, status: 'active', approvedBy: user.username, approvedAt: now };
      reason ||= '2인 확인 승인';
      break;
    }
    case 'verifyInstall': {
      if (sign.status !== 'active') throw new AdminError('not_active');
      next = { ...sign, installVerifiedBy: user.username, installVerifiedAt: now };
      reason ||= '부착 후 재확인';
      break;
    }
    case 'edit': {
      if (!reason) throw new AdminError('reason_required');
      const mappings = body.mappings ? validateMappings(sign.stationId, body.mappings) : sign.mappings;
      const mappingChanged = JSON.stringify(mappings) !== JSON.stringify(sign.mappings);
      next = {
        ...sign,
        spot: body.spot ? cleanSpot(body.spot) : sign.spot,
        photo: body.photo !== undefined ? cleanPhoto(body.photo) : sign.photo,
        mappings,
        editedBy: user.username,
      };
      if (mappingChanged) {
        // 방향이 바뀌면 다시 2인 확인을 받아야 하고, 부착 확인도 다시 한다
        next.status = 'pending';
        next.approvedBy = undefined;
        next.approvedAt = undefined;
        next.installVerifiedAt = undefined;
        next.installVerifiedBy = undefined;
      }
      break;
    }
    case 'status': {
      const s = body.status as SignStatus;
      if (!['active', 'damaged', 'replace', 'retired'].includes(s)) throw new AdminError('bad_status');
      if (s === 'active' && !sign.approvedBy) throw new AdminError('not_approved');
      next = { ...sign, status: s };
      reason ||= `상태 변경: ${s}`;
      break;
    }
    case 'notice': {
      const notice: Partial<Record<Lang, string>> = {};
      for (const [k, v] of Object.entries(body.notice ?? {})) if (typeof v === 'string' && v.trim()) notice[k as Lang] = v.trim().slice(0, 300);
      next = { ...sign, notice: Object.keys(notice).length ? notice : undefined };
      reason ||= Object.keys(notice).length ? '임시 공지 등록' : '임시 공지 해제';
      break;
    }
    case 'revert': {
      if (!reason) throw new AdminError('reason_required');
      const hist = await store.listHistory(id);
      const target = hist.find((h) => h.version === Number(body.version));
      if (!target) throw new AdminError('version_not_found', 404);
      next = {
        ...sign,
        spot: target.snapshot.spot,
        photo: target.snapshot.photo,
        mappings: target.snapshot.mappings,
        status: 'pending',
        editedBy: user.username,
        approvedBy: undefined,
        approvedAt: undefined,
        installVerifiedAt: undefined,
        installVerifiedBy: undefined,
      };
      reason = `v${target.version}로 복구: ${reason}`;
      break;
    }
    default:
      throw new AdminError('bad_action');
  }
  next.updatedAt = now;
  next.version = sign.version + 1;
  await store.saveSign(next);
  await store.addHistory({ signId: id, version: next.version, editor: user.username, reason, snapshot: next, at: now });
  return next;
}
