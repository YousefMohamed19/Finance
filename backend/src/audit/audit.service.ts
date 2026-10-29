import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from '../schemas';

/** Fields that must never be copied into the audit log. */
const SECRET_FIELDS = ['passwordHash', 'totpSecret', 'pinHash', 'refreshTokens', 'telegramChatId', 'telegramChatIdHash', 'nameHash'];

function snapshot(doc: unknown): Record<string, unknown> | undefined {
  if (!doc) return undefined;
  const plain = typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : { ...(doc as object) };
  for (const f of SECRET_FIELDS) delete plain[f];
  return plain;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>) {}

  async log(userId: string, action: string, entity: string, entityId?: unknown, before?: unknown, after?: unknown) {
    await this.logs.create({
      user: new Types.ObjectId(userId),
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      before: snapshot(before),
      after: snapshot(after),
    });
  }

  list(userId: string, limit = 100) {
    return this.logs.find({ user: userId }).sort({ createdAt: -1 }).limit(Math.min(limit, 500)).lean();
  }
}
