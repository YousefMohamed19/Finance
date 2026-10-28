'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { fmt, pct } from '@/lib/money';
import type { Dashboard } from '@/lib/types';
import QuickAdd from '@/components/QuickAdd';
import { useSession } from '@/components/AppShell';
import { api } from '@/lib/api';

interface Notice {
  _id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function Home() {
  const { me } = useSession();
  const { data, reload } = useApi<Dashboard>('/dashboard');
  const notes = useApi<Notice[]>('/notifications');

  async function markRead() {
    await api('/notifications/read', { method: 'POST' });
    await Promise.all([notes.reload(), reload()]);
  }

  const unread = notes.data?.filter((n) => !n.read) ?? [];

  return (
    <>
      <header className="row between">
        <div>
          <p className="muted">Total in all jars</p>
          <h1>{data ? fmt(data.total, me.currency) : '…'}</h1>
        </div>
        <Link href="/jars" className="ghost small button">Edit split</Link>
      </header>

      <QuickAdd jars={data?.jars ?? []} currency={me.currency} onSaved={reload} />

      {!!data?.pendingDrafts && (
        <Link href="/drafts" className="banner">
          📝 {data.pendingDrafts} draft{data.pendingDrafts > 1 ? 's' : ''} waiting for a tap to confirm →
        </Link>
      )}

      {unread.length > 0 && (
        <section className="card">
          <div className="row between">
            <h3>🔔 Notifications</h3>
            <button className="link" onClick={markRead}>Mark all read</button>
          </div>
          {unread.slice(0, 5).map((n) => (
            <p key={n._id} className="notice">{n.message}</p>
          ))}
        </section>
      )}

      <section className="jars">
        {data?.jars.map((j) => (
          <Link key={j._id} href={`/activity?jar=${j._id}`} className={`jar card ${j.balance < 0 ? 'negative' : ''}`}>
            <div className="jar-icon">{j.icon}</div>
            <div className="jar-name">{j.name}</div>
            <div className="jar-balance">{fmt(j.balance, me.currency)}</div>
            <div className="muted small">{pct(j.percentBp)}</div>
          </Link>
        ))}
      </section>

      <section className="row wrap">
        <Link href="/activity?new=transfer" className="ghost button">↔️ Move between jars</Link>
        <Link href="/recurring" className="ghost button">🔁 Subscriptions</Link>
        <Link href="/drafts" className="ghost button">📝 Drafts</Link>
      </section>
    </>
  );
}
