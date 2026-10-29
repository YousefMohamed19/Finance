'use client';

import { useEffect } from 'react';

export default function Toast({ message, kind = 'ok', onDone }: { message: string; kind?: 'ok' | 'warn' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return <div className={`toast ${kind}`} role="status">{message}</div>;
}
