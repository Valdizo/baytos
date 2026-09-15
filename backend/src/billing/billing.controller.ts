import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { BillingService } from './billing.service';

@UseGuards(AuthGuard)
@Controller('v1')
export class BillingController {
  constructor(private svc: BillingService) {}

  @Post('buildings/:id/expenses')
  addExpense(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.addExpense(req.user.sub, id, body);
  }

  @Get('buildings/:id/expenses')
  listExpenses(@Req() req: any, @Param('id') id: string) {
    return this.svc.listExpenses(req.user.sub, id);
  }

  @Post('buildings/:id/periods')
  openPeriod(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.openPeriod(req.user.sub, id, body);
  }

  @Get('buildings/:id/periods/:periodId/preview')
  preview(@Req() req: any, @Param('id') id: string, @Param('periodId') periodId: string) {
    return this.svc.preview(req.user.sub, id, periodId);
  }

  @Post('buildings/:id/periods/:periodId/close')
  close(@Req() req: any, @Param('id') id: string, @Param('periodId') periodId: string, @Body() body: any) {
    return this.svc.closePeriod(req.user.sub, id, periodId, body || {});
  }

  @Get('bills/mine')
  myBills(@Req() req: any) {
    return this.svc.myBills(req.user.sub);
  }

  @Get('bills/:id')
  bill(@Req() req: any, @Param('id') id: string) {
    return this.svc.getBill(req.user.sub, id);
  }

  @Get('buildings/:id/bills')
  buildingBills(@Req() req: any, @Param('id') id: string) {
    return this.svc.buildingBills(req.user.sub, id);
  }
}
