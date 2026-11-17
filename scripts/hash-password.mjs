// 사용법: npm run hash-password -- <비밀번호>
// 출력된 값을 ADMIN_USERS 의 비밀번호해시 자리에 넣는다.  예) admin:operator:<출력값>
import { randomBytes, scryptSync } from 'node:crypto';

const pw = process.argv[2];
if (!pw) {
  console.error('사용법: npm run hash-password -- <비밀번호>');
  process.exit(1);
}
const salt = randomBytes(8).toString('hex');
console.log(`${salt}.${scryptSync(pw, salt, 32).toString('hex')}`);
