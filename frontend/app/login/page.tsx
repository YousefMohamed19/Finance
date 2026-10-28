'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setSession } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body =
        mode === 'register'
          ? { email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : { email, password, ...(totp ? { totp } : {}) };
      const res = await api(`/auth/${mode}`, { method: 'POST', body }, false);
      setSession(res);
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.body?.totpRequired) setNeedTotp(true);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>🫙 Finanse</h1>
        <p className="muted">Every pound split into 7 jars.</p>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password {mode === 'register' && <small className="muted">(at least 10 characters)</small>}
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : 1}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {needTotp && (
          <label>
            Two-factor code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} autoFocus />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
