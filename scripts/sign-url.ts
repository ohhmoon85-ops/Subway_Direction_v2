// 사용법: QR_SECRET=... PUBLIC_BASE_URL=https://도메인 npm run sign-url -- SC-101-A
import { signUrl } from '../src/lib/qr-sign';

const id = process.argv[2];
if (!id) {
  console.error('사용법: npm run sign-url -- <표지ID>');
  process.exit(1);
}
console.log(signUrl(process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000', id));
