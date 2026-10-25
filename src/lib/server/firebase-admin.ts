import 'server-only';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Project used by the local emulators (`npm run emulators`). */
export const EMULATOR_PROJECT_ID = 'demo-brt-sop';

let app: App | undefined;
let firestore: Firestore | undefined;

export const usingEmulators = () => Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/**
 * Firebase Admin SDK.
 * On App Hosting, FIREBASE_CONFIG + Application Default Credentials are provided automatically.
 * Locally the app talks to the emulators (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST).
 */
export function adminApp(): App {
  if (!app) {
    app =
      getApps()[0] ??
      (process.env.FIREBASE_CONFIG
        ? initializeApp()
        : initializeApp({
            projectId:
              process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
              process.env.GOOGLE_CLOUD_PROJECT ||
              (usingEmulators() ? EMULATOR_PROJECT_ID : undefined),
          }));
  }
  return app;
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
