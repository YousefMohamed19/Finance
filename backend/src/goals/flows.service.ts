import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction } from '../schemas';
import { monthOf, monthRange, shiftMonth } from '../common/dates';

export interface JarMonthFlow {
  inflow: number; // income splits + transfers in
  spent: number; // expenses
  transferredOut: number;
}

/** Month-by-month money movements per jar, shared by goals and insights. */
@Injectable()
export class FlowsService {
  constructor(@InjectModel(Transaction.name) private readonly txs: Model<Transaction>) {}

  /** Map of month -> jarId -> flow for `count` months ending with `lastMonth` (inclusive). */
  async jarFlows(userId: string, lastMonth: string, count: number): Promise<Map<string, Map<string, JarMonthFlow>>> {
    const first = shiftMonth(lastMonth, -(count - 1));
    const { start } = monthRange(first);
    const { end } = monthRange(lastMonth);
    const txs = await this.txs
      .find({ user: new Types.ObjectId(userId), deletedAt: null, date: { $gte: start, $lt: end } })
      .select('type amount date jar fromJar toJar splits')
      .lean();
    const result = new Map<string, Map<string, JarMonthFlow>>();
    for (let i = 0; i < count; i++) result.set(shiftMonth(first, i), new Map());
    const bucket = (month: string, jar: unknown) => {
      const m = result.get(month)!;
      const key = String(jar);
      if (!m.has(key)) m.set(key, { inflow: 0, spent: 0, transferredOut: 0 });
      return m.get(key)!;
    };
    for (const t of txs) {
      const month = monthOf(t.date);
      if (t.type === 'income') for (const s of t.splits ?? []) bucket(month, s.jar).inflow += s.amount;
      if (t.type === 'expense') bucket(month, t.jar).spent += t.amount;
      if (t.type === 'transfer') {
        bucket(month, t.fromJar).transferredOut += t.amount;
        bucket(month, t.toJar).inflow += t.amount;
      }
    }
    return result;
  }

  /** Total income per month for `count` months ending with `lastMonth`. */
  async incomeByMonth(userId: string, lastMonth: string, count: number): Promise<Map<string, number>> {
    const first = shiftMonth(lastMonth, -(count - 1));
    const rows = await this.txs.aggregate<{ _id: string; total: number }>([
      {
        $match: {
          user: new Types.ObjectId(userId),
          deletedAt: null,
          type: 'income',
          date: { $gte: monthRange(first).start, $lt: monthRange(lastMonth).end },
        },
      },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } },
    ]);
    const result = new Map<string, number>();
    for (let i = 0; i < count; i++) result.set(shiftMonth(first, i), 0);
    for (const r of rows) result.set(r._id, r.total);
    return result;
  }

  /**
   * Average net monthly growth of each jar over the last 3 complete months
   * (falls back to the current month when there is no history yet).
   */
  async monthlyRates(userId: string, now = new Date()): Promise<{ rates: Map<string, number>; avgIncome: number }> {
    const current = monthOf(now);
    const flows = await this.jarFlows(userId, current, 4);
    const income = await this.incomeByMonth(userId, current, 4);
    const past = [...flows.keys()].slice(0, 3).filter((m) => (flows.get(m)?.size ?? 0) > 0);
    const months = past.length > 0 ? past : [current];
    const rates = new Map<string, number>();
    for (const m of months) {
      for (const [jar, f] of flows.get(m) ?? []) {
        rates.set(jar, (rates.get(jar) ?? 0) + f.inflow - f.spent - f.transferredOut);
      }
    }
    for (const [jar, total] of rates) rates.set(jar, Math.round(total / months.length));
    const avgIncome = Math.round(months.reduce((s, m) => s + (income.get(m) ?? 0), 0) / months.length);
    return { rates, avgIncome };
  }
}
