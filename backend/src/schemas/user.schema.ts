import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { encryptedString } from '../common/crypto';
import { schemaOptions } from './base';

@Schema({ _id: false })
export class RefreshToken {
  @Prop({ required: true }) hash: string;
  @Prop({ required: true }) expiresAt: Date;
}

@Schema(schemaOptions)
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ default: 'EGP' }) currency: string;
  @Prop({ default: 'Africa/Cairo' }) timezone: string;
  /** Local hour (0-23) for the evening "anything spent today?" nudge. */
  @Prop({ default: 21, min: 0, max: 23 }) reminderHour: number;
  @Prop({ default: true }) remindersEnabled: boolean;
  @Prop() lastReminderDate?: string;

  @Prop(encryptedString) totpSecret?: string;
  @Prop({ default: false }) totpEnabled: boolean;
  @Prop() pinHash?: string;
  @Prop({ type: [RefreshToken], default: [] }) refreshTokens: RefreshToken[];

  @Prop(encryptedString) telegramChatId?: string;
  @Prop({ index: true, sparse: true }) telegramChatIdHash?: string;
  @Prop() telegramLinkCode?: string;
  @Prop() telegramLinkExpires?: Date;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
