import type { Metadata } from 'next';
import { Icon } from '@/components/Icon';
import Link from 'next/link';
import { currentUser, usingDevAccounts } from '@/lib/auth';
import { getStore } from '@/lib/store';
import { LogoutButton } from './LogoutButton';
import { ROLE_KO } from '@/lib/admin-labels';

export const metadata: Metadata = { title: '방향 알리미+ 관리', robots: { index: false } };
export const dynamic = 'force-dynamic';


export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const storeKind = getStore().kind;
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <header className="col" style={{ gap: 8 }}>
        <div className="row between">
          <Link href="/admin" className="brand" style={{ textDecoration: 'none' }}>
            <span className="brand-mark" aria-hidden><i /><i /></span>
            방향 알리미+ 관리
          </Link>
          {user && (
            <span className="row small">
              <span className="muted">
                {user.username} · {ROLE_KO[user.role]}
              </span>
              <LogoutButton />
            </span>
          )}
        </div>
        {user && (
          <nav className="admin-nav no-print" aria-label="관리 메뉴">
            <Link className="chip" href="/admin">표지 목록</Link>
            {user.role !== 'viewer' && <Link className="chip" href="/admin/signs/new"><Icon name="plus" size={15} /> 새 표지</Link>}
            <Link className="chip" href="/admin/stats">통계</Link>
            {user.role === 'operator' && <Link className="chip" href="/admin/dictionary">역명 사전</Link>}
          </nav>
        )}
        {storeKind === 'memory' && (
          <p className="pill-warn small no-print">
            Supabase 설정이 없어 메모리 저장소를 쓰고 있습니다. 서버가 다시 시작되면 등록한 표지와 통계가 사라집니다. README의 배포 절차를 확인하세요.
          </p>
        )}
        {usingDevAccounts() && user && <p className="muted small no-print">로컬 개발용 시연 계정으로 로그인했습니다.</p>}
      </header>
      {children}
    </main>
  );
}
