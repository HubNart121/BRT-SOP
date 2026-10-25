import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { VersionState } from '@/lib/shared/types';
import type { AuthUser } from './auth';
import { C, now } from './db';

/**
 * Who may read a version:
 *  - ADMIN: everything
 *  - everyone: PUBLISHED and SUPERSEDED versions
 *  - the SOP owner: all versions of their SOP
 *  - reviewers / approvers: versions they were assigned to (any attempt)
 */
export function canSeeVersion(
  user: AuthUser,
  sop: { owner_id: string },
  version: { id: string; state: VersionState },
  assignedVersionIds: Set<string>,
): boolean {
  return (
    user.role === 'ADMIN' ||
    version.state === 'PUBLISHED' ||
    version.state === 'SUPERSEDED' ||
    sop.owner_id === user.id ||
    assignedVersionIds.has(version.id)
  );
}

/** Versions the user was ever assigned to review / approve. */
export async function assignedVersionIds(db: Firestore, user: AuthUser): Promise<Set<string>> {
  const snap = await db.collection(C.steps).where('assignee_id', '==', user.id).select('version_id').get();
  return new Set(snap.docs.map((d) => d.get('version_id') as string));
}

export function canCreateSop(user: AuthUser): boolean {
  return user.role === 'ADMIN' || user.role === 'AUTHOR';
}

/** Edit drafts / submit / start a new revision / share this SOP. */
export function canAuthorSop(user: AuthUser, sop: { owner_id: string }): boolean {
  return user.role === 'ADMIN' || (user.role === 'AUTHOR' && sop.owner_id === user.id);
}

export const REVIEWER_ROLES = ['REVIEWER', 'APPROVER', 'ADMIN'] as const;
export const APPROVER_ROLES = ['APPROVER', 'ADMIN'] as const;

/** Append an audit event (inside a transaction). SOP events live under the SOP, others globally. */
export function audit(
  db: Firestore,
  t: Transaction,
  e: { actor: string | null; sop?: string | null; version?: string | null; type: string; meta?: Record<string, unknown> },
): void {
  const ref = e.sop
    ? db.collection(C.sops).doc(e.sop).collection(C.audit).doc()
    : db.collection(C.auditEvents).doc();
  t.create(ref, {
    actor_id: e.actor,
    version_id: e.version ?? null,
    event_type: e.type,
    metadata: e.meta ?? {},
    created_at: now(),
  });
}
