// 방향 알리미+ 서비스 워커 (기획서 F10 오프라인)
//  - 빌드된 정적 파일(/_next/static): 캐시 우선. 노선 데이터·계산 코드(src/lib/offline.ts)도 여기 들어 있어,
//    화면을 한 번 열면 저장되고 지하에서 망이 끊겨도 휴대폰에서 경로를 계산한다.
//  - 첫 화면·내 위치 화면·표지 화면: 네트워크 우선, 끊기면 마지막으로 연 화면.
const CACHE = 'dap-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // 빌드된 정적 파일: 캐시 우선
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  // 표지 화면·첫 화면·내 위치 화면: 네트워크 우선, 끊기면 마지막으로 연 화면
  if (url.pathname.startsWith('/s/') || url.pathname === '/' || url.pathname === '/go') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        // /go?pick=line 처럼 주소 뒤 값만 다르면 같은 화면으로 본다
        .catch(() => caches.match(req, { ignoreSearch: url.pathname === '/go' })),
    );
  }
});
