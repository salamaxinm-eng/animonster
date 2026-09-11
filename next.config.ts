import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean),
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
