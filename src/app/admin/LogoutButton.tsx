'use client';
export function LogoutButton() {
  return (
    <button
      className="chip"
      onClick={async () => {
        await fetch('/api/admin/login', { method: 'DELETE' });
        location.href = '/admin/login';
      }}
    >
      로그아웃
    </button>
  );
}
