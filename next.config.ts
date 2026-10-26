import type { NextConfig } from 'next';

// Firebase App Hosting injects FIREBASE_WEBAPP_CONFIG at build time when a Web App is
// linked to the backend. Use it as a fallback for the NEXT_PUBLIC_FIREBASE_* values.
function appHostingWebConfig(): Record<string, string> {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const webConfig = appHostingWebConfig();
const firebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || webConfig.apiKey || '',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || webConfig.authDomain || '',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || webConfig.projectId || '',
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || webConfig.appId || '',
};

const isDev = process.env.NODE_ENV !== 'production';
const authDomain = firebaseEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const authEmulator = isDev ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST : undefined;

const csp = [
  "default-src 'self'",
  // apis.google.com: loader the Firebase Auth SDK uses for the Google sign-in popup
  `script-src 'self' 'unsafe-inline' https://apis.google.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // i.ytimg.com: YouTube thumbnails for clip blocks (dialog preview + printed copies)
  "img-src 'self' data: blob: https://i.ytimg.com",
  "font-src 'self' data:",
  `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com${isDev ? ' ws: wss:' : ''}${
    authEmulator ? ` http://${authEmulator}` : ''
  }`,
  // draw.io editor and YouTube (privacy-enhanced) players are embedded; the auth domain (or the Auth Emulator)
  // serves the Auth SDK helper iframe that completes the Google sign-in popup.
  `frame-src https://embed.diagrams.net https://www.youtube-nocookie.com${authDomain ? ` https://${authDomain}` : ''}${
    authEmulator ? ` http://${authEmulator}` : ''
  }`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: firebaseEnv,
  serverExternalPackages: ['firebase-admin'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      // Public share links carry a secret token in the URL: never leak it via Referer, never index it.
      {
        source: '/share/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/api/share/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
