'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

export default function PinLock({ onUnlock, onSignOut }: { onUnlock: () => void; onSignOut: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/auth/pin/verify', { method: 'POST', body: { pin } });
      onUnlock();
    } catch (err) {
      setError((err as Error).message);
      setPin('');
    }
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <h2>🔒 Enter your PIN</h2>
        <input
          className="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={pin.length < 4}>Unlock</button>
        <button type="button" className="link" onClick={onSignOut}>Sign out</button>
      </form>
    </div>
  );
}
