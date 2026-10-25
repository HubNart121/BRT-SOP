import type { Role, StepState, StepType, VersionState } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  AUTHOR: 'ผู้เขียน',
  REVIEWER: 'ผู้ตรวจทาน',
  APPROVER: 'ผู้อนุมัติ',
  VIEWER: 'ผู้อ่าน',
};

export const STATE_LABEL: Record<VersionState, string> = {
  DRAFT: 'ฉบับร่าง',
  IN_REVIEW: 'รอตรวจ',
  IN_APPROVAL: 'รออนุมัติ',
  PUBLISHED: 'เผยแพร่แล้ว',
  SUPERSEDED: 'ถูกแทนที่',
};

export const STATE_CHIP: Record<VersionState, string> = {
  DRAFT: 'chip chip-draft',
  IN_REVIEW: 'chip chip-review',
  IN_APPROVAL: 'chip chip-approval',
  PUBLISHED: 'chip chip-published',
  SUPERSEDED: 'chip chip-superseded',
};

export const STEP_TYPE_LABEL: Record<StepType, string> = {
  REVIEW: 'ตรวจทาน',
  APPROVE: 'อนุมัติ',
};

export const STEP_STATE_LABEL: Record<StepState, string> = {
  WAITING: 'รอคิว',
  PENDING: 'รอพิจารณา',
  APPROVED: 'ผ่าน',
  REJECTED: 'ไม่ผ่าน',
  CANCELLED: 'ยกเลิก',
};

export const AUDIT_LABEL: Record<string, string> = {
  SOP_CREATED: 'สร้าง SOP',
  DRAFT_SAVED: 'บันทึกฉบับร่าง',
  DIAGRAM_SAVED: 'บันทึก Flowchart',
  REVISION_CREATED: 'สร้างฉบับแก้ไขใหม่',
  SUBMITTED: 'ส่งตรวจ',
  REVIEW_APPROVED: 'ผ่านการตรวจทาน',
  REVIEW_REJECTED: 'ตรวจทานไม่ผ่าน',
  APPROVAL_REJECTED: 'ไม่อนุมัติ',
  PUBLISHED: 'อนุมัติและเผยแพร่',
  SUPERSEDED: 'ถูกแทนที่ด้วยฉบับใหม่',
  SHARE_LINK_CREATED: 'สร้างลิงก์แชร์',
  SHARE_LINK_REVOKED: 'ยกเลิกลิงก์แชร์',
};

/** Short label for a version: "1.1" for published ones, "r4" for working revisions. */
export function versionName(v: { version_label: string | null; revision_no: number }): string {
  return v.version_label ?? `r${v.revision_no}`;
}

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
const dateTimeFmt = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  // effective_date arrives as YYYY-MM-DD; treat it as a Bangkok calendar date
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

export function displayName(u: { full_name: string; email: string } | null | undefined): string {
  if (!u) return '—';
  return u.full_name?.trim() || u.email;
}
