'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

const METER_TYPES = ['GENERATOR', 'EDL', 'COLD_WATER', 'HOT_WATER', 'OTHER'];

export default function Page() {
  return <Suspense fallback={null}><Settings /></Suspense>;
}

function Settings() {
  const id = useSearchParams().get('id') || '';
  const [building, setBuilding] = useState<any>(null);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ meterType: 'GENERATOR', rate: '', fixed: '' });
  const [recipient, setRecipient] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = async () => {
    const d = await api(`/v1/buildings/${id}/dashboard`);
    setBuilding(d.building);
    setRecipient(d.building?.whishRecipient || '');
    setTariffs(await api(`/v1/buildings/${id}/tariffs`));
  };
  useEffect(() => { if (id) load().catch((e) => setErr(e.message)); }, [id]);

  function flash(m: string) { setOk(m); setErr(''); setTimeout(() => setOk(''), 4000); }

  async function saveTariff() {
    setErr('');
    try {
      await api(`/v1/buildings/${id}/tariffs`, {
        method: 'POST',
        body: JSON.stringify({
          meterType: form.meterType,
          ratePerUnitMinor: Math.round(Number(form.rate) * 100),
          fixedFeeMinor: Math.round(Number(form.fixed || 0) * 100),
        }),
      });
      setForm({ ...form, rate: '', fixed: '' });
      await load();
      flash('Rate saved. It applies to the next billing preview.');
    } catch (e: any) { setErr(e.message); }
  }

  // The QR is read in the browser and stored as a data URL — no upload service needed.
  async function onQrFile(file?: File) {
    if (!file) return;
    setErr('');
    if (file.size > 300_000) { setErr('That image is over 300KB. Please use a smaller screenshot of the QR.'); return; }
    const dataUrl: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error('Could not read that file'));
      r.readAsDataURL(file);
    });
    try {
      await api(`/v1/buildings/${id}/settings`, { method: 'PATCH', body: JSON.stringify({ whishQrData: dataUrl }) });
      await load();
      flash('Whish QR saved. Tenants will see it on their statement.');
    } catch (e: any) { setErr(e.message); }
  }

  async function saveRecipient() {
    setErr('');
    try {
      await api(`/v1/buildings/${id}/settings`, { method: 'PATCH', body: JSON.stringify({ whishRecipient: recipient }) });
      await load();
      flash('Saved.');
    } catch (e: any) { setErr(e.message); }
  }

  async function removeQr() {
    if (!confirm('Remove the Whish QR? Tenants will no longer see a way to pay by Whish.')) return;
    try {
      await api(`/v1/buildings/${id}/settings`, { method: 'PATCH', body: JSON.stringify({ whishQrData: '' }) });
      await load();
      flash('QR removed.');
    } catch (e: any) { setErr(e.message); }
  }

  if (!building) return <Shell buildingId={id}><p className="sub">Loading…</p></Shell>;

  return (
    <Shell buildingId={id}>
      <h1>Settings</h1>
      <p className="sub">Payment details and the meter rates used to calculate every bill.</p>
      {err && <div className="error">{err}</div>}
      {ok && <div className="warn">{ok}</div>}

      <h2>Whish payment QR</h2>
      <div className="panel" style={{ maxWidth: 560 }}>
        <p className="sub" style={{ marginBottom: 14 }}>
          Tenants scan this from their statement to pay you through Whish Money. Upload the QR from your
          Whish app — it is stored with the building and shown on every bill.
        </p>
        {building.whishQrData ? (
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={building.whishQrData} alt="Whish payment QR" width={150} height={150}
                 style={{ border: '1px solid var(--rule)', background: '#fff', padding: 6 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="pill paid" style={{ marginBottom: 10 }}>QR is live for tenants</div>
              <button className="quiet" onClick={removeQr}>Remove QR</button>
            </div>
          </div>
        ) : (
          <div className="warn" style={{ marginBottom: 12 }}>
            No QR yet — tenants have no way to pay you by Whish.
          </div>
        )}
        <label style={{ marginTop: 16 }}>{building.whishQrData ? 'Replace QR image' : 'Upload QR image'}</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onQrFile(e.target.files?.[0])} />

        <label style={{ marginTop: 16 }}>Account name or number shown under the QR</label>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Cedar Residence · 71 123 456" />
        <div style={{ marginTop: 12 }}><button onClick={saveRecipient}>Save</button></div>
      </div>

      <h2>Meter rates</h2>
      <p className="sub">
        A meter with no rate is tracked but never billed. Generator rates change with fuel — add a new rate
        whenever it does, and it applies from today onward.
      </p>
      <table className="ledger">
        <thead><tr><th>Meter</th><th className="num">Rate per unit</th><th className="num">Fixed fee</th><th>In effect from</th></tr></thead>
        <tbody>
          {tariffs.length === 0 && <tr><td colSpan={4}><i style={{ color: 'var(--ink-soft)' }}>No rates set — every bill will total zero.</i></td></tr>}
          {tariffs.map((t) => (
            <tr key={t.id}>
              <td><b>{t.meterType}</b></td>
              <td className="num money">{(t.ratePerUnitMinor / 100).toFixed(2)}</td>
              <td className="num">{(t.fixedFeeMinor / 100).toFixed(2)}</td>
              <td>{new Date(t.effectiveFrom).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="panel" style={{ marginTop: 18, maxWidth: 560 }}>
        <label>Meter type</label>
        <select value={form.meterType} onChange={(e) => setForm({ ...form, meterType: e.target.value })}>
          {METER_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label style={{ marginTop: 12 }}>Rate per unit ({building.currency})</label>
        <input value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="0.42" inputMode="decimal" />
        <label style={{ marginTop: 12 }}>Fixed fee per bill ({building.currency})</label>
        <input value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} placeholder="8.00" inputMode="decimal" />
        <div style={{ marginTop: 14 }}><button onClick={saveTariff}>Save rate</button></div>
      </div>
    </Shell>
  );
}
