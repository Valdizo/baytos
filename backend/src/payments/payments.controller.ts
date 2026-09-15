import { Body, Controller, Get, Headers, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { PaymentsService } from './payments.service';

@Controller('v1')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @UseGuards(AuthGuard)
  @Post('payment-methods/setup-session')
  setup(@Req() req: any) {
    return this.svc.createSetupSession(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Post('payment-methods/attach')
  attach(@Req() req: any, @Body() body: any) {
    return this.svc.attachPaymentMethod(req.user.sub, body);
  }

  @UseGuards(AuthGuard)
  @Get('payment-methods/mine')
  mine(@Req() req: any) {
    return this.svc.myPaymentMethods(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Put('units/:unitId/autopay-mandate')
  mandate(@Req() req: any, @Param('unitId') unitId: string, @Body() body: any) {
    return this.svc.setAutopayMandate(req.user.sub, unitId, body);
  }

  @UseGuards(AuthGuard)
  @Post('bills/:id/pay')
  pay(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.payBill(req.user.sub, id, body?.paymentMethodId);
  }

  // No auth guard — verified by Stripe signature instead
  @Post('webhooks/payments/stripe')
  webhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.svc.handleStripeWebhook(req.rawBody, sig);
  }
}
