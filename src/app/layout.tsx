import type { Metadata, Viewport } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://reader.deline.top'),
  title: '费曼读书助手 | Feynman Reader',
  description: '把一本书讲给 AI 听，直到你真的理解。费曼读书助手是一个本地优先的 AI 深度阅读工作区。',
  applicationName: '费曼读书助手',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/icon-192.png', type: 'image/png', sizes: '192x192' }],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
  },
  openGraph: {
    title: '费曼读书助手 | Feynman Reader',
    description: '把一本书讲给 AI 听，直到你真的理解。',
    url: 'https://reader.deline.top',
    siteName: '费曼读书助手',
    type: 'website',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: '费曼读书助手' }],
  },
  twitter: {
    card: 'summary',
    title: '费曼读书助手 | Feynman Reader',
    description: '把一本书讲给 AI 听，直到你真的理解。',
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fbff' },
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
        <meta name="msapplication-TileColor" content="#315efb" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </head>
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  )
}
