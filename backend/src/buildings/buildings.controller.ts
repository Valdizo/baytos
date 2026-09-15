import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { BuildingsService } from './buildings.service';

@UseGuards(AuthGuard)
@Controller('v1')
export class BuildingsController {
  constructor(private svc: BuildingsService) {}

  @Post('buildings')
  create(@Req() req: any, @Body() body: any) {
    return this.svc.create(req.user.sub, body);
  }

  @Get('buildings/:id/dashboard')
  dashboard(@Req() req: any, @Param('id') id: string) {
    return this.svc.dashboard(req.user.sub, id);
  }

  @Post('buildings/:id/units')
  addUnits(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.addUnits(req.user.sub, id, body.units);
  }

  @Get('buildings/:id/units')
  listUnits(@Req() req: any, @Param('id') id: string) {
    return this.svc.listUnits(req.user.sub, id);
  }

  @Post('units/:unitId/invitations')
  invite(@Req() req: any, @Param('unitId') unitId: string, @Body() body: any) {
    return this.svc.invite(req.user.sub, unitId, body.role);
  }

  @Post('invitations/accept')
  accept(@Req() req: any, @Body() body: any) {
    return this.svc.acceptInvitation(req.user.sub, body);
  }
}
