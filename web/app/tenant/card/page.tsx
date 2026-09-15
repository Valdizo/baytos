'use client';
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { api, money } from '@/lib/api';

// Card entry happens inside Stripe's iframe — the card number never touches
// the Baytos backend. We store only a token + brand/last4.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PK ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PK) : null;

function SaveCardForm({ customerId, onSaved }: { customerId: string; onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!stripe || !elements) return;
    setBusy(true); setError('');
    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });
    if (confirmError) {
      setError(confirmError.message || 'Card was not saved');
      setBusy(false);
      return;
    }
    try {
      await api('/v1/payment-methods/attach', { method: 'POST', body: JSON.stringify({ provider: 'STRIPE', customerId }) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="t-card">
      <PaymentElement />
      {error && <p className="t-note" style={{ color: 'var(--clay)' }}>{error}</p>}
      <button className="t-btn" style={{ marginTop: 12 }} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save card securely'}
      </button>
    </div>
  );
}

export default function CardPage() {
  const [methods, setMethods] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [session, setSession] = useState<any>(null);
  const [mandateOn, setMandateOn] = useState(false);
  const [cap, setCap] = useState('300');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const me = await api('/v1/auth/me');
    const m = me.memberships.find((x: any) => x.unitId);
    if (m) setUnitId(m.unitId);
    setMethods(await api('/v1/payment-methods/mine'));
  };
  useEffect(() => { load().catch(() => {}); }, []);

  async function startAdd() {
    setMsg('');
    if (!stripePromise) return setMsg('Set NEXT_PUBLIC_STRIPE_PK in web/.env.local first (see LAUNCH_GUIDE §4).');
    setSession(await api('/v1/payment-methods/setup-session', { method: 'POST' }));
  }

  async function saveMandate(enabled: boolean) {
    setMsg('');
    if (!methods[0]) return setMsg('Add a card first.');
    try {
      await api(`/v1/units/${unitId}/autopay-mandate`, {
        method: 'PUT',
        body: JSON.stringify({
          paymentMethodId: methods[0].id,
          enabled,
          perChargeLimitMinor: Math.round(parseFloat(cap || '300') * 100),
        }),
      });
      setMandateOn(enabled);
      setMsg(enabled
        ? `Autopay on — monthly bills up to $${cap} are charged automatically. Anything larger waits for your confirmation.`
        : 'Autopay off — you will pay each bill manually.');
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <>
      <h2 className="t-h" style={{ marginTop: 0 }}>Saved cards</h2>
      {methods.map((m) => (
        <div key={m.id} className="t-card">
          <div style={{ fontWeight: 700 }}>{(m.brand || 'card').toUpperCase()} •••• {m.last4}</div>
          <div className="t-note" style={{ marginTop: 2 }}>expires {m.expMonth}/{m.expYear}</div>
        </div>
      ))}

      {!session ? (
        <button className="t-btn" onClick={startAdd}>{methods.length ? 'Replace card' : 'Add payment method'}</button>
      ) : (
        stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret }}>
            <SaveCardForm customerId={session.customerId} onSaved={() => { setSession(null); setMsg('Card saved.'); load(); }} />
          </Elements>
        )
      )}
      <p className="t-note">
        Your card details go directly to the payment provider's secure form. Baytos only ever stores a payment token and
        the last 4 digits.
      </p>
      {msg && <p className="t-note" style={{ fontWeight: 600 }}>{msg}</p>}

      <h2 className="t-h">Autopay</h2>
      <div className="t-card">
        <div className="t-switchrow">
          <span className="grow">Charge my card automatically when a bill is issued</span>
          <input type="checkbox" checked={mandateOn} onChange={(e) => saveMandate(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--cedar)' }} />
        </div>
        <p className="t-note">Per-charge limit ($) — larger bills always ask you first</p>
        <input className="t-input" inputMode="decimal" style={{ textAlign: 'right', fontSize: 16 }} value={cap}
          onChange={(e) => setCap(e.target.value)} onBlur={() => mandateOn && saveMandate(true)} />
      </div>
    </>
  );
}
