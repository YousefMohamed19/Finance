import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AllocationVersion, AllocationVersionDocument, Jar, JarDocument, Transaction } from '../schemas';
import { DEFAULT_JARS } from '../domain/jars';
import { assertValidShares } from '../domain/split';
import { AuditService } from '../audit/audit.service';
import { SetAllocationDto, UpdateJarDto } from './jars.dto';

@Injectable()
export class JarsService {
  constructor(
    @InjectModel(Jar.name) private readonly jars: Model<Jar>,
    @InjectModel(AllocationVersion.name) private readonly versions: Model<AllocationVersion>,
    @InjectModel(Transaction.name) private readonly txs: Model<Transaction>,
    private readonly audit: AuditService,
  ) {}

  /** Creates the 7 default jars and the first allocation version for a new user. */
  async createDefaults(userId: string) {
    const user = new Types.ObjectId(userId);
    const jars = await this.jars.insertMany(
      DEFAULT_JARS.map((j, order) => ({ user, key: j.key, name: j.name, icon: j.icon, remainder: !!j.remainder, order })),
    );
    await this.versions.create({
      user,
      version: 1,
      shares: DEFAULT_JARS.map((j, i) => ({ jar: jars[i]._id, percentBp: j.percentBp })),
      note: 'Default split',
    });
  }

  findAll(userId: string): Promise<JarDocument[]> {
    return this.jars.find({ user: userId }).sort({ order: 1 });
  }

  async findOne(userId: string, jarId: string): Promise<JarDocument> {
    const jar = Types.ObjectId.isValid(jarId) ? await this.jars.findOne({ _id: jarId, user: userId }) : null;
    if (!jar) throw new NotFoundException('Jar not found');
    return jar;
  }

  async findByKey(userId: string, key: string): Promise<JarDocument | null> {
    return this.jars.findOne({ user: userId, key });
  }

  async remainderJar(userId: string): Promise<JarDocument> {
    const jar = await this.jars.findOne({ user: userId, remainder: true });
    if (!jar) throw new NotFoundException('Remainder jar missing');
    return jar;
  }

  async currentAllocation(userId: string): Promise<AllocationVersionDocument> {
    const v = await this.versions.findOne({ user: userId }).sort({ version: -1 });
    if (!v) throw new NotFoundException('No allocation configured');
    return v;
  }

  allocationHistory(userId: string) {
    return this.versions.find({ user: userId }).sort({ version: -1 }).lean();
  }

  /** Changing percentages creates a new version; old income keeps the split it was given. */
  async setAllocation(userId: string, dto: SetAllocationDto) {
    const jars = await this.findAll(userId);
    const ids = new Set(jars.map((j) => String(j._id)));
    const given = new Set(dto.shares.map((s) => s.jar));
    if (given.size !== dto.shares.length) throw new BadRequestException('Each jar may appear only once');
    if (given.size !== ids.size || [...given].some((id) => !ids.has(id))) {
      throw new BadRequestException('Give a percentage for every jar');
    }
    try {
      assertValidShares(dto.shares.map((s) => ({ jarId: s.jar, percentBp: s.percentBp })));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const current = await this.currentAllocation(userId);
    const created = await this.versions.create({
      user: new Types.ObjectId(userId),
      version: current.version + 1,
      shares: dto.shares.map((s) => ({ jar: new Types.ObjectId(s.jar), percentBp: s.percentBp })),
      note: dto.note,
    });
    await this.audit.log(userId, 'allocation.change', 'AllocationVersion', created._id, current, created);
    return created;
  }

  async update(userId: string, jarId: string, dto: UpdateJarDto) {
    const jar = await this.findOne(userId, jarId);
    const before = jar.toObject();
    Object.assign(jar, dto);
    await jar.save();
    await this.audit.log(userId, 'jar.update', 'Jar', jar._id, before, jar);
    return jar;
  }

  /** Balance per jar = income splits + transfers in - expenses - transfers out (soft-deleted rows excluded). */
  async balances(userId: string, until?: Date): Promise<Map<string, number>> {
    const match: Record<string, unknown> = { user: new Types.ObjectId(userId), deletedAt: null };
    if (until) match.date = { $lt: until };
    const rows = await this.txs.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: match },
      {
        $project: {
          moves: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$type', 'income'] },
                  then: { $map: { input: '$splits', as: 's', in: { jar: '$$s.jar', amount: '$$s.amount' } } },
                },
                { case: { $eq: ['$type', 'expense'] }, then: [{ jar: '$jar', amount: { $multiply: ['$amount', -1] } }] },
              ],
              default: [
                { jar: '$fromJar', amount: { $multiply: ['$amount', -1] } },
                { jar: '$toJar', amount: '$amount' },
              ],
            },
          },
        },
      },
      { $unwind: '$moves' },
      { $group: { _id: '$moves.jar', total: { $sum: '$moves.amount' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.total]));
  }

  /** Jars with their current percentage and balance, for the dashboard. */
  async overview(userId: string) {
    const [jars, allocation, balances] = await Promise.all([
      this.findAll(userId),
      this.currentAllocation(userId),
      this.balances(userId),
    ]);
    const pct = new Map(allocation.shares.map((s) => [String(s.jar), s.percentBp]));
    return {
      allocationVersion: allocation.version,
      jars: jars.map((j) => ({
        ...j.toJSON(),
        percentBp: pct.get(String(j._id)) ?? 0,
        balance: balances.get(String(j._id)) ?? 0,
      })),
    };
  }
}
