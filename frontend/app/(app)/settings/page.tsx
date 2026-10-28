'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSession } from '@/components/AppShell';
import Toast from '@/components/Toast';

interface AuditRow {
  _id: string;
  action: string;
  entity: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { me, reloadMe, signOut } = useSession();
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);
  const [prefs, setPrefs] = useState({ timezone: me.timezone, currency: me.currency, reminderHour: me.reminderHour, remindersEnabled: me.remindersEnabled });
  const [totp, setTotp] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [link, setLink] = useState<{ code: string; botUsername: string | null; enabled: boolean } | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const audit = useApi<AuditRow[]>(showAudit ? '/audit?limit=50' : null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await reloadMe();
      setToast({ message: ok, kind: 'ok' });
    } catch (err) {
      setToast({ message: (err as Error).message, kind: 'error' });
    }
  };

  const savePrefs = (e: FormEvent) => {
    e.preventDefault();
    return run(() => api('/auth/settings', { method: 'PATCH', body: prefs }), 'Settings saved');
  };

  return (
    <>
      <h1>Settings</h1>
      <nav className="row wrap">
        <Link href="/jars" className="ghost button">🫙 Jars & split</Link>
        <Link href="/recurring" className="ghost button">🔁 Subscriptions</Link>
        <Link href="/drafts" className="ghost button">📝 Drafts</Link>
      </nav>

      <form className="card stack" onSubmit={savePrefs}>
        <h3>Preferences</h3>
        <div className="grid2">
          <label>Timezone<input value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} /></label>
          <label>Currency<input maxLength={3} value={prefs.currency} onChange={(e) => setPrefs({ ...prefs, currency: e.target.value.toUpperCase() })} /></label>
        </div>
        <label className="row inline">
          <input type="checkbox" checked={prefs.remindersEnabled} onChange={(e) => setPrefs({ ...prefs, remindersEnabled: e.target.checked })} />
          Evening reminder “Anything spent today?” at
          <select value={prefs.reminderHour} onChange={(e) => setPrefs({ ...prefs, reminderHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <button className="primary">Save</button>
      </form>

      <section className="card stack">
        <h3>📲 Telegram bot {me.telegramLinked && <span className="tag">linked</span>}</h3>
        <p className="muted small">Log from anywhere by sending “uber 85” to your bot. Telegram bots are free. Only your linked chat is accepted.</p>
        {me.telegramLinked ? (
          <button className="ghost" onClick={() => run(() => api('/auth/telegram', { method: 'DELETE' }), 'Telegram unlinked')}>Unlink</button>
        ) : (
          <>
            <button className="ghost" onClick={async () => setLink(await api('/auth/telegram/link-code', { method: 'POST' }))}>Get link code</button>
            {link && (link.enabled ? (
              <p>
                Send <code>/link {link.code}</code> to {link.botUsername ? <a href={`https://t.me/${link.botUsername}`} target="_blank" rel="noreferrer">@{link.botUsername}</a> : 'your bot'} within 10 minutes, then refresh.
              </p>
            ) : (
              <p className="error small">The bot is not set up on the server yet. Add TELEGRAM_BOT_TOKEN to backend/.env (see README).</p>
            ))}
          </>
        )}
      </section>

      <section className="card stack">
        <h3>🔐 Two-factor authentication {me.totpEnabled && <span className="tag">on</span>}</h3>
        {!me.totpEnabled && !totp && (
          <button className="ghost" onClick={async () => setTotp(await api('/auth/2fa/setup', { method: 'POST' }))}>Set up with an authenticator app</button>
        )}
        {totp && !me.totpEnabled && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={totp.qrDataUrl} alt="2FA QR code" width={180} height={180} />
            <p className="muted small">Or enter this key: <code>{totp.secret}</code></p>
          </>
        )}
        {(totp || me.totpEnabled) && (
          <div className="row">
            <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button
              className="primary small"
              onClick={() =>
                run(async () => {
                  await api(me.totpEnabled ? '/auth/2fa/disable' : '/auth/2fa/enable', { method: 'POST', body: { code } });
                  setTotp(null);
                  setCode('');
                }, me.totpEnabled ? '2FA turned off' : '2FA turned on')
              }
            >
              {me.totpEnabled ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h3>🔒 App PIN {me.hasPin && <span className="tag">set</span>}</h3>
        <p className="muted small">Asked when the app opens and after 5 minutes in the background.</p>
        <div className="row">
          <input type="password" inputMode="numeric" maxLength={8} placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <button className="primary small" disabled={pin.length < 4} onClick={() => run(async () => { await api('/auth/pin', { method: 'POST', body: { pin } }); setPin(''); }, 'PIN saved')}>
            Save PIN
          </button>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h3>🧾 Audit log</h3>
          <button className="link" onClick={() => setShowAudit(!showAudit)}>{showAudit ? 'Hide' : 'Show'}</button>
        </div>
        {showAudit && (
          <ul className="plain">
            {audit.data?.map((a) => (
              <li key={a._id} className="row between small">
                <span>{a.action}</span>
                <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted small">Signed in as {me.email}</p>
      <button className="ghost" onClick={signOut}>Sign out</button>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </>
  );
}
