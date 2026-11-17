import { requirePageUser } from '@/lib/admin-api';
import { SignEditor } from '../../SignEditor';

export default async function NewSignPage() {
  await requirePageUser(['operator', 'field']);
  return (
    <div className="col">
      <h1>새 표지 (현장 등록)</h1>
      <SignEditor />
    </div>
  );
}
