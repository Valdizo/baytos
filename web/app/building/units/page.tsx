'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Units /></Suspense>; }

function Units() {
  const id = useSearchParams().get('id') || '';
  const [units, setUnits] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});
  const [invite, setInvite] = useState<any>(null);
  const [meterForm, setMeterForm] = useState<any>({ type: 'GENERATOR' });
  const [msg, setMsg] = useState('');

  const load = () => api(`/v1/buildings/${id}/units`).then(setUnits).catch((e) => setMsg(e.message));
  useEffect(() => { if (id) load(); }, [id]);

  async function addUnit() {
    await api(`/v1/buildings/${id}/units`, { method: 'POST', body: JSON.stringify({ units: [form] }) });
    setForm({});
    load();
  }
  async function inviteTenant(unitId: string) {
    const inv = await api(`/v1/units/${unitId}/invitations`, { method: 'POST', body: JSON.stringify({ role: 'TENANT' }) });
    setInvite(inv);
  }
  async function addMeter(unitId: string) {
    await api(`/v1/buildings/${id}/meters`, { method: 'POST', body: JSON.stringify({ ...meterForm, unitId }) });
    load();
  }

  return (
    <Shell buildingId={id}>
      <h1>Apartments</h1>
      <p className="sub">Each apartment keeps its meters, bills and history even when tenants change.</p>
      {msg && <div className="error">{msg}</div>}
      {invite && (
        <div className="ok">
          Invitation code for the tenant: <b>{invite.code}</b> — they enter it in the mobile app under "Join apartment". Valid 14 days.
        </div>
      )}

      <table className="ledger">
        <thead><tr><th>Unit</th><th>Floor</th><th>Residents</th><th>Meters</th><th>Autopay</th><th></th></tr></thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td><b>{u.unitNumber}</b></td>
              <td>{u.floor ?? '—'}</td>
              <td>{u.memberships.map((m: any) => `${m.user.name} (${m.role.toLowerCase()})`).join(', ') || <i style={{color:'var(--ink-soft)'}}>empty</i>}</td>
              <td>{u.meters.map((m: any) => m.type).join(', ') || '—'}</td>
              <td>{u.mandate?.enabled ? <span className="pill paid">on</span> : <span className="pill open">off</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="quiet" onClick={() => inviteTenant(u.id)}>Invite tenant</button>{' '}
                <button className="quiet" onClick={() => addMeter(u.id)}>Add {meterForm.type} meter</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add apartment</h2>
      <div className="panel">
        <div className="formrow">
          <div><label>Unit number</label><input value={form.unitNumber || ''} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="4B" /></div>
          <div><label>Floor</label><input type="number" value={form.floor || ''} onChange={(e) => setForm({ ...form, floor: +e.target.value })} /></div>
          <div><label>Area m²</label><input type="number" value={form.areaM2 || ''} onChange={(e) => setForm({ ...form, areaM2: +e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 14 }}><button onClick={addUnit}>Add apartment</button></div>
        <label style={{ marginTop: 20 }}>Meter type for "Add meter" button</label>
        <select value={meterForm.type} onChange={(e) => setMeterForm({ type: e.target.value })}>
          <option>GENERATOR</option><option>EDL</option><option>COLD_WATER</option><option>HOT_WATER</option>
        </select>
      </div>
    </Shell>
  );
}
