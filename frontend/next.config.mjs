/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser only talks to this origin; Next forwards /api to the NestJS backend.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
