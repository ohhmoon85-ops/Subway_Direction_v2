import { redirect } from 'next/navigation';
import { currentUser, usingDevAccounts } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await currentUser()) redirect('/admin');
  const noAccounts = !process.env.ADMIN_USERS && !!process.env.VERCEL;
  return (
    <section className="card col">
      <h1>관리자 로그인</h1>
      {noAccounts && <p className="pill-warn small">ADMIN_USERS 환경 변수가 설정되지 않아 로그인할 수 없습니다.</p>}
      <LoginForm />
      {usingDevAccounts() && (
        <p className="muted small">
          로컬 시연 계정: admin / admin1234 (운영자), field1·field2 / field1234 (현장 등록자), metro / viewer1234 (공사 열람자)
        </p>
      )}
    </section>
  );
}
