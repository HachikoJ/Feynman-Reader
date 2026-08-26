/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  agentRules: false,
  // 应用没有服务端接口，静态导出可直接移除线上 Node 渲染与查询参数缓存穿透面。
  output: 'export',
  trailingSlash: true,

  // 启用严格模式
  reactStrictMode: true,

  // 实验性功能
  experimental: {
    // 优化包导入
    optimizePackageImports: ['@/components'],
  },

  // 图片优化
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // 编译优化
  compiler: {
    // 生产构建移除控制台输出，避免把用户内容和内部状态留在浏览器控制台
    removeConsole: process.env.NODE_ENV === 'production',
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
      },
    }

    return config
  },

  // 压缩
  compress: true,

  // 生产环境 source map
  productionBrowserSourceMaps: false,

}

module.exports = nextConfig
