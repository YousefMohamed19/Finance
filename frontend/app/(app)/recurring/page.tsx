'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmt, toMinor, today } from '@/lib/money';
import type { Dashboard } from '@/lib/types';
import { useSession } from '@/components/AppShell';

interface Rule {
  _id: string;
  name: string;
  type: 'income' | 'expense';
  amount: number;
  jar?: string;
  interval: 'weekly' | 'monthly' | 'yearly';
  nextDate: string;
  remindDaysBefore: number;
  active: boolean;
}

export default function RecurringPage() {
  const { me } = useSession();
  const rules = useApi<Rule[]>('/recurring');
  const dash = useApi<Dashboard>('/dashboard');
  const jars = dash.data?.jars ?? [];
  const [form, setForm] = useState({ name: '', type: 'expense', amount: '', jar: '', interval: 'monthly', startDate: today(), remind: '2' });
  const [error, setError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    const amount = toMinor(form.amount);
    if (!amount) return setError('Enter an amount');
    const jar = form.jar || jars.find((j) => j.key === 'fun')?._id;
    try {
      await api('/recurring', {
        method: 'POST',
        body: {
          name: form.name,
          type: form.type,
          amount,
          ...(form.type === 'expense' ? { jar } : {}),
          counterparty: form.name,
          interval: form.interval,
          startDate: form.startDate,
          remindDaysBefore: Number(form.remind),
        },
      });
      setForm({ ...form, name: '', amount: '' });
      setError('');
      await rules.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(r: Rule) {
    await api(`/recurring/${r._id}`, { method: 'PATCH', body: { active: !r.active } });
    await rules.reload();
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete ${r.name}? Past transactions stay.`)) return;
    await api(`/recurring/${r._id}`, { method: 'DELETE' });
    await rules.reload();
  }

  const jarLabel = (id?: string) => {
    const j = jars.find((x) => x._id === id);
    return j ? `${j.icon} ${j.name}` : 'split across jars';
  };

  return (
    <>
      <h1>Subscriptions & recurring</h1>
      <p className="muted">These are logged automatically on their date. You get a reminder before each renewal.</p>
      <ul className="list">
        {rules.data?.map((r) => (
          <li key={r._id} className={`card ${r.active ? '' : 'faded'}`}>
            <div className="row between">
              <b>{r.name}</b>
              <span className={r.type === 'income' ? 'amount in' : 'amount out'}>{fmt(r.amount, me.currency)} / {r.interval.replace('ly', '')}</span>
            </div>
            <div className="row between small">
              <span className="muted">{jarLabel(r.jar)} · next {r.nextDate.slice(0, 10)}</span>
              <span>
                <button className="link small" onClick={() => toggle(r)}>{r.active ? 'Pause' : 'Resume'}</button>{' '}
                <button className="link small" onClick={() => remove(r)}>Delete</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <form className="card stack" onSubmit={add}>
        <h3>Add recurring item</h3>
        <div className="grid2">
          <input placeholder="Name (Netflix, Gym, Rent, Salary…)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div className="grid3">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          {form.type === 'expense' && (
            <select value={form.jar} onChange={(e) => setForm({ ...form, jar: e.target.value })}>
              <option value="">🎉 Fun</option>
              {jars.map((j) => <option key={j._id} value={j._id}>{j.icon} {j.name}</option>)}
            </select>
          )}
        </div>
        <div className="grid2">
          <label>Next date<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>Remind days before<input type="number" min={0} max={30} value={form.remind} onChange={(e) => setForm({ ...form, remind: e.target.value })} /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary">Add</button>
      </form>
    </>
  );
}
