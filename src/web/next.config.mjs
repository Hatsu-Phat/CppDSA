/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint is checked across the monorepo via eslint.config.mjs
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://api:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
