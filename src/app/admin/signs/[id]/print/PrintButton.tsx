'use client';
import { Icon } from '@/components/Icon';
export function PrintButton() {
  return (
    <button className="btn primary" onClick={() => window.print()}>
      <Icon name="printer" size={18} /> 인쇄 / PDF 저장
    </button>
  );
}
