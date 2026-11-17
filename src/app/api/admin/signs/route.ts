import { withAdmin } from '@/lib/admin-api';
import { createSign } from '@/lib/sign-admin';
import { getStore } from '@/lib/store';

export async function GET() {
  return withAdmin(['operator', 'field', 'viewer'], async () => ({ signs: await getStore().listSigns() }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withAdmin(['operator', 'field'], async (u) => ({ sign: await createSign(u, body) }));
}
