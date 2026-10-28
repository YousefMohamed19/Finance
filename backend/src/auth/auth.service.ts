import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { createHash, randomBytes, randomInt } from 'crypto';
import { User, UserDocument } from '../schemas';
import { JarsService } from '../jars/jars.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto, RegisterDto, SettingsDto } from './auth.dto';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly jwt: JwtService,
    private readonly jars: JarsService,
    private readonly audit: AuditService,
  ) {}

  private isValidTimezone(tz: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  async register(dto: RegisterDto) {
    if (await this.users.exists({ email: dto.email.toLowerCase() })) throw new ConflictException('Email already registered');
    if (dto.timezone && !this.isValidTimezone(dto.timezone)) throw new BadRequestException('Unknown timezone');
    const user = await this.users.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      timezone: dto.timezone ?? 'Africa/Cairo',
      currency: dto.currency?.toUpperCase() ?? 'EGP',
    });
    await this.jars.createDefaults(String(user._id));
    await this.audit.log(String(user._id), 'user.register', 'User', user._id);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ email: dto.email.toLowerCase() });
    // Same error for unknown email and wrong password, to avoid leaking which emails exist.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Wrong email or password');
    if (user.totpEnabled) {
      if (!dto.totp) throw new UnauthorizedException({ message: 'Two-factor code required', totpRequired: true });
      if (!authenticator.check(dto.totp, user.totpSecret!)) throw new UnauthorizedException('Wrong two-factor code');
    }
    await this.audit.log(String(user._id), 'user.login', 'User', user._id);
    return this.issueTokens(user);
  }

  private async issueTokens(user: UserDocument) {
    const accessToken = this.jwt.sign({ sub: String(user._id), typ: 'access' }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL });
    const refreshToken = `${user._id}.${randomBytes(48).toString('base64url')}`;
    const now = Date.now();
    user.refreshTokens = [
      ...user.refreshTokens.filter((t) => t.expiresAt.getTime() > now).slice(-9),
      { hash: sha256(refreshToken), expiresAt: new Date(now + REFRESH_TTL_DAYS * 86400000) },
    ];
    await user.save();
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  /** Refresh tokens are single-use: each refresh rotates it. Reusing an old one revokes every session. */
  async refresh(refreshToken: string) {
    const userId = refreshToken.split('.')[0];
    const user = /^[0-9a-f]{24}$/.test(userId) ? await this.users.findById(userId) : null;
    if (!user) throw new UnauthorizedException();
    const hash = sha256(refreshToken);
    const match = user.refreshTokens.find((t) => t.hash === hash);
    if (!match || match.expiresAt.getTime() < Date.now()) {
      if (!match) {
        user.refreshTokens = [];
        await user.save();
        await this.audit.log(userId, 'auth.refresh-reuse', 'User', user._id);
      }
      throw new UnauthorizedException();
    }
    user.refreshTokens = user.refreshTokens.filter((t) => t.hash !== hash);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    const userId = refreshToken.split('.')[0];
    if (!/^[0-9a-f]{24}$/.test(userId)) return { ok: true };
    await this.users.updateOne({ _id: userId }, { $pull: { refreshTokens: { hash: sha256(refreshToken) } } });
    return { ok: true };
  }

  publicUser(user: UserDocument) {
    return {
      id: String(user._id),
      email: user.email,
      currency: user.currency,
      timezone: user.timezone,
      reminderHour: user.reminderHour,
      remindersEnabled: user.remindersEnabled,
      totpEnabled: user.totpEnabled,
      hasPin: !!user.pinHash,
      telegramLinked: !!user.telegramChatIdHash,
    };
  }

  private async getUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async me(userId: string) {
    return this.publicUser(await this.getUser(userId));
  }

  async updateSettings(userId: string, dto: SettingsDto) {
    const user = await this.getUser(userId);
    if (dto.timezone && !this.isValidTimezone(dto.timezone)) throw new BadRequestException('Unknown timezone');
    const before = this.publicUser(user);
    if (dto.timezone) user.timezone = dto.timezone;
    if (dto.currency) user.currency = dto.currency.toUpperCase();
    if (dto.reminderHour !== undefined) user.reminderHour = dto.reminderHour;
    if (dto.remindersEnabled !== undefined) user.remindersEnabled = !!dto.remindersEnabled;
    await user.save();
    await this.audit.log(userId, 'user.settings', 'User', user._id, before, this.publicUser(user));
    return this.publicUser(user);
  }

  /** Step 1 of 2FA: create a secret and a QR code for any authenticator app (Google Authenticator, Aegis...). */
  async totpSetup(userId: string) {
    const user = await this.getUser(userId);
    if (user.totpEnabled) throw new BadRequestException('Two-factor authentication is already on');
    const secret = authenticator.generateSecret();
    user.totpSecret = secret;
    await user.save();
    const uri = authenticator.keyuri(user.email, 'Finanse', secret);
    return { secret, otpauthUrl: uri, qrDataUrl: await QRCode.toDataURL(uri) };
  }

  /** Step 2 of 2FA: prove the app works by entering a code. */
  async totpEnable(userId: string, code: string) {
    const user = await this.getUser(userId);
    if (!user.totpSecret || !authenticator.check(code, user.totpSecret)) throw new BadRequestException('Wrong code');
    user.totpEnabled = true;
    await user.save();
    await this.audit.log(userId, 'user.2fa-enable', 'User', user._id);
    return this.publicUser(user);
  }

  async totpDisable(userId: string, code: string) {
    const user = await this.getUser(userId);
    if (!user.totpEnabled || !authenticator.check(code, user.totpSecret!)) throw new BadRequestException('Wrong code');
    user.totpEnabled = false;
    user.totpSecret = undefined;
    await user.save();
    await this.audit.log(userId, 'user.2fa-disable', 'User', user._id);
    return this.publicUser(user);
  }

  /** PIN used by the PWA lock screen. */
  async setPin(userId: string, pin: string) {
    const user = await this.getUser(userId);
    user.pinHash = await bcrypt.hash(pin, 10);
    await user.save();
    await this.audit.log(userId, 'user.pin-set', 'User', user._id);
    return this.publicUser(user);
  }

  async verifyPin(userId: string, pin: string) {
    const user = await this.getUser(userId);
    if (!user.pinHash || !(await bcrypt.compare(pin, user.pinHash))) throw new UnauthorizedException('Wrong PIN');
    return { ok: true };
  }

  /** One-time code the user sends to the bot as "/link 123456" to connect their Telegram chat. */
  async telegramLinkCode(userId: string) {
    const user = await this.getUser(userId);
    const code = String(randomInt(100000, 1000000));
    user.telegramLinkCode = sha256(code);
    user.telegramLinkExpires = new Date(Date.now() + 10 * 60000);
    await user.save();
    return { code, expiresInMinutes: 10, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null, enabled: !!process.env.TELEGRAM_BOT_TOKEN };
  }

  async telegramUnlink(userId: string) {
    const user = await this.getUser(userId);
    user.telegramChatId = undefined;
    user.telegramChatIdHash = undefined;
    await user.save();
    await this.audit.log(userId, 'user.telegram-unlink', 'User', user._id);
    return this.publicUser(user);
  }
}
