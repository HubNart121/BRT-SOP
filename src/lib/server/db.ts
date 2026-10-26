import 'server-only';
import { randomUUID } from 'node:crypto';
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { Role, StepState, StepType, VersionState } from '@/lib/shared/types';
import { adminDb, usingEmulators } from './firebase-admin';

// ═══ Collections ═══════════════════════════════════════════════════════
// users/{id}                         app users (role, active, linked Firebase uid)
// userEmails/{email}                 uniqueness index → { user_id }
// categories/{id} · categorySlugs/{slug}
// sops/{id} · sopCodes/{CODE}        SOP identity + summary of its published / working version
// sopCodeCounters/{PREFIX}           last running number issued per code prefix (SOP-<CATEGORY CODE>)
// sops/{id}/versions/{versionId}     content per revision
// sops/{id}/versions/{vid}/diagrams/{blockId}
// sops/{id}/audit/{autoId}           append-only audit trail of one SOP
// approvalSteps/{id}                 review / approval steps (queried by assignee)
// shareLinks/{id}                    public links (token stored as SHA-256)
// auditEvents/{autoId}               audit events not tied to a SOP (users, categories)
export const C = {
  users: 'users',
  userEmails: 'userEmails',
  categories: 'categories',
  categorySlugs: 'categorySlugs',
  sops: 'sops',
  sopCodes: 'sopCodes',
  sopCodeCounters: 'sopCodeCounters',
  versions: 'versions',
  diagrams: 'diagrams',
  audit: 'audit',
  steps: 'approvalSteps',
  shares: 'shareLinks',
  auditEvents: 'auditEvents',
} as const;

export interface UserDoc {
  email: string;
  firebase_uid: string | null;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_login_at: Timestamp | null;
}

export interface VersionSummaryDoc {
  id: string;
  state: VersionState;
  revision_no: number;
  label: string | null;
  effective_date: string | null;
  updated_at: Timestamp;
}

export interface SopDoc {
  code: string;
  title: string;
  owner_id: string;
  category_id: string | null;
  published_version_id: string | null;
  active_version_id: string | null;
  /** Summaries so the library can be listed from the sops collection alone. */
  published: VersionSummaryDoc | null;
  active: VersionSummaryDoc | null;
  last_revision_no: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface VersionDoc {
  revision_no: number;
  version_label: string | null;
  state: VersionState;
  title: string;
  /** Tiptap JSON stored as a string (Firestore limits map/array nesting depth). */
  content_json: string;
  content_text: string;
  change_note: string;
  major_change: boolean;
  based_on_version_id: string | null;
  based_on_label: string | null;
  row_version: number;
  last_attempt_no: number;
  created_by: string;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  submitted_at: Timestamp | null;
  published_at: Timestamp | null;
  published_by: string | null;
  effective_date: string | null;
  superseded_at: Timestamp | null;
}

export interface StepDoc {
  sop_id: string;
  version_id: string;
  attempt_no: number;
  step_no: 1 | 2;
  step_type: StepType;
  assignee_id: string;
  state: StepState;
  comment: string;
  decided_by: string | null;
  decided_at: Timestamp | null;
  created_at: Timestamp;
}

export interface DiagramDoc {
  xml_source: string;
  preview_png_data: string | null;
  updated_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CategoryDoc {
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  created_at: Timestamp;
}

export const newId = () => randomUUID();
export const now = () => Timestamp.now();

/** Firestore Timestamp → ISO string (API responses). */
export function iso(t: Timestamp | null | undefined): string | null {
  return t ? t.toDate().toISOString() : null;
}

/** Calendar date in Bangkok (effective dates). */
export function bangkokDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
}

/** Firestore document IDs may not contain "/". */
export const emailKey = (email: string) => encodeURIComponent(email.toLowerCase());

export function data<T>(snap: { exists: boolean; data(): DocumentData | undefined }): T | null {
  return snap.exists ? (snap.data() as T) : null;
}

const globalForDb = globalThis as unknown as { __brtDevSeed?: Promise<void> };

/**
 * Firestore instance. In `next dev` demo mode the emulator is required and is filled with demo data
 * the first time it is empty.
 */
export async function getDb(): Promise<Firestore> {
  const db = adminDb();
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_AUTH_MODE === 'dev') {
    if (!usingEmulators()) {
      throw new Error(
        'โหมดทดลองต้องใช้ Firestore Emulator — รัน `npm run emulators` และตั้ง FIRESTORE_EMULATOR_HOST ใน .env.local',
      );
    }
    if (!globalForDb.__brtDevSeed) {
      globalForDb.__brtDevSeed = (async () => {
        const any = await db.collection(C.users).limit(1).get();
        if (any.empty) {
          console.log('[db] Firestore emulator is empty — loading demo data');
          const { seedDemoData } = await import('./dev-seed');
          await seedDemoData(db);
        }
      })().catch((err) => {
        globalForDb.__brtDevSeed = undefined;
        throw err;
      });
    }
    await globalForDb.__brtDevSeed;
  }
  return db;
}
