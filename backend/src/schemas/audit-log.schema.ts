import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

/** Append-only record of every create, edit and delete. */
@Schema({ ...schemaOptions, timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) entity: string;
  @Prop() entityId?: string;
  @Prop({ type: Object }) before?: Record<string, unknown>;
  @Prop({ type: Object }) after?: Record<string, unknown>;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
