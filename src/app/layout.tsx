import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '费曼读书助手 | Feynman Reader',
  description: '用费曼学习法深度理解一本书',
  manifest: '/manifest.json',
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

const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; object-src 'none'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.deepseek.com; worker-src 'self' blob:; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests`

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
      <body className="font-sans">{children}</body>
    </html>
  )
}
