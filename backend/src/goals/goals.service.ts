import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsDateString, IsInt, IsMongoId, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { Goal } from '../schemas';
import { JarsService } from '../jars/jars.service';
import { AuditService } from '../audit/audit.service';
import { FlowsService } from './flows.service';
import { projectGoal } from '../domain/goals';
import { dateFromIso } from '../common/dates';

export class GoalDto {
  @IsMongoId() jar: string;
  @IsString() @Length(1, 60) name: string;
  @IsInt() @Min(1) targetAmount: number;
  @IsOptional() @IsDateString() targetDate?: string;
}

export class UpdateGoalDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsInt() @Min(1) targetAmount?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() targetDate?: string | null;
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private readonly goals: Model<Goal>,
    private readonly jars: JarsService,
    private readonly flows: FlowsService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: GoalDto) {
    await this.jars.findOne(userId, dto.jar);
    const goal = await this.goals.create({
      user: new Types.ObjectId(userId),
      jar: new Types.ObjectId(dto.jar),
      name: dto.name,
      targetAmount: dto.targetAmount,
      targetDate: dto.targetDate ? dateFromIso(dto.targetDate.slice(0, 10)) : undefined,
    });
    await this.audit.log(userId, 'goal.create', 'Goal', goal._id, undefined, goal);
    return goal.toJSON();
  }

  private async get(userId: string, id: string) {
    const goal = Types.ObjectId.isValid(id) ? await this.goals.findOne({ _id: id, user: userId }) : null;
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    const goal = await this.get(userId, id);
    const before = goal.toObject();
    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.targetAmount !== undefined) goal.targetAmount = dto.targetAmount;
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate ? dateFromIso(dto.targetDate.slice(0, 10)) : undefined;
    await goal.save();
    await this.audit.log(userId, 'goal.update', 'Goal', goal._id, before, goal);
    return goal.toJSON();
  }

  async remove(userId: string, id: string) {
    const goal = await this.get(userId, id);
    await goal.deleteOne();
    await this.audit.log(userId, 'goal.delete', 'Goal', goal._id, goal, undefined);
    return { ok: true };
  }

  /**
   * Goals with progress and an estimated completion month.
   * Several goals in the same jar are funded in order of their target date (earliest first).
   * `rateDelta` lets the what-if tool add to (or take from) a jar's monthly growth.
   */
  async withProjections(userId: string, rateDelta = new Map<string, number>(), now = new Date()) {
    const [goals, balances, { rates }] = await Promise.all([
      this.goals.find({ user: userId }).sort({ targetDate: 1, createdAt: 1 }).lean(),
      this.jars.balances(userId),
      this.flows.monthlyRates(userId, now),
    ]);
    const usedPerJar = new Map<string, number>();
    const queuedPerJar = new Map<string, number>();
    return goals.map((g) => {
      const jar = String(g.jar);
      const balance = Math.max(0, balances.get(jar) ?? 0);
      const used = usedPerJar.get(jar) ?? 0;
      const saved = Math.min(g.targetAmount, Math.max(0, balance - used));
      usedPerJar.set(jar, used + saved);
      // A later goal in the same jar only starts growing once the earlier ones are reached.
      const queued = queuedPerJar.get(jar) ?? 0;
      queuedPerJar.set(jar, queued + (g.targetAmount - saved));
      const rate = (rates.get(jar) ?? 0) + (rateDelta.get(jar) ?? 0);
      const projection = projectGoal(g.targetAmount + queued, saved, rate, now, g.targetDate);
      return { ...g, ...projection, saved, remaining: g.targetAmount - saved, progress: saved / g.targetAmount };
    });
  }

  /** "If I move 5% from Fun to Future Project, I reach my goal N months earlier." */
  async whatIf(userId: string, fromJar: string, toJar: string, percentBp: number, now = new Date()) {
    if (fromJar === toJar) throw new BadRequestException('Pick two different jars');
    const [from, to, allocation] = await Promise.all([
      this.jars.findOne(userId, fromJar),
      this.jars.findOne(userId, toJar),
      this.jars.currentAllocation(userId),
    ]);
    const fromShare = allocation.shares.find((s) => String(s.jar) === fromJar)?.percentBp ?? 0;
    if (percentBp > fromShare) throw new BadRequestException(`${from.name} only has ${fromShare / 100}%`);
    const { avgIncome } = await this.flows.monthlyRates(userId, now);
    const shift = Math.round((avgIncome * percentBp) / 10000);
    const delta = new Map([
      [fromJar, -shift],
      [toJar, shift],
    ]);
    const [before, after] = await Promise.all([this.withProjections(userId, new Map(), now), this.withProjections(userId, delta, now)]);
    return {
      from: from.name,
      to: to.name,
      percentBp,
      avgMonthlyIncome: avgIncome,
      monthlyShift: shift,
      goals: before.map((b, i) => {
        const a = after[i];
        const monthsSooner = b.monthsToGo !== null && a.monthsToGo !== null ? b.monthsToGo - a.monthsToGo : null;
        return {
          goal: b.name,
          jar: String(b.jar),
          before: { monthsToGo: b.monthsToGo, estimatedDate: b.estimatedDate },
          after: { monthsToGo: a.monthsToGo, estimatedDate: a.estimatedDate },
          monthsSooner,
        };
      }),
    };
  }
}
