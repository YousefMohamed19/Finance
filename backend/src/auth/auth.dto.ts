import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @Length(10, 128) password: string;
  @IsOptional() @IsString() @Length(1, 64) timezone?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @Length(1, 128) password: string;
  /** Required when two-factor authentication is on. */
  @IsOptional() @Matches(/^\d{6}$/) totp?: string;
}

export class RefreshDto {
  @IsString() @Length(20, 1000) refreshToken: string;
}

export class TotpCodeDto {
  @Matches(/^\d{6}$/) code: string;
}

export class PinDto {
  @Matches(/^\d{4,8}$/) pin: string;
}

export class SettingsDto {
  @IsOptional() @IsString() @Length(1, 64) timezone?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(23) reminderHour?: number;
  @IsOptional() @IsBoolean() remindersEnabled?: boolean;
}
