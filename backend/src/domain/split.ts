import { TOTAL_BP } from './jars';

export interface SplitShare {
  jarId: string;
  percentBp: number;
}

export interface SplitResult {
  jarId: string;
  amount: number;
}

/** Throws unless the shares are non-negative integers that add up to exactly 100%. */
export function assertValidShares(shares: SplitShare[]): void {
  if (shares.length === 0) throw new Error('At least one jar is required');
  for (const s of shares) {
    if (!Number.isInteger(s.percentBp) || s.percentBp < 0) {
      throw new Error('Percentages must be non-negative with at most two decimals');
    }
  }
  const total = shares.reduce((sum, s) => sum + s.percentBp, 0);
  if (total !== TOTAL_BP) {
    throw new Error(`Percentages must add up to 100% (got ${(total / 100).toFixed(2)}%)`);
  }
}

/**
 * Splits an integer amount (minor units, e.g. piasters) across jars.
 * Each jar gets floor(amount * pct); whatever is left from rounding goes to the remainder jar.
 */
export function splitAmount(amount: number, shares: SplitShare[], remainderJarId: string): SplitResult[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer');
  assertValidShares(shares);
  if (!shares.some((s) => s.jarId === remainderJarId)) throw new Error('Remainder jar is not part of the split');

  const result = shares.map((s) => ({ jarId: s.jarId, amount: Math.floor((amount * s.percentBp) / TOTAL_BP) }));
  const allocated = result.reduce((sum, r) => sum + r.amount, 0);
  const leftover = amount - allocated;
  result.find((r) => r.jarId === remainderJarId)!.amount += leftover;
  return result.filter((r) => r.amount > 0);
}
