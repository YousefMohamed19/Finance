import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { encryptedString } from '../common/crypto';
import { schemaOptions } from './base';

/** Where money comes from (source) or goes to (destination). */
@Schema(schemaOptions)
export class Counterparty {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ ...encryptedString, required: true }) name: string;
  @Prop({ required: true }) nameHash: string;
  @Prop({ type: String, required: true, enum: ['source', 'destination'] }) kind: 'source' | 'destination';
  /** Learned from confirmed entries: the jar this destination is usually paid from. */
  @Prop({ type: Types.ObjectId, ref: 'Jar' }) defaultJar?: Types.ObjectId;
}
export type CounterpartyDocument = HydratedDocument<Counterparty>;
export const CounterpartySchema = SchemaFactory.createForClass(Counterparty);
CounterpartySchema.index({ user: 1, nameHash: 1, kind: 1 }, { unique: true });
