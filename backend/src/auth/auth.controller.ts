import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { LoginDto, PinDto, RefreshDto, RegisterDto, SettingsDto, TotpCodeDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u.userId);
  }

  @Patch('settings')
  settings(@CurrentUser() u: AuthUser, @Body() dto: SettingsDto) {
    return this.auth.updateSettings(u.userId, dto);
  }

  @Post('2fa/setup')
  totpSetup(@CurrentUser() u: AuthUser) {
    return this.auth.totpSetup(u.userId);
  }

  @Post('2fa/enable')
  totpEnable(@CurrentUser() u: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpEnable(u.userId, dto.code);
  }

  @Post('2fa/disable')
  totpDisable(@CurrentUser() u: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpDisable(u.userId, dto.code);
  }

  @Post('pin')
  setPin(@CurrentUser() u: AuthUser, @Body() dto: PinDto) {
    return this.auth.setPin(u.userId, dto.pin);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post('pin/verify')
  verifyPin(@CurrentUser() u: AuthUser, @Body() dto: PinDto) {
    return this.auth.verifyPin(u.userId, dto.pin);
  }

  @Post('telegram/link-code')
  telegramCode(@CurrentUser() u: AuthUser) {
    return this.auth.telegramLinkCode(u.userId);
  }

  @Delete('telegram')
  telegramUnlink(@CurrentUser() u: AuthUser) {
    return this.auth.telegramUnlink(u.userId);
  }
}
