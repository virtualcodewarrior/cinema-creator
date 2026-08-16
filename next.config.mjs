/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  output: 'export',
  images: {
    unoptimized: true,
  },
  assetPrefix: './',
};

export default nextConfig;
