/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint is checked across the monorepo via eslint.config.mjs
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
