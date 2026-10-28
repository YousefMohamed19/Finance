import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AllocationVersion, Transaction, TransactionDocument, TransactionOrigin } from '../schemas';
import { JarsService } from '../jars/jars.service';
import { CounterpartiesService } from '../counterparties/counterparties.service';
import { AuditService } from '../audit/audit.service';
import { splitAmount } from '../domain/split';
import { dateFromIso } from '../common/dates';
import { CreateExpenseDto, CreateIncomeDto, CreateTransferDto, ListTransactionsQuery, UpdateTransactionDto } from './transactions.dto';

interface CreateMeta {
  origin?: TransactionOrigin;
  recurringRule?: Types.ObjectId;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private readonly txs: Model<Transaction>,
    @InjectModel(AllocationVersion.name) private readonly versions: Model<AllocationVersion>,
    private readonly jars: JarsService,
    private readonly counterparties: CounterpartiesService,
    private readonly audit: AuditService,
  ) {}

  private async splitWith(userId: string, amount: number, version: { shares: { jar: Types.ObjectId; percentBp: number }[] }) {
    const remainder = await this.jars.remainderJar(userId);
    return splitAmount(
      amount,
      version.shares.map((s) => ({ jarId: String(s.jar), percentBp: s.percentBp })),
      String(remainder._id),
    ).map((r) => ({ jar: new Types.ObjectId(r.jarId), amount: r.amount }));
  }

  /** Income is split across the jars immediately, using the current allocation version. */
  async createIncome(userId: string, dto: CreateIncomeDto, meta: CreateMeta = {}) {
    const version = await this.jars.currentAllocation(userId);
    const splits = await this.splitWith(userId, dto.amount, version);
    const cp = dto.counterparty ? await this.counterparties.findOrCreate(userId, dto.counterparty, 'source') : null;
    const tx = await this.txs.create({
      user: new Types.ObjectId(userId),
      type: 'income',
      amount: dto.amount,
      date: dateFromIso(dto.date.slice(0, 10)),
      splits,
      allocationVersion: version._id,
      counterparty: cp?._id,
      note: dto.note,
      origin: meta.origin ?? 'manual',
      recurringRule: meta.recurringRule,
    });
    await this.audit.log(userId, 'transaction.create', 'Transaction', tx._id, undefined, tx);
    return this.findOne(userId, String(tx._id));
  }

  async createExpense(userId: string, dto: CreateExpenseDto, meta: CreateMeta = {}) {
    const jar = await this.jars.findOne(userId, dto.jar);
    const cp = dto.counterparty ? await this.counterparties.findOrCreate(userId, dto.counterparty, 'destination') : null;
    if (cp) await this.counterparties.rememberJar(cp, jar._id);
    const tx = await this.txs.create({
      user: new Types.ObjectId(userId),
      type: 'expense',
      amount: dto.amount,
      date: dateFromIso(dto.date.slice(0, 10)),
      jar: jar._id,
      counterparty: cp?._id,
      note: dto.note,
      origin: meta.origin ?? 'manual',
      recurringRule: meta.recurringRule,
    });
    await this.audit.log(userId, 'transaction.create', 'Transaction', tx._id, undefined, tx);
    return this.findOne(userId, String(tx._id));
  }

  /** Moves money between jars (e.g. borrow from Fun to cover Emergency). The source jar must have enough. */
  async createTransfer(userId: string, dto: CreateTransferDto) {
    if (dto.fromJar === dto.toJar) throw new BadRequestException('Pick two different jars');
    const [from, to] = await Promise.all([this.jars.findOne(userId, dto.fromJar), this.jars.findOne(userId, dto.toJar)]);
    const balance = (await this.jars.balances(userId)).get(String(from._id)) ?? 0;
    if (balance < dto.amount) {
      throw new BadRequestException(`${from.name} only has ${(balance / 100).toFixed(2)} available`);
    }
    const tx = await this.txs.create({
      user: new Types.ObjectId(userId),
      type: 'transfer',
      amount: dto.amount,
      date: dateFromIso(dto.date.slice(0, 10)),
      fromJar: from._id,
      toJar: to._id,
      note: dto.note,
      origin: 'manual',
    });
    await this.audit.log(userId, 'transaction.create', 'Transaction', tx._id, undefined, tx);
    return this.findOne(userId, String(tx._id));
  }

  private async getDoc(userId: string, id: string): Promise<TransactionDocument> {
    const tx = Types.ObjectId.isValid(id) ? await this.txs.findOne({ _id: id, user: userId }) : null;
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async findOne(userId: string, id: string) {
    const tx = await this.txs.findOne({ _id: id, user: userId }).populate('counterparty', 'name kind');
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx.toJSON();
  }

  async list(userId: string, q: ListTransactionsQuery) {
    const filter: FilterQuery<Transaction> = { user: new Types.ObjectId(userId) };
    filter.deletedAt = q.deleted === 'true' ? { $ne: null } : null;
    if (q.type) filter.type = q.type;
    if (q.counterparty) filter.counterparty = new Types.ObjectId(q.counterparty);
    if (q.jar) {
      const jar = new Types.ObjectId(q.jar);
      filter.$or = [{ jar }, { fromJar: jar }, { toJar: jar }, { 'splits.jar': jar }];
    }
    if (q.from || q.to) {
      filter.date = {};
      if (q.from) filter.date.$gte = dateFromIso(q.from.slice(0, 10));
      if (q.to) filter.date.$lte = dateFromIso(q.to.slice(0, 10));
    }
    const [items, total] = await Promise.all([
      this.txs
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(q.skip ?? 0)
        .limit(q.limit ?? 50)
        .populate('counterparty', 'name kind'),
      this.txs.countDocuments(filter),
    ]);
    return { total, items: items.map((t) => t.toJSON()) };
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const tx = await this.getDoc(userId, id);
    if (tx.deletedAt) throw new BadRequestException('Restore the transaction before editing it');
    const before = tx.toObject();
    if (dto.date) tx.date = dateFromIso(dto.date.slice(0, 10));
    if (dto.note !== undefined) tx.note = dto.note;
    if (dto.jar) {
      if (tx.type !== 'expense') throw new BadRequestException('Only expenses have a single jar');
      tx.jar = (await this.jars.findOne(userId, dto.jar))._id;
    }
    if (dto.counterparty) {
      if (tx.type === 'transfer') throw new BadRequestException('Transfers have no source or destination');
      const cp = await this.counterparties.findOrCreate(userId, dto.counterparty, tx.type === 'income' ? 'source' : 'destination');
      tx.counterparty = cp._id;
    }
    if (dto.amount && dto.amount !== tx.amount) {
      tx.amount = dto.amount;
      if (tx.type === 'income') {
        // Keep the split version the income was originally given.
        const version = await this.versions.findById(tx.allocationVersion);
        if (!version) throw new NotFoundException('Allocation version missing');
        tx.splits = await this.splitWith(userId, dto.amount, version);
      }
    }
    await tx.save();
    if (tx.type === 'expense' && tx.counterparty && tx.jar && dto.jar) {
      await this.counterparties.rememberJarById(tx.counterparty, tx.jar);
    }
    await this.audit.log(userId, 'transaction.update', 'Transaction', tx._id, before, tx);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const tx = await this.getDoc(userId, id);
    if (tx.deletedAt) return this.findOne(userId, id);
    const before = tx.toObject();
    tx.deletedAt = new Date();
    await tx.save();
    await this.audit.log(userId, 'transaction.delete', 'Transaction', tx._id, before, tx);
    return this.findOne(userId, id);
  }

  async restore(userId: string, id: string) {
    const tx = await this.getDoc(userId, id);
    const before = tx.toObject();
    tx.deletedAt = null;
    await tx.save();
    await this.audit.log(userId, 'transaction.restore', 'Transaction', tx._id, before, tx);
    return this.findOne(userId, id);
  }

  /** Whether anything was logged for a calendar date (used by the evening reminder). */
  async countOnDate(userId: string, isoDate: string) {
    return this.txs.countDocuments({ user: userId, deletedAt: null, date: dateFromIso(isoDate), origin: { $ne: 'recurring' } });
  }
}
