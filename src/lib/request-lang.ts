/** 서버에서 첫 화면 언어 정하기: 이용자가 고른 언어(쿠키) → 휴대폰 언어(Accept-Language) → 영어 */
import { cookies, headers } from 'next/headers';
import { isLang, pickLang } from './i18n';
import type { Lang } from './types';

export async function requestLang(override?: string): Promise<Lang> {
  if (isLang(override)) return override;
  const c = await cookies();
  const saved = c.get('lang')?.value;
  if (isLang(saved)) return saved;
  const h = await headers();
  return pickLang(h.get('accept-language'));
}
