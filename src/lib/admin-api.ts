import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { currentUser } from './auth';
import { AdminError } from './sign-admin';
import type { AdminUser, Role } from './types';

/** API 라우트용: 권한이 없으면 응답을 돌려준다 */
export async function withAdmin(roles: Role[], fn: (u: AdminUser) => Promise<unknown>): Promise<NextResponse> {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!roles.includes(u.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const out = await fn(u);
    return NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof AdminError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

/** 페이지용: 로그인 안 했으면 로그인 화면으로 */
export async function requirePageUser(roles?: Role[]): Promise<AdminUser> {
  const u = await currentUser();
  if (!u) redirect('/admin/login');
  if (roles && !roles.includes(u.role)) redirect('/admin');
  return u;
}

export const ERROR_KO: Record<string, string> = {
  unauthorized: '로그인이 필요합니다',
  forbidden: '권한이 없습니다',
  unknown_station: '역을 고르세요',
  no_mappings: '왼쪽·오른쪽 방향을 고르세요',
  bad_side: '방향 값이 잘못되었습니다',
  next_not_adjacent: '다음 역이 이 역과 이웃한 역이 아닙니다',
  duplicate_direction: '같은 방향이 왼쪽·오른쪽에 함께 들어갔습니다. 방향이 반대로 입력되지 않았는지 확인하세요',
  need_both_sides: '왼쪽과 오른쪽을 모두 입력하세요',
  spot_required: '지점 이름(한국어)을 입력하세요',
  bad_photo: '사진 형식이 잘못되었습니다',
  photo_too_large: '사진이 너무 큽니다',
  not_pending: '승인 대기 상태가 아닙니다',
  same_person: '등록·수정한 사람과 다른 관리자가 승인해야 합니다 (2인 확인)',
  not_active: '활성 상태의 표지만 부착 확인할 수 있습니다',
  reason_required: '수정 사유를 입력하세요',
  bad_status: '상태 값이 잘못되었습니다',
  not_approved: '승인되지 않은 표지는 활성화할 수 없습니다',
  version_not_found: '해당 버전이 없습니다',
  not_found: '표지가 없습니다',
  bad_action: '알 수 없는 작업입니다',
  server_error: '서버 오류',
};
