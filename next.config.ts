import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compressão Gzip/Brotli automática
  compress: true,

  // Otimizar imagens (logo PNG)
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 86400, // 24h cache
  },

  // Headers de cache para assets estáticos
  async headers() {
    return [
      {
        source: '/logo-linea-headlin.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },

  // Webpack: otimizar bundle (tree-shaking agressivo)
  webpack(config, { dev }) {
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
      }
    }
    return config
  },
}

export default nextConfig;
