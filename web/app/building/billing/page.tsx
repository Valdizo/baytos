'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, money } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Billing /></Suspense>; }

function Billing() {
  const id = useSearchParams().get('id') || '';
  const [dash, setDash] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const d = await api(`/v1/buildings/${id}/dashboard`);
    setDash(d);
    setBills(await api(`/v1/buildings/${id}/bills`));
    if (d.openPeriod) setPreview(await api(`/v1/buildings/${id}/periods/${d.openPeriod.id}/preview`));
  };
  useEffect(() => { if (id) load().catch((e) => setErr(e.message)); }, [id]);

  async function openPeriod() {
    const now = new Date();
    const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await api(`/v1/buildings/${id}/periods`, {
      method: 'POST',
      body: JSON.stringify({
        label,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
      }),
    });
    load();
  }

  async function close() {
    if (!confirm('Close the period and issue statements? Issued bills are immutable, and autopay charges will run for apartments with a mandate.')) return;
    setBusy(true); setErr('');
    try {
      const r = await api(`/v1/buildings/${id}/periods/${dash.openPeriod.id}/close`, { method: 'POST', body: JSON.stringify({ scheduleAutopay: true }) });
      setResult(r);
      setPreview(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Shell buildingId={id}>
      <h1>Billing</h1>
      <p className="sub">Preview every apartment's statement before anything is issued or charged.</p>
      {err && <div className="error">{err}</div>}
      {result && <div className="ok">Period closed — {result.issuedBills} statements issued, {result.paymentJobsCreated} autopay charges started.</div>}

      {!dash?.openPeriod && (
        <div className="panel">
          <p style={{ marginBottom: 12 }}>No billing period is open.</p>
          <button onClick={openPeriod}>Open this month's period</button>
        </div>
      )}

      {preview && (
        <>
          <h2>Preview — {preview.label}</h2>
          {preview.warnings.map((w: string, i: number) => <div className="warn" key={i}>{w}</div>)}
          <table className="ledger">
            <thead><tr><th>Unit</th><th>Line items</th><th className="num">Total</th></tr></thead>
            <tbody>
              {preview.units.map((u: any) => (
                <tr key={u.unitId}>
                  <td style={{ width: 70 }}><b>{u.unitNumber}</b></td>
                  <td>
                    {u.lines.map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: i < u.lines.length - 1 ? '1px dotted var(--rule)' : 'none' }}>
                        <span>
                          {l.description}
                          {l.quantity != null && <span style={{ color: 'var(--ink-soft)' }}> — {Number(l.quantity).toFixed(1)} {l.unitLabel}</span>}
                        </span>
                        <span className={`num ${l.amountMinor < 0 ? 'credit' : ''}`}>{money(l.amountMinor)}</span>
                      </div>
                    ))}
                  </td>
                  <td className="num money" style={{ width: 110 }}>{money(u.totalMinor)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>Building total</td>
                <td className="num money" style={{ fontWeight: 700 }}>{money(preview.grandTotalMinor)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 16 }}>
            <button onClick={close} disabled={busy}>{busy ? 'Closing…' : 'Close period & issue statements'}</button>
          </div>
        </>
      )}

      <h2>Issued bills</h2>
      <table className="ledger">
        <thead><tr><th>Period</th><th>Unit</th><th className="num">Total</th><th>Due</th><th>Status</th><th>Payments</th></tr></thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.id}>
              <td>{b.period.label}</td>
              <td><b>{b.unit.unitNumber}</b></td>
              <td className="num money">{money(b.totalMinor, b.currency)}</td>
              <td>{new Date(b.dueAt).toLocaleDateString()}</td>
              <td><span className={`pill ${b.status.toLowerCase().includes('paid') && b.status !== 'PARTIALLY_PAID' ? 'paid' : b.status === 'OVERDUE' ? 'overdue' : b.status === 'VOID' ? 'open' : 'issued'}`}>{b.status.toLowerCase().replace('_', ' ')}</span></td>
              <td>{b.payments.map((p: any) => <span key={p.id} className={`pill ${p.status === 'CAPTURED' ? 'paid' : p.status === 'FAILED' ? 'failed' : 'open'}`} style={{ marginRight: 4 }}>{p.status.toLowerCase()}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
