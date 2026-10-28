'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { pct } from '@/lib/money';
import type { Dashboard } from '@/lib/types';
import Toast from '@/components/Toast';

interface Version {
  _id: string;
  version: number;
  createdAt: string;
  note?: string;
  shares: { jar: string; percentBp: number }[];
}

export default function JarsPage() {
  const dash = useApi<Dashboard>('/dashboard');
  const history = useApi<Version[]>('/jars/allocations');
  const [values, setValues] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    if (!dash.data) return;
    setValues(Object.fromEntries(dash.data.jars.map((j) => [j._id, String(j.percentBp / 100)])));
    setNames(Object.fromEntries(dash.data.jars.map((j) => [j._id, j.name])));
  }, [dash.data]);

  const bp = (id: string) => Math.round(Number(values[id] || 0) * 100);
  const total = dash.data?.jars.reduce((s, j) => s + bp(j._id), 0) ?? 0;

  async function save() {
    try {
      const jars = dash.data!.jars;
      for (const j of jars) {
        if (names[j._id] && names[j._id] !== j.name) await api(`/jars/${j._id}`, { method: 'PATCH', body: { name: names[j._id] } });
      }
      if (jars.some((j) => bp(j._id) !== j.percentBp)) {
        await api('/jars/allocation', { method: 'PUT', body: { shares: jars.map((j) => ({ jar: j._id, percentBp: bp(j._id) })), ...(note ? { note } : {}) } });
      }
      setToast({ message: 'Saved. New income uses the new split; old income keeps its split.', kind: 'ok' });
      setNote('');
      await Promise.all([dash.reload(), history.reload()]);
    } catch (err) {
      setToast({ message: (err as Error).message, kind: 'error' });
    }
  }

  const jarName = new Map(dash.data?.jars.map((j) => [j._id, `${j.icon} ${j.name}`]) ?? []);

  return (
    <>
      <h1>Your 7 jars</h1>
      <p className="muted">Every income is split by these percentages. Rounding leftovers go to the jar marked ★.</p>
      <section className="card stack">
        {dash.data?.jars.map((j) => (
          <div key={j._id} className="row between">
            <span className="jar-icon">{j.icon}</span>
            <input className="grow" value={names[j._id] ?? ''} onChange={(e) => setNames({ ...names, [j._id]: e.target.value })} />
            {j.remainder && <span title="Receives rounding leftovers">★</span>}
            <input
              className="pct"
              inputMode="decimal"
              value={values[j._id] ?? ''}
              onChange={(e) => setValues({ ...values, [j._id]: e.target.value })}
            />
            <span>%</span>
          </div>
        ))}
        <div className={`row between total ${total === 10000 ? 'ok' : 'bad'}`}>
          <b>Total</b>
          <b>{pct(total)} {total === 10000 ? '✓' : `(${total > 10000 ? 'over' : 'under'} by ${pct(Math.abs(10000 - total))})`}</b>
        </div>
        <input placeholder="Why the change? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="primary" disabled={total !== 10000} onClick={save}>Save</button>
      </section>

      <h3>Split history</h3>
      <ul className="list">
        {history.data?.map((v) => (
          <li key={v._id} className="card">
            <div className="row between">
              <b>Version {v.version}</b>
              <span className="muted small">{new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
            {v.note && <p className="small">{v.note}</p>}
            <p className="muted small">{v.shares.map((s) => `${jarName.get(s.jar) ?? '?'} ${pct(s.percentBp)}`).join(' · ')}</p>
          </li>
        ))}
      </ul>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </>
  );
}
