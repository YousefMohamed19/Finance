import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

@Schema(schemaOptions)
export class Jar {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true }) key: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '🫙' }) icon: string;
  /** Receives rounding leftovers of every split ("For Me"). */
  @Prop({ default: false }) remainder: boolean;
  @Prop({ default: 0 }) order: number;
}
export type JarDocument = HydratedDocument<Jar>;
export const JarSchema = SchemaFactory.createForClass(Jar);
JarSchema.index({ user: 1, key: 1 }, { unique: true });

@Schema({ _id: false })
export class AllocationShare {
  @Prop({ type: Types.ObjectId, ref: 'Jar', required: true }) jar: Types.ObjectId;
  /** Basis points, 100% = 10000. */
  @Prop({ required: true, min: 0, max: 10000 }) percentBp: number;
}

/** A version of the percentage split. Never edited: changing the split creates a new version. */
@Schema(schemaOptions)
export class AllocationVersion {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true }) version: number;
  @Prop({ type: [AllocationShare], required: true }) shares: AllocationShare[];
  @Prop() note?: string;
}
export type AllocationVersionDocument = HydratedDocument<AllocationVersion>;
export const AllocationVersionSchema = SchemaFactory.createForClass(AllocationVersion);
AllocationVersionSchema.index({ user: 1, version: -1 }, { unique: true });
