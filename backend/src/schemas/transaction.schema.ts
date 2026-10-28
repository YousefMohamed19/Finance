import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { encryptedString } from '../common/crypto';
import { schemaOptions } from './base';

export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionOrigin = 'manual' | 'quick' | 'telegram' | 'recurring' | 'bank' | 'draft';

@Schema({ _id: false })
export class Split {
  @Prop({ type: Types.ObjectId, ref: 'Jar', required: true }) jar: Types.ObjectId;
  @Prop({ required: true }) amount: number;
}

/** All amounts are integers in minor units (piasters). Never floats. */
@Schema(schemaOptions)
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ type: String, required: true, enum: ['income', 'expense', 'transfer'] }) type: TransactionType;
  @Prop({ required: true, min: 1, validate: Number.isInteger }) amount: number;
  @Prop({ required: true }) date: Date;

  /** expense: the jar it is paid from. */
  @Prop({ type: Types.ObjectId, ref: 'Jar' }) jar?: Types.ObjectId;
  /** transfer: from -> to. */
  @Prop({ type: Types.ObjectId, ref: 'Jar' }) fromJar?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Jar' }) toJar?: Types.ObjectId;
  /** income: how it was split, frozen at the time it arrived. */
  @Prop({ type: [Split], default: undefined }) splits?: Split[];
  @Prop({ type: Types.ObjectId, ref: 'AllocationVersion' }) allocationVersion?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Counterparty' }) counterparty?: Types.ObjectId;
  @Prop(encryptedString) note?: string;
  @Prop({ type: String, default: 'manual' }) origin: TransactionOrigin;
  @Prop({ type: Types.ObjectId, ref: 'RecurringRule' }) recurringRule?: Types.ObjectId;
  /** Soft delete: nothing is ever lost by accident. */
  @Prop({ type: Date, default: null }) deletedAt: Date | null;
}
export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ user: 1, deletedAt: 1, date: -1 });
