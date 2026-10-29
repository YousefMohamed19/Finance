import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

@Schema(schemaOptions)
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: String, required: true }) kind: 'daily-reminder' | 'renewal' | 'monthly-report' | 'info';
  @Prop({ required: true }) message: string;
  @Prop({ default: false }) read: boolean;
}
export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
