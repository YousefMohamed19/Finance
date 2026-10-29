import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

/** Subscriptions and other repeating items (Netflix, gym, rent, salary...). */
@Schema(schemaOptions)
export class RecurringRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: String, required: true, enum: ['income', 'expense'] }) type: 'income' | 'expense';
  @Prop({ required: true, min: 1 }) amount: number;
  @Prop({ type: Types.ObjectId, ref: 'Jar' }) jar?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Counterparty' }) counterparty?: Types.ObjectId;
  @Prop({ type: String, required: true, enum: ['weekly', 'monthly', 'yearly'] }) interval: 'weekly' | 'monthly' | 'yearly';
  @Prop({ required: true, min: 1, max: 31 }) anchorDay: number;
  @Prop({ required: true }) nextDate: Date;
  @Prop({ default: 2, min: 0, max: 30 }) remindDaysBefore: number;
  @Prop() lastRemindedFor?: Date;
  @Prop({ default: true }) active: boolean;
}
export type RecurringRuleDocument = HydratedDocument<RecurringRule>;
export const RecurringRuleSchema = SchemaFactory.createForClass(RecurringRule);
