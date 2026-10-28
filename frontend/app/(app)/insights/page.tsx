'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmt } from '@/lib/money';
import { useSession } from '@/components/AppShell';

interface Source {
  id: string | null;
  name: string;
  total: number;
  byMonth: Record<string, number>;
  trend: 'growing' | 'shrinking' | 'steady' | 'new' | 'stopped';
  changePct: number | null;
}

interface Summary {
  month: string;
  totalIncome: number;
  totalSpent: number;
  jars: { jar: string; name: string; icon: string; inflow: number; spent: number; overspent: boolean }[];
  destinations: { name: string; total: number; count: number }[];
  subscriptions: { id: string; name: string; monthlyCost: number; yearlyCost: number; jar: string; review: boolean }[];
  lines: string[];
}

const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#059669', '#64748b', '#dc2626'];
const TREND = { growing: '📈', shrinking: '📉', steady: '➖', new: '🆕', stopped: '⚠️' };

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function InsightsPage() {
  const { me } = useSession();
  const [month, setMonth] = useState(thisMonth());
  const income = useApi<{ months: string[]; sources: Source[] }>('/insights/income-by-source?months=12');
  const summary = useApi<Summary>(`/insights/monthly?month=${month}`);
  const major = (v: number) => Math.round(v / 100);

  const sources = income.data?.sources.slice(0, 7) ?? [];
  const incomeRows = income.data?.months.map((m) => ({
    month: m.slice(2),
    ...Object.fromEntries(sources.map((s) => [s.name, major(s.byMonth[m] ?? 0)])),
  }));
  const jarRows = summary.data?.jars.map((j) => ({ name: `${j.icon} ${j.name}`, Added: major(j.inflow), Spent: major(j.spent) }));

  async function saveReport() {
    await api(`/insights/reports?month=${month}`, { method: 'POST' });
    alert('Report saved');
  }

  return (
    <>
      <h1>Insights</h1>

      <section className="card stack">
        <h3>Where your money comes from</h3>
        <div className="chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} width={48} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {sources.map((s, i) => <Bar key={s.name} dataKey={s.name} stackId="a" fill={COLORS[i % COLORS.length]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="plain">
          {income.data?.sources.map((s) => (
            <li key={s.name} className="row between small">
              <span>{TREND[s.trend]} {s.name}</span>
              <span>{fmt(s.total, me.currency)}{s.changePct !== null && <span className="muted"> ({s.changePct > 0 ? '+' : ''}{s.changePct}%)</span>}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <div className="row between">
          <h3>Monthly summary</h3>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <ul className="plain lines">{summary.data?.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className="chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={jarRows} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={110} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Added" fill="#0f766e" />
              <Bar dataKey="Spent" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!!summary.data?.destinations.length && (
          <>
            <h4>Where it went</h4>
            <ul className="plain">
              {summary.data.destinations.map((d) => (
                <li key={d.name} className="row between small">
                  <span>{d.name} <span className="muted">×{d.count}</span></span>
                  <span>{fmt(d.total, me.currency)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!!summary.data?.subscriptions.length && (
          <>
            <h4>Subscriptions</h4>
            <ul className="plain">
              {summary.data.subscriptions.map((s) => (
                <li key={s.id} className="row between small">
                  <span>{s.review ? '⚠️ ' : ''}{s.name} <span className="muted">({s.jar})</span></span>
                  <span>{fmt(s.monthlyCost, me.currency)}/mo · {fmt(s.yearlyCost, me.currency)}/yr</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="ghost small" onClick={saveReport}>Save this month as a report</button>
      </section>
    </>
  );
}
