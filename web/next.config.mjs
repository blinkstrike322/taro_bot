/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '../static/webapp',
  images: {
    unoptimized: true,
  },
  // Use assetPrefix for production when behind aiohttp
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  // Ensure trailing slashes for static export compatibility
  trailingSlash: true,
};

export default nextConfig;
