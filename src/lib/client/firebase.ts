'use client';
import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

/** Demo login (pick a seeded user) — only in `next dev` with NEXT_PUBLIC_AUTH_MODE=dev. */
export const DEV_AUTH = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_AUTH_MODE === 'dev';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_CONFIGURED = Boolean(config.apiKey && config.authDomain && config.projectId);

let auth: Auth | undefined;

export function firebaseAuth(): Auth {
  if (!FIREBASE_CONFIGURED) {
    throw new Error('Firebase is not configured (NEXT_PUBLIC_FIREBASE_* environment variables are missing)');
  }
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config);
    // Email/password only: no popup/redirect resolver, so no Google iframe or gapi script is loaded (fits the CSP).
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
    auth.languageCode = 'th';
    // Local testing against the Firebase Auth Emulator (`npx firebase-tools emulators:start --only auth`).
    const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
    if (emulator && process.env.NODE_ENV !== 'production') {
      connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
    }
  }
  return auth;
}
