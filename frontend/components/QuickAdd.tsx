'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmt } from '@/lib/money';
import type { Jar } from '@/lib/types';
import Toast from './Toast';

interface Parsed {
  type: 'income' | 'expense';
  amount: number | null;
  jarKey: string | null;
  counterparty: string | null;
  date: string;
  confidence: number;
}

/**
 * One-line logging: "uber 85", "got 5000 from freelance client Ahmed".
 * Parsing happens on our own server with simple rules — free, no AI and no API keys.
 */
export default function QuickAdd({ jars, currency, onSaved }: { jars: Jar[]; currency: string; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [bank, setBank] = useState(false);
  const [preview, setPreview] = useState<Parsed | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'warn' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bank || text.trim().length < 2) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api<Parsed>('/entries/parse', { method: 'POST', body: { text } }).then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [text, bank]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api(bank ? '/entries/bank-message' : '/entries/quick', { method: 'POST', body: { text } });
      setToast(
        res.status === 'saved'
          ? { message: `✅ Saved ${fmt(res.transaction.amount, currency)}`, kind: 'ok' }
          : { message: '📝 Not sure about this one — it is waiting in Drafts', kind: 'warn' },
      );
      setText('');
      onSaved();
    } catch (err) {
      setToast({ message: (err as Error).message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const jar = preview?.jarKey ? jars.find((j) => j.key === preview.jarKey) : null;

  return (
    <form className="card quick" onSubmit={submit}>
      {bank ? (
        <textarea
          rows={3}
          placeholder="Paste a bank SMS or notification…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <input
          autoFocus
          enterKeyHint="done"
          placeholder='uber 85 · lunch 150 yesterday · got 5000 from Ahmed'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="row between">
        <div className="preview muted">
          {preview &&
            (preview.amount ? (
              <>
                {preview.type === 'income' ? '⬇️ Income' : '⬆️ Expense'} <b>{fmt(preview.amount, currency)}</b>
                {preview.type === 'expense' && <> · {jar ? `${jar.icon} ${jar.name}` : '❓ jar'}</>}
                {preview.counterparty && <> · {preview.counterparty}</>} · {preview.date}
              </>
            ) : (
              'Add an amount, e.g. "uber 85"'
            ))}
        </div>
        <div className="row">
          <button type="button" className="ghost small" onClick={() => setBank(!bank)}>
            {bank ? '✍️ One line' : '🏦 Bank SMS'}
          </button>
          <button className="primary small" disabled={busy || !text.trim()}>Add</button>
        </div>
      </div>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </form>
  );
}
