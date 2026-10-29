import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { encryptedString } from '../common/crypto';
import { schemaOptions } from './base';

/** Entries the parser was not sure about. They wait here for a one-tap confirmation. */
@Schema(schemaOptions)
export class DraftEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ ...encryptedString, required: true }) raw: string;
  @Prop({ type: String, required: true, enum: ['income', 'expense'] }) type: 'income' | 'expense';
  @Prop() amount?: number;
  @Prop() jarKey?: string;
  @Prop(encryptedString) counterparty?: string;
  @Prop({ required: true }) date: string;
  @Prop({ default: 0 }) confidence: number;
  @Prop({ type: [String], default: [] }) reasons: string[];
  @Prop({ type: String, default: 'quick' }) origin: 'quick' | 'telegram' | 'bank';
  @Prop({ type: String, default: 'pending', enum: ['pending', 'confirmed', 'discarded'] }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'Transaction' }) transaction?: Types.ObjectId;
}
export type DraftEntryDocument = HydratedDocument<DraftEntry>;
export const DraftEntrySchema = SchemaFactory.createForClass(DraftEntry);
