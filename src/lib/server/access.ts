import 'server-only';
import type { AuthUser } from './auth';
import type { Queryable } from './db';

/**
 * Who may read a version:
 *  - ADMIN: everything
 *  - everyone: PUBLISHED and SUPERSEDED versions
 *  - the SOP owner: all versions of their SOP
 *  - reviewers / approvers: versions they were assigned to
 *
 * Returns a SQL boolean expression. `v` / `s` are the sop_versions / sops aliases and
 * `userParam` the placeholder (e.g. "$1") bound to the user id.
 */
export function versionVisibleSql(user: AuthUser, v: string, s: string, userParam: string): string {
  // Still reference the parameter so Postgres can infer its type when nothing else uses it.
  if (user.role === 'ADMIN') return `(${userParam}::uuid is not null)`;
  return `(${v}.state in ('PUBLISHED', 'SUPERSEDED')
    or ${s}.owner_id = ${userParam}
    or exists (select 1 from approval_steps ap_vis where ap_vis.version_id = ${v}.id and ap_vis.assignee_id = ${userParam}))`;
}

export function canCreateSop(user: AuthUser): boolean {
  return user.role === 'ADMIN' || user.role === 'AUTHOR';
}

/** Edit drafts / submit / start a new revision of this SOP. */
export function canAuthorSop(user: AuthUser, sop: { owner_id: string }): boolean {
  return user.role === 'ADMIN' || (user.role === 'AUTHOR' && sop.owner_id === user.id);
}

export const REVIEWER_ROLES = ['REVIEWER', 'APPROVER', 'ADMIN'] as const;
export const APPROVER_ROLES = ['APPROVER', 'ADMIN'] as const;

export async function audit(
  q: Queryable,
  e: { actor: string | null; sop?: string | null; version?: string | null; type: string; meta?: Record<string, unknown> },
): Promise<void> {
  await q.query(
    `insert into audit_events (actor_id, sop_id, version_id, event_type, metadata) values ($1, $2, $3, $4, $5)`,
    [e.actor, e.sop ?? null, e.version ?? null, e.type, JSON.stringify(e.meta ?? {})],
  );
}
