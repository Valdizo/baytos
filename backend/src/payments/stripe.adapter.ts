import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { PspAdapter, SetupSession, ChargeResult } from './psp.interface';

@Injectable()
export class StripeAdapter implements PspAdapter {
  readonly name = 'STRIPE';
  private stripe: Stripe | null = null;

  private client(): Stripe {
    if (!this.stripe) {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return this.stripe;
  }

  // Creates a Customer + SetupIntent. The mobile app opens Stripe PaymentSheet
  // with these values; the card goes straight to Stripe, never to our server.
  async createSetupSession(user: { id: string; email: string; name: string }): Promise<SetupSession> {
    const stripe = this.client();
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { baytosUserId: user.id },
    });
    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customer.id }, { apiVersion: '2024-06-20' as any });
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session', // allows autopay (merchant-initiated) charges later
    });
    return {
      provider: this.name,
      clientSecret: setupIntent.client_secret!,
      customerId: customer.id,
      ephemeralKey: ephemeralKey.secret!,
    };
  }

  async chargeSavedMethod(input: {
    customerId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    description: string;
  }): Promise<ChargeResult> {
    const stripe = this.client();
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          off_session: true,
          confirm: true,
          description: input.description,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (pi.status === 'succeeded') return { providerRef: pi.id, status: 'CAPTURED' };
      if (pi.status === 'requires_action') return { providerRef: pi.id, status: 'REQUIRES_ACTION' };
      return { providerRef: pi.id, status: 'PROCESSING' };
    } catch (err: any) {
      const ref = err?.payment_intent?.id || `err_${input.idempotencyKey}`;
      return { providerRef: ref, status: 'FAILED', failureReason: err?.code || err?.message };
    }
  }

  async listSavedMethods(customerId: string) {
    const methods = await this.client().paymentMethods.list({ customer: customerId, type: 'card' });
    return methods.data.map((m) => ({
      providerPaymentMethodId: m.id,
      brand: m.card?.brand,
      last4: m.card?.last4,
      expMonth: m.card?.exp_month,
      expYear: m.card?.exp_year,
    }));
  }

  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  }
}
