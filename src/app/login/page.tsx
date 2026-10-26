'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { firebaseErrorMessage, isPopupDismissed, useAuth } from '@/components/AuthProvider';
import { IconCheck } from '@/components/icons';
import { initials } from '@/components/ui';
import { DEV_AUTH } from '@/lib/client/firebase';
import { ROLE_LABEL } from '@/lib/shared/labels';
import type { Role } from '@/lib/shared/types';

export default function LoginPage() {
  return (
    <div className="login">
      <section className="login-hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span className="eyebrow">BLUE RIBBON TRADING</span>
          <h1>คู่มือการทำงานฉบับที่อนุมัติแล้ว อยู่ในที่เดียว</h1>
          <p>จัดทำ ตรวจทาน อนุมัติ และเผยแพร่ SOP พร้อม Flowchart และประวัติเวอร์ชันครบถ้วน</p>
        </div>
        <ul>
          {['วาด Flowchart ในตัวด้วย draw.io', 'ตรวจทาน → อนุมัติ → เผยแพร่ อย่างเป็นขั้นตอน', 'ส่งออก PDF พร้อมรหัสและเลขเวอร์ชัน'].map(
            (t) => (
              <li key={t}>
                <IconCheck size={20} style={{ color: '#9CC2FF' }} />
                {t}
              </li>
            ),
          )}
        </ul>
      </section>
      <main className="login-main">
        <Suspense>
          <LoginCard />
        </Suspense>
      </main>
    </div>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginCard() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  useEffect(() => {
    if (auth.status === 'signedIn') router.replace(next);
  }, [auth.status, next, router]);

  return (
    <div className="login-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/brand/logo-full.png" alt="BRT SOP Center" width={210} height={160} />
      {auth.status === 'blocked' ? <Blocked /> : DEV_AUTH ? <DevLogin /> : <GoogleLogin />}
    </div>
  );
}

function GoogleLogin() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (err) {
      if (!isPopupDismissed(err)) setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="head">
        <h2>เข้าสู่ระบบ</h2>
        <p className="muted small">ใช้บัญชี Gmail ที่ผู้ดูแลระบบเชิญเข้าระบบ</p>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ height: 48, fontSize: 16, gap: 12 }}
        onClick={() => void start()}
        disabled={busy}
      >
        <GoogleLogo />
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
      </button>
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
        รับเฉพาะ @gmail.com · ไม่ต้องใช้รหัสผ่าน
      </p>
    </div>
  );
}

/** Google "G" mark for the sign-in button (Google sign-in branding guidelines). */
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Blocked() {
  const { blocked, signOut } = useAuth();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="head">
        <h2>ยังเข้าใช้งานไม่ได้</h2>
      </div>
      <div className="alert alert-warn" role="alert">
        {blocked?.message}
      </div>
      {blocked?.code !== 'NOT_CONFIGURED' && (
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          เลือกบัญชี Google อื่น
        </button>
      )}
    </div>
  );
}

interface DevUser {
  email: string;
  full_name: string;
  role: Role;
}

function DevLogin() {
  const { devSignIn, status } = useAuth();
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dev/users', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setUsers(d.users))
      .catch((e) => setError(`โหลดผู้ใช้ตัวอย่างไม่ได้ (${e.message})`));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="head">
        <h2>เข้าสู่ระบบ (โหมดทดลอง)</h2>
        <p className="muted small">เลือกผู้ใช้ตัวอย่างเพื่อทดสอบสิทธิ์แต่ละบทบาท — ใช้ได้เฉพาะตอนรัน npm run dev</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!users && !error && <div className="loading-block"><span className="spinner" /></div>}
      <div className="dev-users">
        {users?.map((u) => (
          <button
            key={u.email}
            type="button"
            className="dev-user"
            disabled={status === 'loading'}
            onClick={() => void devSignIn(u.email)}
          >
            <span className="avatar">{initials(u.full_name, u.email)}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{u.full_name}</strong>
              <span className="small muted">
                {ROLE_LABEL[u.role]} · {u.email}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
