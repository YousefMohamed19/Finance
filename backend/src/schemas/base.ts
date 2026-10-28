import { SchemaOptions } from '@nestjs/mongoose';

/** Every schema: timestamps, and getters on so encrypted fields are decrypted when serialised. */
export const schemaOptions: SchemaOptions = {
  timestamps: true,
  toJSON: { getters: true, virtuals: false, versionKey: false },
  toObject: { getters: true, virtuals: false, versionKey: false },
};
