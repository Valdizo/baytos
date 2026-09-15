// PSP abstraction — the platform never sees a card number.
// Adapters: StripeAdapter (dev/testing + future non-Lebanon markets),
// AreebaAdapter (Lebanon production, implemented against the merchant
// technical pack you receive from Areeba's RFP).

export interface SetupSession {
  provider: string;
  clientSecret?: string;      // Stripe: SetupIntent client secret for PaymentSheet
  customerId?: string;
  ephemeralKey?: string;
  checkoutUrl?: string;       // Areeba/Tap style hosted page
}

export interface ChargeResult {
  providerRef: string;
  status: 'CAPTURED' | 'REQUIRES_ACTION' | 'PROCESSING' | 'FAILED';
  failureReason?: string;
  actionUrl?: string;
}

export interface PspAdapter {
  readonly name: string;
  createSetupSession(user: { id: string; email: string; name: string }): Promise<SetupSession>;
  chargeSavedMethod(input: {
    customerId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    description: string;
  }): Promise<ChargeResult>;
}
