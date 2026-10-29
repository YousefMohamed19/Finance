'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmt, toMinor, today } from '@/lib/money';
import type { Dashboard, Tx } from '@/lib/types';
import { useSession } from '@/components/AppShell';

type Kind = 'expense' | 'income' | 'transfer';

function NewEntry({ kind, jars, onDone }: { kind: Kind; jars: Dashboard['jars']; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [jar, setJar] = useState(jars.find((j) => j.key === 'me')?._id ?? jars[0]?._id ?? '');
  const [toJar, setToJar] = useState(jars[1]?._id ?? '');
  const [counterparty, setCounterparty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const minor = toMinor(amount);
    if (!minor) return setError('Enter an amount');
    const base = { amount: minor, date, ...(note ? { note } : {}) };
    try {
      if (kind === 'transfer') await api('/transactions/transfer', { method: 'POST', body: { ...base, fromJar: jar, toJar } });
      else
        await api(`/transactions/${kind}`, {
          method: 'POST',
          body: { ...base, ...(kind === 'expense' ? { jar } : {}), ...(counterparty ? { counterparty } : {}) },
        });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="grid2">
        <label>Amount<input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {kind !== 'income' && (
        <div className="grid2">
          <label>
            {kind === 'transfer' ? 'From jar' : 'Jar'}
            <select value={jar} onChange={(e) => setJar(e.target.value)}>
              {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
            </select>
          </label>
          {kind === 'transfer' && (
            <label>
              To jar
              <select value={toJar} onChange={(e) => setToJar(e.target.value)}>
                {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {kind !== 'transfer' && (
        <label>
          {kind === 'income' ? 'Source (employer, client…)' : 'Destination (shop, Uber, Netflix…)'}
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </label>
      )}
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {kind === 'income' && <p className="muted small">Income is split across your jars automatically.</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary">Save {kind}</button>
    </form>
  );
}

function Activity() {
  const { me } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const jarFilter = params.get('jar') ?? '';
  const [kind, setKind] = useState<Kind | null>((params.get('new') as Kind) ?? null);
  const [type, setType] = useState('');
  const [deleted, setDeleted] = useState(false);
  const dash = useApi<Dashboard>('/dashboard');
  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: '100' });
    if (jarFilter) q.set('jar', jarFilter);
    if (type) q.set('type', type);
    if (deleted) q.set('deleted', 'true');
    return `/transactions?${q}`;
  }, [jarFilter, type, deleted]);
  const list = useApi<{ total: number; items: Tx[] }>(query);
  const jarById = new Map(dash.data?.jars.map((j) => [j._id, j]) ?? []);

  async function toggleDelete(t: Tx) {
    await api(t.deletedAt ? `/transactions/${t._id}/restore` : `/transactions/${t._id}`, { method: t.deletedAt ? 'POST' : 'DELETE' });
    await list.reload();
  }

  function describe(t: Tx) {
    if (t.type === 'transfer') return `${jarById.get(t.fromJar!)?.name} → ${jarById.get(t.toJar!)?.name}`;
    const where = t.type === 'expense' ? jarById.get(t.jar!) : null;
    return [t.counterparty?.name, where ? `${where.icon} ${where.name}` : 'split across jars'].filter(Boolean).join(' · ');
  }

  return (
    <>
      <header className="row between">
        <h1>Activity</h1>
        {jarFilter && (
          <button className="ghost small" onClick={() => router.replace('/activity')}>
            {jarById.get(jarFilter)?.icon} {jarById.get(jarFilter)?.name} ✕
          </button>
        )}
      </header>
      <div className="row wrap">
        {(['expense', 'income', 'transfer'] as Kind[]).map((k) => (
          <button key={k} className={kind === k ? 'primary small' : 'ghost small'} onClick={() => setKind(kind === k ? null : k)}>
            + {k}
          </button>
        ))}
      </div>
      {kind && dash.data && (
        <NewEntry
          key={kind}
          kind={kind}
          jars={dash.data.jars}
          onDone={() => {
            setKind(null);
            void list.reload();
            void dash.reload();
          }}
        />
      )}
      <div className="row wrap">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="transfer">Transfers</option>
        </select>
        <label className="row inline">
          <input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} /> Deleted
        </label>
      </div>
      <ul className="list">
        {list.data?.items.map((t) => (
          <li key={t._id} className={`card tx ${t.deletedAt ? 'faded' : ''}`}>
            <div>
              <div className={t.type === 'income' ? 'amount in' : t.type === 'expense' ? 'amount out' : 'amount'}>
                {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '↔'} {fmt(t.amount, me.currency)}
              </div>
              <div className="muted small">{describe(t)}</div>
              {t.note && <div className="small">{t.note}</div>}
            </div>
            <div className="right">
              <div className="muted small">{t.date.slice(0, 10)}</div>
              <div className="muted small">{t.origin}</div>
              <button className="link small" onClick={() => toggleDelete(t)}>{t.deletedAt ? 'Restore' : 'Delete'}</button>
            </div>
          </li>
        ))}
        {list.data?.items.length === 0 && <p className="muted center-text">Nothing here yet.</p>}
      </ul>
    </>
  );
}

export default function ActivityPage() {
  return (
    <Suspense>
      <Activity />
    </Suspense>
  );
}
