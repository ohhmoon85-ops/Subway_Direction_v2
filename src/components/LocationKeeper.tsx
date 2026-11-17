'use client';
/**
 * 첫 화면(S0)에서:
 *  - 위치 권한이 이미 허용돼 있으면 조용히 현재 위치를 휴대폰에 저장한다 (지하에서 쓸 직전 위치, 기획서 3장).
 *  - 그리고 곧바로 목적지 화면(/go)으로 넘어간다 (기획서 5장: 권한을 허용한 이용자는 2단계).
 *    로고를 눌러 첫 화면으로 돌아온 경우에 다시 넘기지 않도록, 한 번 연 창(탭)에서는 한 번만 넘긴다.
 * 위치는 서버로 보내지 않는다.
 */
import { useEffect } from 'react';
import { permissionState, rememberQuietly } from '@/lib/location';

const AUTO_KEY = 'dap_auto_started';

export function LocationKeeper({ autoStart = true }: { autoStart?: boolean }) {
  useEffect(() => {
    let moved = false;
    permissionState().then((s) => {
      if (s !== 'granted') return;
      if (autoStart) {
        try {
          if (!sessionStorage.getItem(AUTO_KEY)) {
            sessionStorage.setItem(AUTO_KEY, '1');
            moved = true;
            location.replace('/go');
            return;
          }
        } catch {
          /* sessionStorage를 못 쓰면 넘기지 않는다 (되돌아오기 반복 방지) */
        }
      }
      if (!moved) rememberQuietly();
    });
  }, [autoStart]);
  return null;
}
