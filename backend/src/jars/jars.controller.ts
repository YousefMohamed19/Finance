import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { JarsService } from './jars.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { SetAllocationDto, UpdateJarDto } from './jars.dto';

@Controller('jars')
export class JarsController {
  constructor(private readonly jars: JarsService) {}

  @Get()
  overview(@CurrentUser() u: AuthUser) {
    return this.jars.overview(u.userId);
  }

  @Get('allocations')
  history(@CurrentUser() u: AuthUser) {
    return this.jars.allocationHistory(u.userId);
  }

  @Put('allocation')
  setAllocation(@CurrentUser() u: AuthUser, @Body() dto: SetAllocationDto) {
    return this.jars.setAllocation(u.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateJarDto) {
    return this.jars.update(u.userId, id, dto);
  }
}
