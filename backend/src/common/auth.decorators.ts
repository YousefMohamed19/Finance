import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Skips the JWT guard for a route (login, register, Telegram webhook...). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  userId: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
