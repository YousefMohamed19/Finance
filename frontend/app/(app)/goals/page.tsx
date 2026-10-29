'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmt, toMinor } from '@/lib/money';
import type { Dashboard } from '@/lib/types';
import { useSession } from '@/components/AppShell';

interface Goal {
  _id: string;
  name: string;
  jar: string;
  targetAmount: number;
  targetDate?: string;
  saved: number;
  remaining: number;
  progress: number;
  monthlyRate: number;
  monthsToGo: number | null;
  estimatedDate: string | null;
  onTrack: boolean | null;
}

interface WhatIf {
  from: string;
  to: string;
  monthlyShift: number;
  goals: { goal: string; before: { estimatedDate: string | null }; after: { estimatedDate: string | null }; monthsSooner: number | null }[];
}

export default function GoalsPage() {
  const { me } = useSession();
  const goals = useApi<Goal[]>('/goals');
  const dash = useApi<Dashboard>('/dashboard');
  const jars = dash.data?.jars ?? [];
  const [form, setForm] = useState({ name: '', jar: '', amount: '', date: '' });
  const [error, setError] = useState('');
  const [wi, setWi] = useState({ from: '', to: '', percent: '5' });
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const target = toMinor(form.amount);
    const jar = form.jar || jars.find((j) => j.key === 'big')?._id;
    if (!target || !jar) return setError('Name, jar and amount are required');
    try {
      await api('/goals', { method: 'POST', body: { name: form.name, jar, targetAmount: target, ...(form.date ? { targetDate: form.date } : {}) } });
      setForm({ name: '', jar: '', amount: '', date: '' });
      setError('');
      await goals.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    await api(`/goals/${id}`, { method: 'DELETE' });
    await goals.reload();
  }

  async function runWhatIf(e: FormEvent) {
    e.preventDefault();
    try {
      const from = wi.from || jars.find((j) => j.key === 'fun')?._id;
      const to = wi.to || jars.find((j) => j.key === 'future')?._id;
      const percentBp = Math.round(Number(wi.percent) * 100);
      setWhatIf(await api<WhatIf>(`/goals/what-if?from=${from}&to=${to}&percentBp=${percentBp}`));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const jarLabel = (id: string) => {
    const j = jars.find((x) => x._id === id);
    return j ? `${j.icon} ${j.name}` : '';
  };

  return (
    <>
      <h1>Goals</h1>
      <ul className="list">
        {goals.data?.map((g) => (
          <li key={g._id} className="card stack">
            <div className="row between">
              <b>{g.name}</b>
              <span className="muted small">{jarLabel(g.jar)}</span>
            </div>
            <div className="bar"><div style={{ width: `${Math.round(g.progress * 100)}%` }} /></div>
            <div className="row between small">
              <span>{fmt(g.saved, me.currency)} of {fmt(g.targetAmount, me.currency)} ({Math.round(g.progress * 100)}%)</span>
              <span className={g.onTrack === false ? 'error' : 'muted'}>
                {g.remaining <= 0 ? 'Reached 🎉' : g.estimatedDate ? `≈ ${g.estimatedDate}` : 'Jar not growing'}
                {g.targetDate && ` · target ${g.targetDate.slice(0, 7)}`}
              </span>
            </div>
            <div className="row between">
              <span className="muted small">Growing {fmt(g.monthlyRate, me.currency)}/month</span>
              <button className="link small" onClick={() => remove(g._id)}>Delete</button>
            </div>
          </li>
        ))}
        {goals.data?.length === 0 && <p className="muted">No goals yet. Try “Car – 300,000 by 2028”.</p>}
      </ul>

      <form className="card stack" onSubmit={add}>
        <h3>New goal</h3>
        <input placeholder="Name (e.g. Car)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid2">
          <select value={form.jar} onChange={(e) => setForm({ ...form, jar: e.target.value })}>
            <option value="">Jar: 🚗 Big Purchases</option>
            {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
          </select>
          <input inputMode="decimal" placeholder="Target amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <label>Target date (optional)<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <button className="primary">Add goal</button>
      </form>

      <form className="card stack" onSubmit={runWhatIf}>
        <h3>What if…</h3>
        <div className="row wrap">
          I move
          <input className="pct" inputMode="decimal" value={wi.percent} onChange={(e) => setWi({ ...wi, percent: e.target.value })} />% from
          <select value={wi.from} onChange={(e) => setWi({ ...wi, from: e.target.value })}>
            <option value="">🎉 Fun</option>
            {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
          </select>
          to
          <select value={wi.to} onChange={(e) => setWi({ ...wi, to: e.target.value })}>
            <option value="">🚀 Future Project</option>
            {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
          </select>
        </div>
        <button className="ghost">Calculate</button>
        {whatIf && (
          <div className="stack">
            <p className="muted small">That moves about {fmt(whatIf.monthlyShift, me.currency)} a month from {whatIf.from} to {whatIf.to}.</p>
            {whatIf.goals.map((g) => (
              <p key={g.goal}>
                <b>{g.goal}</b>: {g.before.estimatedDate ?? 'never'} → {g.after.estimatedDate ?? 'never'}
                {g.monthsSooner ? ` (${Math.abs(g.monthsSooner)} months ${g.monthsSooner > 0 ? 'earlier' : 'later'})` : ''}
              </p>
            ))}
          </div>
        )}
      </form>
      {error && <p className="error">{error}</p>}
    </>
  );
}
