'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, money } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><BillDetail /></Suspense>; }

// Tap any line to see exactly how it was calculated — the transparency promise.
function BillDetail() {
  const id = useSearchParams().get('id') || '';
  const [bill, setBill] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api(`/v1/bills/${id}`).then(setBill).catch((e) => setMsg(e.message));
  useEffect(() => { if (id) load(); }, [id]);

  async function pay() {
    setPaying(true); setMsg('');
    try {
      const r = await api(`/v1/bills/${id}/pay`, { method: 'POST', body: JSON.stringify({}) });
      setMsg(r.charged ? 'Paid — your card was charged successfully.' : 'The charge did not complete. Add a card under Card & autopay first.');
      load();
    } catch (e: any) {
      setMsg(`Payment failed: ${e.message}`);
    } finally {
      setPaying(false);
    }
  }

  if (!bill) return <p className="t-note">{msg || 'Loading…'}</p>;

  return (
    <>
      <h1 style={{ fontSize: 19, fontWeight: 700 }}>{bill.period.building.nameEn} — Unit {bill.unit.unitNumber}</h1>
      <p style={{ color: 'var(--soft)', marginBottom: 14 }}>
        Period {bill.period.label} · due {new Date(bill.dueAt).toLocaleDateString()}
      </p>

      <div className="t-card" style={{ padding: 0, overflow: 'hidden' }}>
        {bill.lineItems.map((l: any) => (
          <div key={l.id}>
            <div className="t-line" onClick={() => setOpen(open === l.id ? null : l.id)} style={{ cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div className="desc">{l.description}</div>
                {l.quantity != null && <div className="qty">{Number(l.quantity).toFixed(1)} {l.unitLabel}</div>}
              </div>
              <span className={`amt ${l.amountMinor < 0 ? 'credit' : ''}`}>{money(l.amountMinor, bill.currency)}</span>
            </div>
            {open === l.id && l.calculation && (
              <div className="t-calc">
                {l.calculation.previousReading != null && <div>Previous reading: {Number(l.calculation.previousReading).toFixed(1)}</div>}
                {l.calculation.currentReading != null && <div>Current reading: {Number(l.calculation.currentReading).toFixed(1)}</div>}
                {l.calculation.ratePerUnitMinor != null && <div>Rate: {money(l.calculation.ratePerUnitMinor)} per unit</div>}
                {l.calculation.fixedFeeMinor > 0 && <div>Fixed fee: {money(l.calculation.fixedFeeMinor)}</div>}
                {l.calculation.totalMinor != null && <div>Expense total: {money(l.calculation.totalMinor)} — split: {l.calculation.allocation?.toLowerCase()}</div>}
              </div>
            )}
          </div>
        ))}
        <div className="t-total"><span>Total</span><span className="amt">{money(bill.totalMinor, bill.currency)}</span></div>
      </div>

      {msg && <p className="t-note" style={{ marginBottom: 10 }}>{msg}</p>}
      {!['PAID', 'VOID'].includes(bill.status) && (
        <button className="t-btn gold" onClick={pay} disabled={paying}>
          {paying ? 'Charging…' : `Pay ${money(bill.totalMinor, bill.currency)} now`}
        </button>
      )}
      {bill.status === 'PAID' && <p style={{ color: 'var(--cedar)', fontWeight: 700, textAlign: 'center' }}>Paid — thank you.</p>}

      {/* Whish: the building's own QR. Scanning settles directly with the building,
          so the payment lands outside the app — the manager marks it received. */}
      {!['PAID', 'VOID'].includes(bill.status) && bill.period.building.whishQrData && (
        <div className="whish">
          <h2 className="t-h" style={{ marginTop: 22 }}>Or pay with Whish</h2>
          <p className="t-note">
            Scan this with your Whish app and send {money(bill.totalMinor, bill.currency)}.
            Your statement is marked paid once {bill.period.building.nameEn} confirms it.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bill.period.building.whishQrData} alt={`Whish payment QR for ${bill.period.building.nameEn}`} />
          {bill.period.building.whishRecipient && (
            <p className="t-note" style={{ fontWeight: 600 }}>{bill.period.building.whishRecipient}</p>
          )}
          <p className="t-note">Check the name above matches before you send.</p>
        </div>
      )}

      {bill.payments.length > 0 && (
        <>
          <h2 className="t-h">Payment history</h2>
          {bill.payments.map((p: any) => (
            <p key={p.id} className="t-note" style={{ marginTop: 4 }}>
              {new Date(p.createdAt).toLocaleString()} — {money(p.amountMinor)} — {p.status.toLowerCase()}
              {p.failureReason ? ` (${p.failureReason})` : ''}
            </p>
          ))}
        </>
      )}
      <p className="t-note" style={{ textAlign: 'center', marginTop: 16 }}>Tap any line to see how it was calculated.</p>
    </>
  );
}
