import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.deline.top'),
  title: '费曼读书助手 | Feynman Reader',
  description: '用费曼学习法深度理解一本书',
  manifest: '/manifest.json',
  openGraph: {
    title: '费曼读书助手 | Feynman Reader',
    description: '把一本书讲给 AI 听，直到 3 个角色都问不倒你。',
    url: 'https://www.deline.top',
    siteName: 'Feynman Reader',
    type: 'website',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'Feynman Reader' }],
  },
  twitter: {
    card: 'summary',
    title: '费曼读书助手 | Feynman Reader',
    description: '把一本书讲给 AI 听，直到 3 个角色都问不倒你。',
    images: ['/icon-512.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '费曼读书助手'
  },
  formatDetection: {
    telephone: false,
  },
}

// P1 修复：将 viewport 和 themeColor 移到单独的导出
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

const scriptSources = process.env.NODE_ENV === 'development'
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'"

const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; object-src 'none'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.deepseek.com https://tokendance.space; worker-src 'self' blob:; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests`

const localCacheRecoveryScript = `
(() => {
  if (!['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return;
  const marker = 'feynman-local-cache-reset-v4';
  if (window.sessionStorage.getItem(marker) === 'done') return;
  window.sessionStorage.setItem(marker, 'done');
  const tasks = [];
  if ('serviceWorker' in navigator) {
    tasks.push(navigator.serviceWorker.getRegistrations().then(registrations =>
      Promise.all(registrations.map(registration => registration.unregister())).then(() => registrations.length > 0)
    ));
  }
  if ('caches' in window) {
    tasks.push(caches.keys().then(cacheNames => {
      const appCaches = cacheNames.filter(name => name.startsWith('feynman-'));
      return Promise.all(appCaches.map(name => caches.delete(name))).then(() => appCaches.length > 0);
    }));
  }
  Promise.all(tasks).then(results => {
    if (results.some(Boolean)) window.location.reload();
  });
})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={contentSecurityPolicy}
        />
        {process.env.NODE_ENV === 'development' && (
          <script dangerouslySetInnerHTML={{ __html: localCacheRecoveryScript }} />
        )}
        {/* P1 新增：PWA 支持 */}
        <link rel="icon" href="/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="费曼读书助手" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="费曼读书助手" />
        <meta name="msapplication-TileColor" content="#0284c7" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </head>
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  )
}
