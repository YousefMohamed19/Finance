import { splitAmount, assertValidShares } from './split';

const shares = [
  { jarId: 'a', percentBp: 3333 },
  { jarId: 'b', percentBp: 3333 },
  { jarId: 'me', percentBp: 3334 },
];

describe('splitAmount', () => {
  it('always distributes the full amount', () => {
    for (const amount of [1, 7, 100, 999, 123457, 500000]) {
      const total = splitAmount(amount, shares, 'me').reduce((s, r) => s + r.amount, 0);
      expect(total).toBe(amount);
    }
  });

  it('gives the rounding leftover to the remainder jar', () => {
    const r = splitAmount(100, shares, 'me');
    expect(r).toEqual([
      { jarId: 'a', amount: 33 },
      { jarId: 'b', amount: 33 },
      { jarId: 'me', amount: 34 },
    ]);
  });

  it('rejects percentages that do not add up to 100%', () => {
    expect(() => assertValidShares([{ jarId: 'a', percentBp: 5000 }])).toThrow(/100%/);
  });

  it('rejects non-integer amounts', () => {
    expect(() => splitAmount(10.5, shares, 'me')).toThrow();
  });
});
