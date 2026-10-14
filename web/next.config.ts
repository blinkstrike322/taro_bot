import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  devIndicators: false,
  output: isProd ? 'export' : undefined,
  distDir: isProd ? '../static/webapp' : '.next',
  images: { unoptimized: true },
  trailingSlash: true,
  ...(!isProd && process.env.ARCANUM_STUDIO === '1' ? {
    async rewrites() { return [
      { source: '/api/:path*', destination: 'http://127.0.0.1:8097/api/:path*' },
      { source: '/__studio/:path*', destination: 'http://127.0.0.1:8097/__studio/:path*' },
    ]; },
  } : {}),
};

export default nextConfig;
