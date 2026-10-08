import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  devIndicators: false,
  output: isProd ? 'export' : undefined,
  distDir: isProd ? '../static/webapp' : '.next',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
