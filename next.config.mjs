/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 위치(내 위치로 시작)·마이크(음성 목적지 입력)는 이 사이트에서만 허용. 다른 사이트에 끼워 넣은 화면(iframe)에서는 막힘.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(self)' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
};

export default nextConfig;
