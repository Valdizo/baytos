import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { requireMembership } from '../common/membership.util';
import { StripeAdapter } from './stripe.adapter';
import { AreebaAdapter } from './areeba.adapter';
import { PspAdapter } from './psp.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private stripe: StripeAdapter,
    private areeba: AreebaAdapter,
  ) {}

  private adapter(): PspAdapter {
    return (process.env.PAYMENT_PROVIDER || 'STRIPE') === 'AREEBA' ? this.areeba : this.stripe;
  }

  // Step 1 of adding a card: the app asks for a setup session, then hands
  // the card to the PSP directly (PaymentSheet / hosted checkout).
  async createSetupSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.adapter().createSetupSession({ id: user.id, email: user.email, name: user.name });
  }

  // Step 2: after the PSP confirms, the app tells us which token was saved.
  // We store only the token reference + display data (brand/last4) — never the card.
  async attachPaymentMethod(userId: string, dto: { provider: string; customerId: string }) {
    if (dto.provider === 'STRIPE') {
      const methods = await this.stripe.listSavedMethods(dto.customerId);
      if (methods.length === 0) throw new BadRequestException('No saved card found on this customer yet');
      const m = methods[0];
      return this.prisma.paymentMethod.create({
        data: {
          userId,
          provider: 'STRIPE',
          providerCustomerId: dto.customerId,
          providerPaymentMethodId: m.providerPaymentMethodId,
          brand: m.brand,
          last4: m.last4,
          expMonth: m.expMonth,
          expYear: m.expYear,
        },
      });
    }
    throw new BadRequestException('Provider not supported yet');
  }

  async myPaymentMethods(userId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, provider: true, brand: true, last4: true, expMonth: true, expYear: true },
    });
  }

  async setAutopayMandate(userId: string, unitId: string, dto: { paymentMethodId: string; enabled: boolean; perChargeLimitMinor?: number }) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    const membership = await requireMembership(this.prisma, userId, unit.buildingId);
    if (membership.unitId !== unitId) throw new BadRequestException('You can only manage autopay for your own apartment');
    const pm = await this.prisma.paymentMethod.findFirst({ where: { id: dto.paymentMethodId, userId } });
    if (!pm) throw new NotFoundException('Payment method not found');

    return this.prisma.autopayMandate.upsert({
      where: { unitId },
      create: {
        unitId,
        paymentMethodId: pm.id,
        enabled: dto.enabled,
        perChargeLimitMinor: dto.perChargeLimitMinor ?? 30000,
      },
      update: {
        paymentMethodId: pm.id,
        enabled: dto.enabled,
        perChargeLimitMinor: dto.perChargeLimitMinor ?? 30000,
        revokedAt: dto.enabled ? null : new Date(),
        consentAt: new Date(),
      },
    });
  }

  // Called by the billing engine when a period closes.
  // Respects the tenant's per-charge cap: above it, no automatic charge.
  async autochargeBill(billId: string): Promise<boolean> {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, include: { unit: { include: { mandate: { include: { paymentMethod: true } } } } } });
    if (!bill || bill.totalMinor <= 0) return false;
    const mandate = bill.unit.mandate;
    if (!mandate || !mandate.enabled || mandate.revokedAt) return false;
    if (bill.totalMinor > mandate.perChargeLimitMinor) return false; // above cap → tenant must confirm manually
    return this.charge(bill.id, mandate.paymentMethod);
  }

  // Tenant taps "Pay now" in the app.
  async payBill(userId: string, billId: string, paymentMethodId?: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, include: { unit: true, period: true } });
    if (!bill) throw new NotFoundException('Bill not found');
    const membership = await requireMembership(this.prisma, userId, bill.period.buildingId);
    if (!['PRESIDENT', 'MANAGER'].includes(membership.role) && membership.unitId !== bill.unitId)
      throw new NotFoundException('Bill not found');
    if (bill.status === 'PAID') throw new BadRequestException('Bill already paid');

    const pm = paymentMethodId
      ? await this.prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, userId } })
      : await this.prisma.paymentMethod.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (!pm) throw new BadRequestException('Add a payment method first');
    const ok = await this.charge(billId, pm);
    return { charged: ok };
  }

  private async charge(billId: string, pm: any): Promise<boolean> {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, include: { unit: true, period: { include: { building: true } } } });

    // Idempotency: one key per bill+method — a retry can never double-charge.
    const idempotencyKey = createHash('sha256').update(`${billId}:${pm.id}`).digest('hex').slice(0, 32);
    const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing && ['CAPTURED', 'PROCESSING'].includes(existing.status)) return existing.status === 'CAPTURED';

    const attempt = existing || (await this.prisma.paymentAttempt.create({
      data: { billId, amountMinor: bill.totalMinor, currency: bill.currency, provider: pm.provider, idempotencyKey },
    }));

    const adapter = pm.provider === 'AREEBA' ? this.areeba : this.stripe;
    const result = await adapter.chargeSavedMethod({
      customerId: pm.providerCustomerId,
      paymentMethodId: pm.providerPaymentMethodId,
      amountMinor: bill.totalMinor,
      currency: bill.currency,
      idempotencyKey,
      description: `${bill.period.building.nameEn} — Unit ${bill.unit.unitNumber} — ${bill.period.label}`,
    });

    await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerRef: result.providerRef, status: result.status as any, failureReason: result.failureReason },
    });
    if (result.status === 'CAPTURED') {
      await this.prisma.bill.update({ where: { id: billId }, data: { status: 'PAID' } });
      return true;
    }
    return false;
  }

  // Stripe webhook — the PSP, not the app, is the final source of truth.
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.verifyWebhook(rawBody, signature);

    // Replay protection
    const hash = createHash('sha256').update(rawBody).digest('hex');
    try {
      await this.prisma.webhookEvent.create({ data: { provider: 'STRIPE', eventId: event.id, payloadHash: hash } });
    } catch {
      return { received: true, duplicate: true };
    }

    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const pi: any = event.data.object;
      const attempt = await this.prisma.paymentAttempt.findUnique({ where: { providerRef: pi.id } });
      if (attempt) {
        const captured = event.type === 'payment_intent.succeeded';
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: captured ? 'CAPTURED' : 'FAILED', failureReason: pi.last_payment_error?.code },
        });
        if (captured) await this.prisma.bill.update({ where: { id: attempt.billId }, data: { status: 'PAID' } });
      }
    }
    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'STRIPE', eventId: event.id } },
      data: { processedAt: new Date() },
    });
    return { received: true };
  }
}
