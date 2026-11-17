import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from '@/components/SwRegister';
import { t } from '@/lib/i18n';
import { requestLang } from '@/lib/request-lang';

/** 브라우저 탭 제목도 이용자 언어 하나로 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await requestLang();
  return {
    title: t(lang, 'appName'),
    description: t(lang, 'tagline'),
    manifest: '/manifest.webmanifest',
    icons: { icon: '/icon.svg', apple: '/icon.svg' },
    appleWebApp: { capable: true, title: t(lang, 'appName'), statusBarStyle: 'default' },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
};

// 저시력 이용자의 확대를 막지 않기 위해 maximumScale 은 두지 않는다.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 첫 응답부터 이용자 언어로 (화면 낭독기·브라우저 번역 제안이 처음부터 맞는 언어로 인식)
  const lang = await requestLang();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* Pretendard: 필요한 글자만 내려받는 분할 글꼴. 못 받으면 기기 기본 글꼴로 바로 표시 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
