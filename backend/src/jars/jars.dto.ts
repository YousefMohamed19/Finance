import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsMongoId, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class ShareDto {
  @IsMongoId() jar: string;
  /** Basis points: 12.5% = 1250. */
  @IsInt() @Min(0) @Max(10000) percentBp: number;
}

export class SetAllocationDto {
  @ValidateNested({ each: true }) @Type(() => ShareDto) @ArrayMinSize(1) shares: ShareDto[];
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}

export class UpdateJarDto {
  @IsOptional() @IsString() @Length(1, 40) name?: string;
  @IsOptional() @IsString() @Length(1, 8) icon?: string;
}
