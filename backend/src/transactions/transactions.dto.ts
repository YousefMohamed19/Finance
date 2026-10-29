import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const MAX_AMOUNT = 1_000_000_000_00; // 1 billion in minor units

export class CreateIncomeDto {
  /** Minor units (piasters). 85 EGP = 8500. */
  @IsInt() @Min(1) @Max(MAX_AMOUNT) amount: number;
  @IsDateString() date: string;
  @IsOptional() @IsString() @Length(1, 80) counterparty?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class CreateExpenseDto extends CreateIncomeDto {
  @IsMongoId() jar: string;
}

export class CreateTransferDto {
  @IsInt() @Min(1) @Max(MAX_AMOUNT) amount: number;
  @IsDateString() date: string;
  @IsMongoId() fromJar: string;
  @IsMongoId() toJar: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT) amount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsMongoId() jar?: string;
  @IsOptional() @IsString() @Length(1, 80) counterparty?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ListTransactionsQuery {
  @IsOptional() @IsIn(['income', 'expense', 'transfer']) type?: string;
  @IsOptional() @IsMongoId() jar?: string;
  @IsOptional() @IsMongoId() counterparty?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['true', 'false']) deleted?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}
