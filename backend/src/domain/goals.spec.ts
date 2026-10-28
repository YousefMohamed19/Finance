import { projectGoal } from './goals';
import { nextOccurrence } from './recurrence';

describe('projectGoal', () => {
  const now = new Date(2026, 9, 28);
  it('estimates the month the goal is reached', () => {
    const p = projectGoal(30000000, 6000000, 1000000, now, new Date(2028, 11, 31));
    expect(p.monthsToGo).toBe(24);
    expect(p.estimatedDate).toBe('2028-10');
    expect(p.onTrack).toBe(true);
    expect(p.progress).toBeCloseTo(0.2);
  });
  it('has no estimate when the jar is not growing', () => {
    expect(projectGoal(1000, 0, 0, now).estimatedDate).toBeNull();
  });
});

describe('nextOccurrence', () => {
  it('clamps monthly dates and keeps the anchor day', () => {
    const feb = nextOccurrence(new Date(2026, 0, 31), 'monthly', 31);
    expect(feb.getDate()).toBe(28);
    expect(nextOccurrence(feb, 'monthly', 31).getDate()).toBe(31);
  });
});
