import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

@Schema(schemaOptions)
export class MonthlyReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ required: true }) month: string; // YYYY-MM
  @Prop({ type: Object, required: true }) data: Record<string, unknown>;
}
export type MonthlyReportDocument = HydratedDocument<MonthlyReport>;
export const MonthlyReportSchema = SchemaFactory.createForClass(MonthlyReport);
MonthlyReportSchema.index({ user: 1, month: 1 }, { unique: true });
