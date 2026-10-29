'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmt, toMinor } from '@/lib/money';
import type { Dashboard, Draft } from '@/lib/types';
import { useSession } from '@/components/AppShell';

function DraftCard({ d, jars, onDone }: { d: Draft; jars: Dashboard['jars']; onDone: () => void }) {
  const { me } = useSession();
  const [amount, setAmount] = useState(d.amount ? String(d.amount / 100) : '');
  const [type, setType] = useState(d.type);
  const [counterparty, setCounterparty] = useState(d.counterparty ?? '');
  const [error, setError] = useState('');

  async function confirm(jarKey?: string) {
    const minor = toMinor(amount);
    if (!minor) return setError('Enter an amount');
    try {
      await api(`/drafts/${d._id}/confirm`, {
        method: 'POST',
        body: { type, amount: minor, ...(jarKey ? { jarKey } : {}), ...(counterparty ? { counterparty } : {}) },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function discard() {
    await api(`/drafts/${d._id}`, { method: 'DELETE' });
    onDone();
  }

  return (
    <li className="card stack">
      <div className="row between">
        <q className="small">{d.raw}</q>
        <span className="muted small">{d.origin} · {d.date}</span>
      </div>
      <div className="grid3">
        <select value={type} onChange={(e) => setType(e.target.value as Draft['type'])}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input placeholder={type === 'income' ? 'Source' : 'Destination'} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
      </div>
      <p className="muted small">{d.reasons.join(' · ')}</p>
      {type === 'expense' ? (
        <div className="chips">
          {jars.map((j) => (
            <button key={j._id} className={j.key === d.jarKey ? 'chip selected' : 'chip'} onClick={() => confirm(j.key)}>
              {j.icon} {j.name}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={() => confirm()}>
          ✅ Confirm {toMinor(amount) ? fmt(toMinor(amount)!, me.currency) : ''} income
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <button className="link small" onClick={discard}>Discard</button>
    </li>
  );
}

export default function DraftsPage() {
  const drafts = useApi<Draft[]>('/drafts');
  const dash = useApi<Dashboard>('/dashboard');
  return (
    <>
      <h1>Drafts</h1>
      <p className="muted">Entries I was not sure about. Tap a jar to confirm.</p>
      <ul className="list">
        {drafts.data?.map((d) => <DraftCard key={d._id} d={d} jars={dash.data?.jars ?? []} onDone={drafts.reload} />)}
        {drafts.data?.length === 0 && <p className="muted center-text">All clear 🎉</p>}
      </ul>
    </>
  );
}
