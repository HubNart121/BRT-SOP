import 'server-only';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let app: App | undefined;

/**
 * Firebase Admin SDK.
 * On App Hosting, FIREBASE_CONFIG + Application Default Credentials are provided automatically.
 * Locally, the project id is enough to verify ID tokens; inviting users additionally needs
 * credentials (`gcloud auth application-default login` or GOOGLE_APPLICATION_CREDENTIALS).
 */
export function adminAuth() {
  if (!app) {
    app =
      getApps()[0] ??
      (process.env.FIREBASE_CONFIG
        ? initializeApp()
        : initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
          }));
  }
  return getAuth(app);
}
