/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Single origin for the browser: /api/* is proxied to the backend server.
  // In production this is handled by the reverse proxy / ingress instead.
  async rewrites() {
    const backend = process.env.GRIT_API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
