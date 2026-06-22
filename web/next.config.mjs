/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: isProd ? 'export' : undefined,
  distDir: isProd ? '../static/webapp' : '.next',
  images: {
    unoptimized: true,
  },
  // Use assetPrefix for production when behind aiohttp
  assetPrefix: isProd ? '' : '',
  // Ensure trailing slashes for static export compatibility
  trailingSlash: true,
};

export default nextConfig;
