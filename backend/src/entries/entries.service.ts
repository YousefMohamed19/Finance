import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DraftEntry, User } from '../schemas';
import { AUTO_SAVE_CONFIDENCE, ParsedEntry, parseEntry } from '../domain/parser';
import { JarsService } from '../jars/jars.service';
import { CounterpartiesService } from '../counterparties/counterparties.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AuditService } from '../audit/audit.service';
import { nowInZone } from '../common/dates';

export type EntryOrigin = 'quick' | 'telegram' | 'bank';

export interface ConfirmOverrides {
  type?: 'income' | 'expense';
  amount?: number;
  jarKey?: string;
  counterparty?: string;
  date?: string;
}

/**
 * Quick add and the drafts inbox. Parsing is rule-based (see domain/parser.ts):
 * free, offline, no AI model or API key involved.
 */
@Injectable()
export class EntriesService {
  constructor(
    @InjectModel(DraftEntry.name) private readonly drafts: Model<DraftEntry>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly jars: JarsService,
    private readonly counterparties: CounterpartiesService,
    private readonly txs: TransactionsService,
    private readonly audit: AuditService,
  ) {}

  async parse(userId: string, text: string, bankMessage = false): Promise<ParsedEntry> {
    const [user, jars, hints] = await Promise.all([
      this.users.findById(userId).lean(),
      this.jars.findAll(userId),
      this.counterparties.parserHints(userId),
    ]);
    return parseEntry(
      text,
      { now: nowInZone(user?.timezone ?? 'Africa/Cairo'), jars: jars.map((j) => ({ key: j.key, name: j.name })), counterparties: hints },
      { bankMessage },
    );
  }

  /** Saves the entry directly when the parser is confident, otherwise parks it in the drafts inbox. */
  async quickAdd(userId: string, text: string, origin: EntryOrigin = 'quick') {
    const parsed = await this.parse(userId, text, origin === 'bank');
    const complete = parsed.amount !== null && (parsed.type === 'income' || parsed.jarKey !== null);
    if (complete && parsed.confidence >= AUTO_SAVE_CONFIDENCE) {
      const transaction = await this.save(userId, parsed, origin);
      return { status: 'saved' as const, parsed, transaction };
    }
    const draft = await this.drafts.create({
      user: new Types.ObjectId(userId),
      raw: text,
      type: parsed.type,
      amount: parsed.amount ?? undefined,
      jarKey: parsed.jarKey ?? undefined,
      counterparty: parsed.counterparty ?? undefined,
      date: parsed.date,
      confidence: parsed.confidence,
      reasons: parsed.reasons,
      origin,
    });
    return { status: 'draft' as const, parsed, draft: draft.toJSON() };
  }

  private async save(userId: string, p: Pick<ParsedEntry, 'type' | 'amount' | 'jarKey' | 'counterparty' | 'date' | 'note'>, origin: EntryOrigin | 'draft') {
    if (!p.amount) throw new BadRequestException('Amount is required');
    const txOrigin = origin === 'quick' ? 'quick' : origin;
    const base = { amount: p.amount, date: p.date, counterparty: p.counterparty ?? undefined, note: p.note };
    if (p.type === 'income') return this.txs.createIncome(userId, base, { origin: txOrigin });
    const jar = p.jarKey ? await this.jars.findByKey(userId, p.jarKey) : null;
    if (!jar) throw new BadRequestException('Choose a jar for this expense');
    return this.txs.createExpense(userId, { ...base, jar: String(jar._id) }, { origin: txOrigin });
  }

  listDrafts(userId: string) {
    return this.drafts.find({ user: userId, status: 'pending' }).sort({ createdAt: -1 }).then((d) => d.map((x) => x.toJSON()));
  }

  countDrafts(userId: string) {
    return this.drafts.countDocuments({ user: userId, status: 'pending' });
  }

  private async pendingDraft(userId: string, id: string) {
    const draft = Types.ObjectId.isValid(id) ? await this.drafts.findOne({ _id: id, user: userId, status: 'pending' }) : null;
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  /** One-tap confirm, optionally fixing any field the parser got wrong. */
  async confirm(userId: string, id: string, overrides: ConfirmOverrides = {}) {
    const draft = await this.pendingDraft(userId, id);
    const transaction = await this.save(
      userId,
      {
        type: overrides.type ?? draft.type,
        amount: overrides.amount ?? draft.amount ?? null,
        jarKey: overrides.jarKey ?? draft.jarKey ?? null,
        counterparty: overrides.counterparty ?? draft.counterparty ?? null,
        date: overrides.date ?? draft.date,
        note: draft.raw,
      },
      'draft',
    );
    draft.status = 'confirmed';
    draft.transaction = new Types.ObjectId(String(transaction._id));
    await draft.save();
    return transaction;
  }

  async discard(userId: string, id: string) {
    const draft = await this.pendingDraft(userId, id);
    draft.status = 'discarded';
    await draft.save();
    await this.audit.log(userId, 'draft.discard', 'DraftEntry', draft._id, undefined, draft);
    return { ok: true };
  }
}
