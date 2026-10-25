'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '@/lib/shared/labels';
import { useAuth } from './AuthProvider';
import {
  IconBook,
  IconCheckSquare,
  IconDashboard,
  IconFolder,
  IconHome,
  IconLogout,
  IconMore,
  IconPlus,
  IconUsers,
  IconX,
} from './icons';
import { initials } from './ui';

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: (p: { size?: number }) => ReactNode;
  badge?: number;
  match: (path: string) => boolean;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setSheetOpen(false);
  }, [pathname]);

  if (!me) return null;
  const isAdmin = me.role === 'ADMIN';
  const canAuthor = isAdmin || me.role === 'AUTHOR';
  const reviewsWork = ['ADMIN', 'REVIEWER', 'APPROVER'].includes(me.role) || me.pendingCount > 0;

  const items: NavItem[] = [
    { href: '/', label: 'แดชบอร์ด', short: 'หน้าหลัก', icon: IconDashboard, match: (p) => p === '/' },
    { href: '/sops', label: 'คลังคู่มือ SOP', short: 'คลัง SOP', icon: IconBook, match: (p) => p.startsWith('/sops') },
  ];
  if (reviewsWork) {
    items.push({
      href: '/approvals',
      label: 'คิวตรวจ / อนุมัติ',
      short: 'อนุมัติ',
      icon: IconCheckSquare,
      badge: me.pendingCount,
      match: (p) => p.startsWith('/approvals'),
    });
  }
  items.push({ href: '/categories', label: 'หมวดหมู่', short: 'หมวดหมู่', icon: IconFolder, match: (p) => p.startsWith('/categories') });
  if (isAdmin) {
    items.push({ href: '/users', label: 'ผู้ใช้งาน', short: 'ผู้ใช้', icon: IconUsers, match: (p) => p.startsWith('/users') });
  }

  const current = (i: NavItem) => (i.match(pathname) ? 'page' : undefined);
  const mobilePrimary = items.slice(0, 3);
  const mobileMore = items.slice(3);
  const showFab = canAuthor && (pathname === '/' || pathname === '/sops');

  return (
    <div className="app">
      {/* Desktop sidebar */}
      <nav className="sidebar" aria-label="เมนูหลัก">
        <Link href="/" className="brand" aria-label="BRT SOP Center หน้าหลัก">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="BRT SOP Center" width={168} height={128} />
        </Link>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="nav-link" aria-current={current(i)}>
            <i.icon size={20} />
            {i.label}
            {i.badge ? <span className="badge">{i.badge}</span> : null}
          </Link>
        ))}
        <div className="sidebar-user" style={{ position: 'relative' }}>
          <div className="avatar" aria-hidden="true">
            {initials(me.full_name, me.email)}
          </div>
          <div className="who">
            <strong title={me.email}>{me.full_name || me.email}</strong>
            <span>{ROLE_LABEL[me.role]}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="เมนูผู้ใช้"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <IconMore size={20} />
          </button>
          {menuOpen && (
            <div className="menu-pop" role="menu">
              <div className="small muted" style={{ padding: '6px 12px 8px', overflowWrap: 'anywhere' }}>
                {me.email}
              </div>
              <button type="button" role="menuitem" className="menu-item danger" onClick={() => void signOut()}>
                <IconLogout size={18} />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Tablet rail */}
      <nav className="rail" aria-label="เมนูหลัก">
        <Link href="/" className="brand" aria-label="BRT SOP Center หน้าหลัก">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="BRT SOP Center" width={44} height={48} />
        </Link>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="rail-link" aria-current={current(i)}>
            <i.icon size={22} />
            {i.short}
            {i.badge ? <span className="badge">{i.badge}</span> : null}
          </Link>
        ))}
        <div className="spacer" />
        <button type="button" className="rail-link" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => void signOut()}>
          <IconLogout size={22} />
          ออกจากระบบ
        </button>
        <div className="avatar" title={`${me.full_name || me.email} · ${ROLE_LABEL[me.role]}`}>
          {initials(me.full_name, me.email)}
        </div>
      </nav>

      {/* Mobile top bar */}
      <header className="topbar">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" width={30} height={33} />
          <span>
            <b>BRT</b> SOP Center
          </span>
        </Link>
        <span className="spacer" />
        <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }} aria-label={me.full_name || me.email}>
          {initials(me.full_name, me.email)}
        </div>
      </header>

      <main className="main" id="main">
        {children}
      </main>

      {showFab && (
        <Link href="/sops/new" className="fab" aria-label="สร้าง SOP ใหม่">
          <IconPlus size={26} />
        </Link>
      )}

      {/* Mobile bottom navigation */}
      <nav className="bottomnav" aria-label="เมนูหลัก">
        {mobilePrimary.map((i) => (
          <Link key={i.href} href={i.href} aria-current={current(i)}>
            {i.href === '/' ? <IconHome size={22} /> : <i.icon size={22} />}
            {i.short}
            {i.badge ? <span className="badge">{i.badge}</span> : null}
          </Link>
        ))}
        <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <IconMore size={22} />
          เพิ่มเติม
        </button>
      </nav>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" role="dialog" aria-label="เมนูเพิ่มเติม" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 12px' }}>
              <div className="avatar">{initials(me.full_name, me.email)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{me.full_name || me.email}</div>
                <div className="small muted">
                  {ROLE_LABEL[me.role]} · {me.email}
                </div>
              </div>
              <button type="button" className="icon-btn" aria-label="ปิด" onClick={() => setSheetOpen(false)}>
                <IconX size={20} />
              </button>
            </div>
            {mobileMore.map((i) => (
              <Link key={i.href} href={i.href} className="menu-item" aria-current={current(i)}>
                <i.icon size={20} />
                {i.label}
              </Link>
            ))}
            <button type="button" className="menu-item danger" onClick={() => void signOut()}>
              <IconLogout size={20} />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
