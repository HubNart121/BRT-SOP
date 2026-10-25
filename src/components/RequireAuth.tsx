'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';

/** Client-side gate for pages. API routes enforce authorization on the server independently. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'signedOut' || status === 'blocked') {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname]);

  if (status !== 'signedIn') {
    return (
      <div className="splash" role="status">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-icon.png" alt="" width={56} height={62} />
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">กำลังโหลด…</span>
      </div>
    );
  }
  return <>{children}</>;
}
