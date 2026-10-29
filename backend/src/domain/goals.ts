export interface GoalProjection {
  saved: number;
  remaining: number;
  progress: number; // 0..1
  monthlyRate: number; // average net amount added per month (minor units)
  monthsToGo: number | null; // null when the jar is not growing
  estimatedDate: string | null; // YYYY-MM
  onTrack: boolean | null; // null when there is no target date
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function projectGoal(
  target: number,
  saved: number,
  monthlyRate: number,
  now: Date,
  targetDate?: Date | null,
): GoalProjection {
  const remaining = Math.max(0, target - saved);
  const progress = target > 0 ? Math.min(1, saved / target) : 0;
  let monthsToGo: number | null = null;
  let estimatedDate: string | null = null;
  if (remaining === 0) {
    monthsToGo = 0;
    estimatedDate = monthKey(now);
  } else if (monthlyRate > 0) {
    monthsToGo = Math.ceil(remaining / monthlyRate);
    estimatedDate = monthKey(new Date(now.getFullYear(), now.getMonth() + monthsToGo, 1));
  }
  let onTrack: boolean | null = null;
  if (targetDate) {
    onTrack = estimatedDate !== null && estimatedDate <= monthKey(targetDate);
  }
  return { saved, remaining, progress, monthlyRate, monthsToGo, estimatedDate, onTrack };
}
