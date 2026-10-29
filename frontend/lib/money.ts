/** Amounts travel as integers in minor units (piasters). These helpers convert for display and input. */
export function fmt(minor: number, currency = 'EGP') {
  return `${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function toMinor(input: string): number | null {
  const n = Number(input.replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function pct(bp: number) {
  return `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
