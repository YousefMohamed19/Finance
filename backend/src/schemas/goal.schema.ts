import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { schemaOptions } from './base';

@Schema(schemaOptions)
export class Goal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Jar', required: true }) jar: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, min: 1 }) targetAmount: number;
  @Prop() targetDate?: Date;
}
export type GoalDocument = HydratedDocument<Goal>;
export const GoalSchema = SchemaFactory.createForClass(Goal);
