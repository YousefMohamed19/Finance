import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Counterparty, CounterpartyDocument, Jar } from '../schemas';
import { blindIndex } from '../common/crypto';
import { AuditService } from '../audit/audit.service';

export type CounterpartyKind = 'source' | 'destination';

@Injectable()
export class CounterpartiesService {
  constructor(
    @InjectModel(Counterparty.name) private readonly model: Model<Counterparty>,
    @InjectModel(Jar.name) private readonly jars: Model<Jar>,
    private readonly audit: AuditService,
  ) {}

  /** Looks a counterparty up by name (via its blind index, since the name is encrypted) or creates it. */
  async findOrCreate(userId: string, name: string, kind: CounterpartyKind): Promise<CounterpartyDocument> {
    const clean = name.trim().slice(0, 80);
    const nameHash = blindIndex(clean);
    const existing = await this.model.findOne({ user: userId, nameHash, kind });
    if (existing) return existing;
    return this.model.create({ user: new Types.ObjectId(userId), name: clean, nameHash, kind });
  }

  /** Remembers which jar a destination is paid from, so next time the parser is sure. */
  async rememberJar(counterparty: CounterpartyDocument, jarId: Types.ObjectId) {
    if (counterparty.kind !== 'destination' || String(counterparty.defaultJar) === String(jarId)) return;
    counterparty.defaultJar = jarId;
    await counterparty.save();
  }

  async rememberJarById(counterpartyId: Types.ObjectId, jarId: Types.ObjectId) {
    const cp = await this.model.findById(counterpartyId);
    if (cp) await this.rememberJar(cp, jarId);
  }

  async nameOf(id: Types.ObjectId): Promise<string | undefined> {
    return (await this.model.findById(id))?.name;
  }

  async list(userId: string, kind?: CounterpartyKind) {
    const filter: Record<string, unknown> = { user: userId };
    if (kind) filter.kind = kind;
    const docs = await this.model.find(filter);
    return docs.map((d) => d.toJSON()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Name + remembered jar key for every destination; fed to the quick-add parser. */
  async parserHints(userId: string) {
    const [docs, jars] = await Promise.all([this.model.find({ user: userId }), this.jars.find({ user: userId }).lean()]);
    const keyById = new Map(jars.map((j) => [String(j._id), j.key]));
    return docs.map((d) => ({ name: d.name, defaultJarKey: d.defaultJar ? keyById.get(String(d.defaultJar)) ?? null : null }));
  }

  async update(userId: string, id: string, data: { name?: string; defaultJar?: string | null }) {
    const doc = Types.ObjectId.isValid(id) ? await this.model.findOne({ _id: id, user: userId }) : null;
    if (!doc) throw new NotFoundException('Counterparty not found');
    const before = doc.toObject();
    if (data.name) {
      doc.name = data.name.trim();
      doc.nameHash = blindIndex(data.name);
    }
    if (data.defaultJar !== undefined) {
      doc.defaultJar = data.defaultJar ? new Types.ObjectId(data.defaultJar) : undefined;
    }
    await doc.save();
    await this.audit.log(userId, 'counterparty.update', 'Counterparty', doc._id, before, doc);
    return doc;
  }
}
