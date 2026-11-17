import { withAdmin } from '@/lib/admin-api';
import { AdminError, updateSign } from '@/lib/sign-admin';
import { getStore } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withAdmin(['operator', 'field', 'viewer'], async () => {
    const store = getStore();
    const sign = await store.getSign(id);
    if (!sign) throw new AdminError('not_found', 404);
    return { sign, history: await store.listHistory(id) };
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // 공지·상태는 운영자도, 방향 수정은 현장 등록자도 가능. 열람자는 불가.
  return withAdmin(['operator', 'field'], async (u) => {
    if ((body.action === 'status' && body.status === 'retired') && u.role !== 'operator') throw new AdminError('forbidden', 403);
    return { sign: await updateSign(u, id, body) };
  });
}
