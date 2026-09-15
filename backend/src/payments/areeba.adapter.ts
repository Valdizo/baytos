import { Injectable, NotImplementedException } from '@nestjs/common';
import { PspAdapter, SetupSession, ChargeResult } from './psp.interface';

/**
 * Areeba adapter — SKELETON.
 *
 * Areeba is the first-choice Lebanese acquirer, but its saved-card /
 * recurring / split-settlement API details are only available in the
 * merchant technical pack you receive after signing. Send the RFP in
 * LAUNCH_GUIDE.md first, then implement these two methods against the
 * documentation they provide (typically a hosted checkout page that
 * returns a token, plus a merchant-initiated charge endpoint).
 *
 * The rest of the platform doesn't change: it only ever calls
 * createSetupSession() and chargeSavedMethod().
 */
@Injectable()
export class AreebaAdapter implements PspAdapter {
  readonly name = 'AREEBA';

  async createSetupSession(_user: { id: string; email: string; name: string }): Promise<SetupSession> {
    // Expected shape once implemented:
    // 1. POST to Areeba's session/checkout endpoint with your AREEBA_MERCHANT_ID
    // 2. Return { provider: 'AREEBA', checkoutUrl } — the app opens it in a secure webview
    // 3. Areeba redirects back / posts a webhook with the card token; store it as a PaymentMethod
    throw new NotImplementedException('Areeba integration pending merchant technical pack — see LAUNCH_GUIDE.md §5');
  }

  async chargeSavedMethod(_input: any): Promise<ChargeResult> {
    throw new NotImplementedException('Areeba integration pending merchant technical pack — see LAUNCH_GUIDE.md §5');
  }
}
