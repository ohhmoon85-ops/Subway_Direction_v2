import { defineConfig } from 'vitest/config';
import { scryptSync } from 'node:crypto';
import path from 'node:path';

// 시험은 실제 배포 환경 변수(Vercel의 QR_SECRET·ADMIN_USERS 등)와 무관하게 항상 같은 값으로 돈다.
const testHash = `testsalt.${scryptSync('admin1234', 'testsalt', 32).toString('hex')}`;

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      QR_SECRET: 'test-only-qr-secret',
      SESSION_SECRET: 'test-only-session-secret',
      ADMIN_USERS: `admin:operator:${testHash}`,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      TRANSFER_PENALTY: '5',
    },
  },
});
