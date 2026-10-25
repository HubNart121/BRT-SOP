// Types shared between API routes and client pages.

export type Role = 'ADMIN' | 'AUTHOR' | 'REVIEWER' | 'APPROVER' | 'VIEWER';
export const ROLES: Role[] = ['ADMIN', 'AUTHOR', 'REVIEWER', 'APPROVER', 'VIEWER'];

export type VersionState = 'DRAFT' | 'IN_REVIEW' | 'IN_APPROVAL' | 'PUBLISHED' | 'SUPERSEDED';
export type StepState = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StepType = 'REVIEW' | 'APPROVE';

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  pendingCount: number;
}

export interface UserRef {
  id: string;
  full_name: string;
  email: string;
}

export interface AppUserRow extends UserRef {
  role: Role;
  is_active: boolean;
  firebase_linked: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  sop_count: number;
}

export interface SopListItem {
  id: string;
  code: string;
  title: string;
  category: { id: string; name: string } | null;
  published: { id: string; label: string; effective_date: string | null } | null;
  active: { id: string; state: VersionState; revision_no: number } | null;
  updated_at: string;
}

export interface VersionSummary {
  id: string;
  revision_no: number;
  version_label: string | null;
  state: VersionState;
  title: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  effective_date: string | null;
  superseded_at: string | null;
}

export interface Diagram {
  block_id: string;
  xml_source: string;
  preview_png_data: string | null;
  updated_at: string;
}

export interface ApprovalStep {
  id: string;
  attempt_no: number;
  step_no: number;
  step_type: StepType;
  state: StepState;
  comment: string;
  assignee: UserRef;
  decided_by: UserRef | null;
  decided_at: string | null;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  content_json: TiptapDoc;
  change_note: string;
  major_change: boolean;
  row_version: number;
  based_on_label: string | null;
  created_by: UserRef;
  published_by: UserRef | null;
  diagrams: Diagram[];
  steps: ApprovalStep[];
}

export interface AuditEvent {
  event_type: string;
  actor: UserRef | null;
  version_label: string | null;
  revision_no: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SopDetail {
  sop: {
    id: string;
    code: string;
    title: string;
    owner: UserRef;
    category: { id: string; name: string } | null;
    published_version_id: string | null;
    created_at: string;
  };
  versions: VersionSummary[];
  version: VersionDetail;
  permissions: {
    canEdit: boolean;
    canSubmit: boolean;
    canCreateRevision: boolean;
    /** Create / revoke public share links (owner or ADMIN, published SOPs only). */
    canShare: boolean;
    pendingStepId: string | null;
  };
  /** Eligible reviewers / approvers — only when the caller can submit the draft. */
  assignees: { reviewers: UserRef[]; approvers: UserRef[] } | null;
  audit: AuditEvent[] | null;
}

export interface ApprovalTask {
  step_id: string;
  step_no: number;
  step_type: StepType;
  attempt_no: number;
  assigned_to_me: boolean;
  assignee: UserRef;
  sop_id: string;
  code: string;
  version_id: string;
  revision_no: number;
  title: string;
  category: string | null;
  author: UserRef;
  submitted_at: string | null;
  major_change: boolean;
  change_note: string;
  current_label: string | null;
  steps: ApprovalStep[];
  history: ApprovalStep[];
}

export type ShareStatus = 'active' | 'expired' | 'revoked';

export interface ShareLink {
  id: string;
  token_hint: string;
  note: string;
  status: ShareStatus;
  expires_at: string;
  created_at: string;
  created_by_name: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
}

/** Public payload of a shared SOP — names only, no e-mails, no draw.io sources. */
export interface SharedSop {
  code: string;
  title: string;
  version_label: string;
  revision_no: number;
  effective_date: string | null;
  content_json: TiptapDoc;
  diagrams: { block_id: string; preview_png_data: string | null }[];
  prepared_by: string;
  reviewed: { name: string; at: string | null } | null;
  approved: { name: string; at: string | null } | null;
  expires_at: string;
}

export interface DashboardData {
  stats: { accessible: number; published: number; drafts: number; pending: number; categories: number };
  pipeline: Record<'DRAFT' | 'IN_REVIEW' | 'IN_APPROVAL' | 'PUBLISHED', number>;
  recent: SopListItem[];
  tasks: ApprovalTask[];
}

// Minimal Tiptap / ProseMirror JSON shape
export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
}
export interface TiptapDoc extends TiptapNode {
  type: 'doc';
}
