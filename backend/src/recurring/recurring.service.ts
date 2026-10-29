import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { IsBoolean, IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { RecurringRule, RecurringRuleDocument } from '../schemas';
import { JarsService } from '../jars/jars.service';
import { CounterpartiesService } from '../counterparties/counterparties.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { nextOccurrence } from '../domain/recurrence';
import { toIsoDate } from '../domain/parser';
import { dateFromIso, isoFromDate } from '../common/dates';

export class RecurringRuleDto {
  @IsString() @Length(1, 60) name: string;
  @IsIn(['income', 'expense']) type: 'income' | 'expense';
  @IsInt() @Min(1) amount: number;
  @ValidateIf((o) => o.type === 'expense') @IsMongoId() jar?: string;
  @IsOptional() @IsString() @Length(1, 80) counterparty?: string;
  @IsIn(['weekly', 'monthly', 'yearly']) interval: 'weekly' | 'monthly' | 'yearly';
  /** First (next) date the item is charged / received. */
  @IsDateString() startDate: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) remindDaysBefore?: number;
}

export class UpdateRecurringRuleDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsMongoId() jar?: string;
  @IsOptional() @IsDateString() nextDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) remindDaysBefore?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

function advance(date: Date, interval: RecurringRule['interval'], anchorDay: number): Date {
  const [y, m, d] = isoFromDate(date).split('-').map(Number);
  return dateFromIso(toIsoDate(nextOccurrence(new Date(y, m - 1, d), interval, anchorDay)));
}

const money = (minor: number) => (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    @InjectModel(RecurringRule.name) private readonly rules: Model<RecurringRule>,
    private readonly jars: JarsService,
    private readonly counterparties: CounterpartiesService,
    private readonly txs: TransactionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string) {
    return this.rules.find({ user: userId }).sort({ nextDate: 1 }).populate('counterparty', 'name').then((r) => r.map((x) => x.toJSON()));
  }

  async create(userId: string, dto: RecurringRuleDto) {
    if (dto.type === 'expense') await this.jars.findOne(userId, dto.jar!);
    const cp = dto.counterparty
      ? await this.counterparties.findOrCreate(userId, dto.counterparty, dto.type === 'income' ? 'source' : 'destination')
      : null;
    const start = dateFromIso(dto.startDate.slice(0, 10));
    const rule = await this.rules.create({
      user: new Types.ObjectId(userId),
      name: dto.name,
      type: dto.type,
      amount: dto.amount,
      jar: dto.type === 'expense' ? new Types.ObjectId(dto.jar) : undefined,
      counterparty: cp?._id,
      interval: dto.interval,
      anchorDay: start.getUTCDate(),
      nextDate: start,
      remindDaysBefore: dto.remindDaysBefore ?? 2,
    });
    await this.audit.log(userId, 'recurring.create', 'RecurringRule', rule._id, undefined, rule);
    await this.processRule(rule);
    return rule.toJSON();
  }

  private async get(userId: string, id: string) {
    const rule = Types.ObjectId.isValid(id) ? await this.rules.findOne({ _id: id, user: userId }) : null;
    if (!rule) throw new NotFoundException('Recurring item not found');
    return rule;
  }

  async update(userId: string, id: string, dto: UpdateRecurringRuleDto) {
    const rule = await this.get(userId, id);
    const before = rule.toObject();
    if (dto.jar) {
      if (rule.type !== 'expense') throw new BadRequestException('Income is split across all jars');
      rule.jar = (await this.jars.findOne(userId, dto.jar))._id;
    }
    if (dto.nextDate) {
      rule.nextDate = dateFromIso(dto.nextDate.slice(0, 10));
      rule.anchorDay = rule.nextDate.getUTCDate();
    }
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.amount !== undefined) rule.amount = dto.amount;
    if (dto.remindDaysBefore !== undefined) rule.remindDaysBefore = dto.remindDaysBefore;
    if (dto.active !== undefined) rule.active = !!dto.active;
    await rule.save();
    await this.audit.log(userId, 'recurring.update', 'RecurringRule', rule._id, before, rule);
    return rule.toJSON();
  }

  async remove(userId: string, id: string) {
    const rule = await this.get(userId, id);
    await rule.deleteOne();
    await this.audit.log(userId, 'recurring.delete', 'RecurringRule', rule._id, rule, undefined);
    return { ok: true };
  }

  /** Books every due occurrence (catching up if the server was down) and sends renewal reminders. */
  async processRule(rule: RecurringRuleDocument, now = new Date()) {
    if (!rule.active) return;
    const userId = String(rule.user);
    const cpName = rule.counterparty ? await this.counterparties.nameOf(rule.counterparty) : undefined;
    let guard = 0;
    while (rule.nextDate <= now && guard++ < 60) {
      const base = { amount: rule.amount, date: isoFromDate(rule.nextDate), counterparty: cpName ?? rule.name, note: rule.name };
      const meta = { origin: 'recurring' as const, recurringRule: rule._id };
      if (rule.type === 'income') await this.txs.createIncome(userId, base, meta);
      else await this.txs.createExpense(userId, { ...base, jar: String(rule.jar) }, meta);
      rule.nextDate = advance(rule.nextDate, rule.interval, rule.anchorDay);
    }
    const remindFrom = new Date(rule.nextDate.getTime() - rule.remindDaysBefore * 86400000);
    const alreadyReminded = rule.lastRemindedFor && rule.lastRemindedFor.getTime() === rule.nextDate.getTime();
    if (rule.type === 'expense' && rule.remindDaysBefore > 0 && now >= remindFrom && !alreadyReminded) {
      await this.notifications.notify(
        userId,
        'renewal',
        `🔁 ${rule.name} (${money(rule.amount)}) renews on ${isoFromDate(rule.nextDate)}. Cancel it before then if you no longer use it.`,
      );
      rule.lastRemindedFor = rule.nextDate;
    }
    await rule.save();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processAll() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 31 * 86400000);
    const due = await this.rules.find({ active: true, nextDate: { $lte: horizon } });
    for (const rule of due) {
      try {
        await this.processRule(rule, now);
      } catch (e) {
        this.logger.error(`Recurring rule ${rule._id} failed: ${(e as Error).message}`);
      }
    }
  }
}
