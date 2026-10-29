export type Interval = 'weekly' | 'monthly' | 'yearly';

/** Next occurrence after `from`. Monthly dates clamp to the month's last day (31st -> 30th/28th) but keep the anchor day. */
export function nextOccurrence(from: Date, interval: Interval, anchorDay: number): Date {
  if (interval === 'weekly') {
    const d = new Date(from);
    d.setDate(d.getDate() + 7);
    return d;
  }
  const months = interval === 'monthly' ? 1 : 12;
  const year = from.getFullYear();
  const month = from.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(anchorDay, lastDay), from.getHours(), from.getMinutes());
}
