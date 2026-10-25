'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { firebaseErrorMessage, useAuth } from '@/components/AuthProvider';
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
      {auth.status === 'blocked' ? <Blocked /> : DEV_AUTH ? <DevLogin /> : <PasswordLogin />}
    </div>
  );
}

function PasswordLogin() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน?" อีกครั้ง');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('หากอีเมลนี้มีอยู่ในระบบ จะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่ภายในไม่กี่นาที');
    } catch (err) {
      setError(firebaseErrorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }} noValidate>
      <div className="head">
        <h2>เข้าสู่ระบบ</h2>
        <p className="muted small">ใช้อีเมลที่บริษัทเชิญเข้าระบบ</p>
      </div>
      <label className="field">
        อีเมล
        <input
          className="input"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="field">
        รหัสผ่าน
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="alert alert-info" role="status">
          {info}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block" style={{ height: 48, fontSize: 16 }} disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
      <button type="button" className="btn-link" style={{ alignSelf: 'center' }} onClick={forgot}>
        ลืมรหัสผ่าน?
      </button>
    </form>
  );
}

function Blocked() {
  const { blocked, signOut, resendVerification, recheck } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const needsVerify = blocked?.code === 'EMAIL_NOT_VERIFIED';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="head">
        <h2>ยังเข้าใช้งานไม่ได้</h2>
      </div>
      <div className="alert alert-warn" role="alert">
        {blocked?.message}
      </div>
      {needsVerify && (
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                await resendVerification();
                setMsg('ส่งอีเมลยืนยันแล้ว กรุณาเปิดลิงก์ในอีเมล แล้วกด "ตรวจสอบอีกครั้ง"');
              } catch (err) {
                setMsg(firebaseErrorMessage(err));
              }
            }}
          >
            ส่งอีเมลยืนยันตัวตน
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void recheck()}>
            ตรวจสอบอีกครั้ง
          </button>
        </>
      )}
      {msg && <div className="alert alert-info">{msg}</div>}
      {blocked?.code !== 'NOT_CONFIGURED' && (
        <button type="button" className="btn-link" style={{ alignSelf: 'center' }} onClick={() => void signOut()}>
          ใช้บัญชีอื่น
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
