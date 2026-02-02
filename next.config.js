/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用严格模式
  reactStrictMode: true,

  // 实验性功能
  experimental: {
    // 优化包导入
    optimizePackageImports: ['@/components'],
  },

  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // 编译优化
  compiler: {
    // 移除 console.log (生产环境)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // webpack 优化
  webpack: (config, { isServer }) => {
    // 优化 chunk 大小
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        default: false,
        vendors: false,
        commons: {
          name: 'commons',
          chunks: 'all',
          minChunks: 2,
        },
        // PDF.js 单独打包
        pdfjs: {
          test: /[\\/]node_modules[\\/](pdfjs-dist|pdfjs-dist)[\\/]/,
          name: 'pdfjs',
          chunks: 'all',
        },
        // OpenAI 单独打包
        openai: {
          test: /[\\/]node_modules[\\/]openai[\\/]/,
          name: 'openai',
          chunks: 'all',
        },
        // XLSX 单独打包
        xlsx: {
          test: /[\\/]node_modules[\\/]xlsx[\\/]/,
          name: 'xlsx',
          chunks: 'all',
        },
      },
    }

    return config
  },

  // 输出配置
  output: 'standalone',

  // 压缩
  compress: true,

  // 生产环境 source map
  productionBrowserSourceMaps: false,

  // 强制 HTTPS（仅生产环境）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
