/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  output: 'export',
  images: {
    unoptimized: true,
  },
  assetPrefix: './',
  env: {
    NEXT_PUBLIC_SELF_HOSTED: process.env.NEXT_PUBLIC_SELF_HOSTED || '1',
  },
};

export default nextConfig;
