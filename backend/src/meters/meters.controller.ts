import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { MetersService } from './meters.service';

@UseGuards(AuthGuard)
@Controller('v1')
export class MetersController {
  constructor(private svc: MetersService) {}

  @Post('buildings/:id/meters')
  createMeter(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createMeter(req.user.sub, id, body);
  }

  @Post('buildings/:id/tariffs')
  createTariff(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createTariff(req.user.sub, id, body);
  }

  @Get('buildings/:id/tariffs')
  listTariffs(@Req() req: any, @Param('id') id: string) {
    return this.svc.listTariffs(req.user.sub, id);
  }

  @Get('buildings/:id/reading-grid')
  grid(@Req() req: any, @Param('id') id: string) {
    return this.svc.readingGrid(req.user.sub, id);
  }

  @Post('meters/:id/readings')
  submit(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.submitReading(req.user.sub, id, body);
  }

  @Post('readings/:id/verify')
  verify(@Req() req: any, @Param('id') id: string) {
    return this.svc.verifyReading(req.user.sub, id);
  }

  @Get('meters/:id/consumption')
  consumption(@Req() req: any, @Param('id') id: string) {
    return this.svc.consumption(req.user.sub, id);
  }
}
