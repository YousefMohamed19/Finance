'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, hasSession, logout } from '@/lib/api';
import type { Me } from '@/lib/types';
import PinLock from './PinLock';

interface Session {
  me: Me;
  reloadMe: () => Promise<void>;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

const NAV = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/activity', label: 'Activity', icon: '📜' },
  { href: '/goals', label: 'Goals', icon: '🎯' },
  { href: '/insights', label: 'Insights', icon: '📊' },
  { href: '/settings', label: 'More', icon: '⚙️' },
];

const LOCK_AFTER_MS = 5 * 60 * 1000;

/** Auth gate, PIN lock and navigation for every signed-in page. */
export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [locked, setLocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const reloadMe = useCallback(async () => {
    setMe(await api<Me>('/auth/me'));
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    reloadMe()
      .then(() => setLocked(true))
      .catch(() => router.replace('/login'));
    const onLogout = () => router.replace('/login');
    window.addEventListener('finanse:logout', onLogout);
    return () => window.removeEventListener('finanse:logout', onLogout);
  }, [reloadMe, router]);

  // Lock again when the app has been in the background for a while.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!me) return <div className="center muted">Loading…</div>;
  if (locked && me.hasPin) return <PinLock onUnlock={() => setLocked(false)} onSignOut={signOut} />;

  return (
    <SessionContext.Provider value={{ me, reloadMe, signOut }}>
      <main className="page">{children}</main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? 'active' : ''}>
            <span aria-hidden>{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </SessionContext.Provider>
  );
}
