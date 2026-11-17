export const STATUS_KO: Record<string, string> = {
  pending: '승인 대기',
  active: '정상',
  damaged: '훼손',
  replace: '교체 필요',
  retired: '철거',
};

export const ROLE_KO = { operator: '운영자', field: '현장 등록자', viewer: '공사 열람자' } as const;
