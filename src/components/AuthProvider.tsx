'use client';

import {
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEV_AUTH, FIREBASE_CONFIGURED, firebaseAuth } from '@/lib/client/firebase';
import type { Me } from '@/lib/shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

type Status = 'loading' | 'signedOut' | 'signedIn' | 'blocked';
type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown };

interface AuthState {
  status: Status;
  me: Me | null;
  blocked: { code?: string; message: string } | null;
  firebaseUser: User | null;
  api: <T = unknown>(path: string, init?: ApiInit) => Promise<T>;
  signIn: (email: string, password: string) => Promise<void>;
  devSignIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Reload the Firebase user (e.g. after verifying the e-mail) and fetch the profile again. */
  recheck: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const DEV_KEY = 'brt-sop-dev-user';

function readDevUser(): string | null {
  try {
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}
function writeDevUser(email: string | null) {
  try {
    if (email) localStorage.setItem(DEV_KEY, email);
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [blocked, setBlocked] = useState<AuthState['blocked']>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const devEmail = useRef<string | null>(null);

  const authHeader = useCallback(async (): Promise<string | null> => {
    if (DEV_AUTH) return devEmail.current ? `Dev ${devEmail.current}` : null;
    if (!FIREBASE_CONFIGURED) return null;
    const user = firebaseAuth().currentUser;
    return user ? `Bearer ${await user.getIdToken()}` : null;
  }, []);

  const api = useCallback(
    async <T,>(path: string, init: ApiInit = {}): Promise<T> => {
      const { json, headers: h, ...rest } = init;
      const headers = new Headers(h);
      const auth = await authHeader();
      if (auth) headers.set('authorization', auth);
      let body: BodyInit | undefined;
      if (json !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(json);
      }
      let res: Response;
      try {
        res = await fetch(path, { ...rest, headers, body, cache: 'no-store' });
      } catch {
        throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.error || `เกิดข้อผิดพลาด (${res.status})`, data.code);
      return data as T;
    },
    [authHeader],
  );

  const loadMe = useCallback(async () => {
    try {
      const data = await api<Me>('/api/me');
      setMe(data);
      setBlocked(null);
      setStatus('signedIn');
    } catch (err) {
      setMe(null);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (err.status === 401 && DEV_AUTH) {
          writeDevUser(null);
          devEmail.current = null;
          setStatus('signedOut');
          return;
        }
        setBlocked({ code: err.code, message: err.message });
        setStatus('blocked');
      } else {
        setBlocked({ message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
        setStatus('blocked');
      }
    }
  }, [api]);

  useEffect(() => {
    if (DEV_AUTH) {
      devEmail.current = readDevUser();
      if (devEmail.current) void loadMe();
      else setStatus('signedOut');
      return;
    }
    if (!FIREBASE_CONFIGURED) {
      setBlocked({
        code: 'NOT_CONFIGURED',
        message: 'ยังไม่ได้ตั้งค่า Firebase (NEXT_PUBLIC_FIREBASE_*) — ดูวิธีตั้งค่าใน README',
      });
      setStatus('blocked');
      return;
    }
    let lastUid: string | null = null;
    return onIdTokenChanged(firebaseAuth(), (user) => {
      setFirebaseUser(user);
      if (!user) {
        lastUid = null;
        setMe(null);
        setStatus('signedOut');
        return;
      }
      // Token refreshes fire this listener too; only reload the profile when the user changes.
      if (user.uid !== lastUid) {
        lastUid = user.uid;
        void loadMe();
      }
    });
  }, [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  }, []);

  const devSignIn = useCallback(
    async (email: string) => {
      devEmail.current = email;
      writeDevUser(email);
      setStatus('loading');
      await loadMe();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    setMe(null);
    setBlocked(null);
    if (DEV_AUTH) {
      devEmail.current = null;
      writeDevUser(null);
      setStatus('signedOut');
      return;
    }
    await fbSignOut(firebaseAuth());
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth(), email.trim());
  }, []);

  const resendVerification = useCallback(async () => {
    const user = firebaseAuth().currentUser;
    if (user) await sendEmailVerification(user);
  }, []);

  const recheck = useCallback(async () => {
    if (!DEV_AUTH && FIREBASE_CONFIGURED) {
      const user = firebaseAuth().currentUser;
      if (user) {
        await user.reload();
        await user.getIdToken(true);
      }
    }
    await loadMe();
  }, [loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      blocked,
      firebaseUser,
      api,
      signIn,
      devSignIn,
      signOut,
      refreshMe: loadMe,
      resetPassword,
      resendVerification,
      recheck,
    }),
    [status, me, blocked, firebaseUser, api, signIn, devSignIn, signOut, loadMe, resetPassword, resendVerification, recheck],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Thai message for Firebase Auth client errors. */
export function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    case 'auth/invalid-email':
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    case 'auth/too-many-requests':
      return 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
    case 'auth/user-disabled':
      return 'บัญชีนี้ถูกระงับการใช้งาน';
    case 'auth/network-request-failed':
      return 'เชื่อมต่อเครือข่ายไม่ได้';
    default:
      return err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
  }
}
