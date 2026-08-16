/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  env: {
    NEXT_PUBLIC_SELF_HOSTED: process.env.NEXT_PUBLIC_SELF_HOSTED || '0',
    DENO_BACKEND_URL: process.env.DENO_BACKEND_URL || '',
  },
};

export default nextConfig;
