import type { Metadata, Viewport } from 'next';
import './globals.css';
import SwRegister from './sw-register';

export const metadata: Metadata = {
  title: 'Finanse – 7 Jars',
  description: 'Split every pound into 7 jars and log spending in one line.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Finanse', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#0f766e', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
