import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { IsIn, IsMongoId, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { CounterpartiesService, CounterpartyKind } from './counterparties.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

class UpdateCounterpartyDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsMongoId() defaultJar?: string | null;
}

class ListQuery {
  @IsOptional() @IsIn(['source', 'destination']) kind?: CounterpartyKind;
}

@Controller('counterparties')
export class CounterpartiesController {
  constructor(private readonly service: CounterpartiesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.service.list(u.userId, q.kind);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCounterpartyDto) {
    return this.service.update(u.userId, id, dto);
  }
}
