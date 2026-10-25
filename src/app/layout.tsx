import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { DialogProvider } from '@/components/Dialogs';
import './globals.css';

const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex',
});

export const metadata: Metadata = {
  title: { default: 'BRT SOP Center', template: '%s — BRT SOP Center' },
  description: 'ระบบจัดทำ ตรวจทาน อนุมัติ และเผยแพร่คู่มือการปฏิบัติงาน (SOP) ของ Blue Ribbon Trading',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B5CD5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={plex.variable}>
      <body>
        <AuthProvider>
          <DialogProvider>{children}</DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
