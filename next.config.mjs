/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // Amplify Hosting picks the right runtime automatically; no `output: 'standalone'`
  // needed. Image optimization disabled because Amplify's Next image proxy is
  // separate from Vercel's — keep things simple.
  images: { unoptimized: true },
};

export default nextConfig;
