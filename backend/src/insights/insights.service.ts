import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { MonthlyReport, RecurringRule, Transaction, User } from '../schemas';
import { JarsService } from '../jars/jars.service';
import { FlowsService } from '../goals/flows.service';
import { GoalsService } from '../goals/goals.service';
import { CounterpartiesService } from '../counterparties/counterparties.service';
import { NotificationsService } from '../notifications/notifications.service';
import { monthOf, monthRange, shiftMonth } from '../common/dates';

const money = (minor: number) => (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const MONTHLY_FACTOR = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;

/**
 * Insights are computed with plain statistics and sentence templates. No AI model is used.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    @InjectModel(Transaction.name) private readonly txs: Model<Transaction>,
    @InjectModel(RecurringRule.name) private readonly rules: Model<RecurringRule>,
    @InjectModel(MonthlyReport.name) private readonly reports: Model<MonthlyReport>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly jars: JarsService,
    private readonly flows: FlowsService,
    private readonly goals: GoalsService,
    private readonly counterparties: CounterpartiesService,
    private readonly notifications: NotificationsService,
  ) {}

  private async totalsByCounterparty(userId: string, type: 'income' | 'expense', from: string, to: string) {
    return this.txs.aggregate<{ _id: { cp: Types.ObjectId | null; month: string }; total: number; count: number }>([
      {
        $match: {
          user: new Types.ObjectId(userId),
          deletedAt: null,
          type,
          date: { $gte: monthRange(from).start, $lt: monthRange(to).end },
        },
      },
      {
        $group: {
          _id: { cp: '$counterparty', month: { $dateToString: { format: '%Y-%m', date: '$date' } } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);
  }

  /** Where the money comes from, month by month, and whether each source is growing or shrinking. */
  async incomeBySource(userId: string, months = 12, now = new Date()) {
    const last = monthOf(now);
    const first = shiftMonth(last, -(months - 1));
    const monthList = Array.from({ length: months }, (_, i) => shiftMonth(first, i));
    const [rows, cps] = await Promise.all([
      this.totalsByCounterparty(userId, 'income', first, last),
      this.counterparties.list(userId, 'source'),
    ]);
    const names = new Map(cps.map((c) => [String(c._id), c.name]));
    const sources = new Map<string, { id: string | null; name: string; byMonth: Record<string, number>; total: number }>();
    for (const r of rows) {
      const id = r._id.cp ? String(r._id.cp) : null;
      const key = id ?? 'none';
      if (!sources.has(key)) sources.set(key, { id, name: id ? names.get(id) ?? 'Unknown' : 'Unspecified', byMonth: {}, total: 0 });
      const s = sources.get(key)!;
      s.byMonth[r._id.month] = (s.byMonth[r._id.month] ?? 0) + r.total;
      s.total += r.total;
    }
    // Trend: last 3 months vs the 3 months before (current month excluded, it is not complete).
    const recent = monthList.slice(-4, -1);
    const previous = monthList.slice(-7, -4);
    const sum = (byMonth: Record<string, number>, ms: string[]) => ms.reduce((t, m) => t + (byMonth[m] ?? 0), 0);
    const list = [...sources.values()].map((s) => {
      const r = sum(s.byMonth, recent);
      const p = sum(s.byMonth, previous);
      let trend: 'growing' | 'shrinking' | 'steady' | 'new' | 'stopped' = 'steady';
      let changePct: number | null = null;
      if (p === 0 && r > 0) trend = 'new';
      else if (p > 0 && r === 0) trend = 'stopped';
      else if (p > 0) {
        changePct = Math.round(((r - p) / p) * 100);
        trend = changePct >= 10 ? 'growing' : changePct <= -10 ? 'shrinking' : 'steady';
      }
      return { ...s, recent3: r, previous3: p, trend, changePct };
    });
    list.sort((a, b) => b.total - a.total);
    return { months: monthList, sources: list };
  }

  /** Where the money goes in a month, by destination. */
  async spendingByDestination(userId: string, month: string) {
    const [rows, cps] = await Promise.all([
      this.totalsByCounterparty(userId, 'expense', month, month),
      this.counterparties.list(userId, 'destination'),
    ]);
    const names = new Map(cps.map((c) => [String(c._id), c.name]));
    return rows
      .map((r) => ({
        id: r._id.cp ? String(r._id.cp) : null,
        name: r._id.cp ? names.get(String(r._id.cp)) ?? 'Unknown' : 'Unspecified',
        total: r.total,
        count: r.count,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /** The monthly summary: overspending per jar, subscription costs, goal pace and income trend. */
  async monthlySummary(userId: string, month: string, now = new Date()) {
    const [jarOverview, flows, income, destinations, rules, goals, sources] = await Promise.all([
      this.jars.overview(userId),
      this.flows.jarFlows(userId, month, 4),
      this.flows.incomeByMonth(userId, month, 4),
      this.spendingByDestination(userId, month),
      this.rules.find({ user: userId, active: true, type: 'expense' }).lean(),
      this.goals.withProjections(userId, new Map(), now),
      this.incomeBySource(userId, 7, monthRange(month).start),
    ]);
    const monthFlows = flows.get(month) ?? new Map();
    const prevMonths = [...flows.keys()].slice(0, 3);
    const totalIncome = income.get(month) ?? 0;
    const prevIncomeAvg = Math.round(prevMonths.reduce((s, m) => s + (income.get(m) ?? 0), 0) / 3);

    const jars = jarOverview.jars.map((j) => {
      const f = monthFlows.get(String(j._id)) ?? { inflow: 0, spent: 0, transferredOut: 0 };
      const avgSpent = Math.round(prevMonths.reduce((s, m) => s + (flows.get(m)?.get(String(j._id))?.spent ?? 0), 0) / 3);
      return {
        jar: String(j._id),
        name: j.name,
        icon: j.icon,
        inflow: f.inflow,
        spent: f.spent,
        net: f.inflow - f.spent - f.transferredOut,
        avgSpent,
        balance: j.balance,
        overspent: f.spent > f.inflow,
        overBy: Math.max(0, f.spent - f.inflow),
      };
    });
    const totalSpent = jars.reduce((s, j) => s + j.spent, 0);

    const jarNames = new Map(jarOverview.jars.map((j) => [String(j._id), j.name]));
    const jarInflow = new Map(jars.map((j) => [j.jar, j.inflow]));
    const subscriptions = rules
      .map((r) => {
        const monthly = Math.round(r.amount * MONTHLY_FACTOR[r.interval]);
        const inflow = jarInflow.get(String(r.jar)) ?? 0;
        const shareOfJar = inflow > 0 ? monthly / inflow : null;
        return {
          id: String(r._id),
          name: r.name,
          interval: r.interval,
          monthlyCost: monthly,
          yearlyCost: monthly * 12,
          jar: jarNames.get(String(r.jar)) ?? '',
          shareOfJar,
          // Subscriptions eating a big part of their jar are worth a second look.
          review: shareOfJar !== null && shareOfJar >= 0.25,
        };
      })
      .sort((a, b) => b.monthlyCost - a.monthlyCost);
    const subsMonthly = subscriptions.reduce((s, x) => s + x.monthlyCost, 0);

    const lines: string[] = [];
    lines.push(`Income this month: ${money(totalIncome)} (3-month average ${money(prevIncomeAvg)}). Spent: ${money(totalSpent)}.`);
    if (totalIncome > 0) {
      const saved = totalIncome - totalSpent;
      lines.push(saved >= 0 ? `You kept ${money(saved)} (${Math.round((saved / totalIncome) * 100)}% of income).` : `You spent ${money(-saved)} more than you earned.`);
    }
    for (const j of jars.filter((x) => x.overspent && x.spent > 0)) {
      lines.push(`${j.icon} ${j.name} is overspent by ${money(j.overBy)}: ${money(j.spent)} spent vs ${money(j.inflow)} added.`);
    }
    for (const j of jars.filter((x) => x.avgSpent > 0 && x.spent > x.avgSpent * 1.3)) {
      lines.push(`${j.icon} ${j.name} spending is ${Math.round((j.spent / j.avgSpent - 1) * 100)}% above your 3-month average.`);
    }
    if (destinations[0]) lines.push(`Biggest destination: ${destinations[0].name} (${money(destinations[0].total)}, ${destinations[0].count} payments).`);
    if (subscriptions.length) {
      lines.push(`Subscriptions cost ${money(subsMonthly)} a month (${money(subsMonthly * 12)} a year).`);
      for (const s of subscriptions.filter((x) => x.review)) {
        lines.push(`Review ${s.name}: it takes ${Math.round(s.shareOfJar! * 100)}% of what goes into ${s.jar}. Cancel it if you barely use it.`);
      }
    }
    for (const g of goals) {
      if (g.remaining <= 0) lines.push(`🎯 ${g.name} is fully funded!`);
      else if (g.estimatedDate) {
        const pace = g.onTrack === false ? ' (behind your target date)' : g.onTrack ? ' (on track)' : '';
        lines.push(`🎯 ${g.name}: ${Math.round(g.progress * 100)}% saved, estimated ${g.estimatedDate}${pace}.`);
      } else lines.push(`🎯 ${g.name}: ${Math.round(g.progress * 100)}% saved, but its jar is not growing right now.`);
    }
    for (const s of sources.sources) {
      if (s.trend === 'growing') lines.push(`📈 ${s.name} income is growing (${s.changePct}% vs the previous 3 months).`);
      if (s.trend === 'shrinking') lines.push(`📉 ${s.name} income is shrinking (${s.changePct}% vs the previous 3 months).`);
      if (s.trend === 'stopped') lines.push(`⚠️ No income from ${s.name} in the last 3 months.`);
    }

    return { month, totalIncome, totalSpent, prevIncomeAvg, jars, destinations: destinations.slice(0, 10), subscriptions, goals, lines };
  }

  listReports(userId: string) {
    return this.reports.find({ user: userId }).sort({ month: -1 }).limit(24).lean();
  }

  async generateReport(userId: string, month: string) {
    const data = await this.monthlySummary(userId, month);
    await this.reports.updateOne({ user: userId, month }, { data }, { upsert: true });
    return data;
  }

  /** On the 1st of every month, store last month's report and send its highlights. */
  @Cron('0 8 1 * *')
  async monthlyReports() {
    const month = shiftMonth(monthOf(new Date()), -1);
    for (const user of await this.users.find().select('_id').lean()) {
      try {
        const data = await this.generateReport(String(user._id), month);
        await this.notifications.notify(String(user._id), 'monthly-report', `📊 ${month} summary\n${data.lines.slice(0, 8).join('\n')}`);
      } catch (e) {
        this.logger.error(`Monthly report for ${user._id} failed: ${(e as Error).message}`);
      }
    }
  }
}
