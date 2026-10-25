'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATE_CHIP, STATE_LABEL } from '@/lib/shared/labels';
import type { SopListItem, VersionState } from '@/lib/shared/types';

export function StateChip({ state, children }: { state: VersionState; children?: React.ReactNode }) {
  return <span className={STATE_CHIP[state]}>{children ?? STATE_LABEL[state]}</span>;
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          ลองใหม่
        </button>
      )}
    </div>
  );
}

/** Chip text for a library row: the version people use + the working copy if visible. */
export function sopStatus(s: SopListItem): { state: VersionState; label: string; version: string } {
  if (s.active && s.active.state !== 'DRAFT') {
    return {
      state: s.active.state,
      label: STATE_LABEL[s.active.state],
      version: s.published ? `${s.published.label} → r${s.active.revision_no}` : `r${s.active.revision_no}`,
    };
  }
  if (s.published) {
    return {
      state: 'PUBLISHED',
      label: s.active ? 'เผยแพร่ · มีร่างแก้ไข' : STATE_LABEL.PUBLISHED,
      version: s.published.label,
    };
  }
  return { state: 'DRAFT', label: STATE_LABEL.DRAFT, version: `r${s.active?.revision_no ?? 1}` };
}

type Toast = { msg: string; kind: 'ok' | 'error' } | null;

export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    clearTimeout(timer.current);
    setToast({ msg, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast ? (
    <div className={`toast${toast.kind === 'error' ? ' error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.msg}
    </div>
  ) : null;
  return { show, node };
}

export function initials(name: string, email: string): string {
  // Skip Thai leading vowels (เ แ โ ใ ไ) so "เมธา" shows "ม"
  const src = (name || email).trim().replace(/^[เ-ไ]/, '');
  return src ? src.charAt(0).toUpperCase() : '?';
}
