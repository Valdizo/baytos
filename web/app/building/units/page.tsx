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
  const [err, setErr] = useState('');

  async function removeMeter(meterId: string, type: string) {
    if (!confirm(`Remove the ${type} meter? If it already has readings it is deactivated, not deleted, so past bills stay intact.`)) return;
    try { await api(`/v1/meters/${meterId}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function endTenancy(membershipId: string, name: string) {
    if (!confirm(`End ${name}'s tenancy? Their past bills and readings stay with the apartment.`)) return;
    try { await api(`/v1/memberships/${membershipId}/end`, { method: 'PATCH' }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  const [msg, setMsg] = useState('');

  const load = () => api(`/v1/buildings/${id}/units`).then(setUnits).catch((e) => setMsg(e.message));
  useEffect(() => { if (id) load(); }, [id]);

  async function addUnit() {
    await api(`/v1/buildings/${id}/units`, { method: 'POST', body: JSON.stringify({ units: [form] }) });
    setForm({});
    load();
  }
  async function inviteTenant(unitId: string, role: 'TENANT' | 'MANAGER' = 'TENANT') {
    setErr('');
    try {
      const inv = await api(`/v1/units/${unitId}/invitations`, { method: 'POST', body: JSON.stringify({ role }) });
      setInvite(inv);
    } catch (e: any) { setErr(e.message); }
  }
  async function addMeter(unitId: string) {
    setErr('');
    try {
      await api(`/v1/buildings/${id}/meters`, { method: 'POST', body: JSON.stringify({ ...meterForm, unitId }) });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell buildingId={id}>
      <h1>Apartments</h1>
      {err && <div className="error">{err}</div>}
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
              <td>
                {u.memberships.length === 0 && <i style={{ color: 'var(--ink-soft)' }}>empty</i>}
                {u.memberships.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span>{m.user.name} ({m.role.toLowerCase()})</span>
                    {m.role === 'TENANT' && (
                      <button className="quiet" style={{ padding: '2px 8px', fontSize: 12 }}
                              onClick={() => endTenancy(m.id, m.user.name)}>moved out</button>
                    )}
                  </div>
                ))}
              </td>
              <td>
                {u.meters.length === 0 && '—'}
                {u.meters.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span>{m.type}</span>
                    <button className="quiet" style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={() => removeMeter(m.id, m.type)}>remove</button>
                  </div>
                ))}
              </td>
              <td>{u.mandate?.enabled ? <span className="pill paid">on</span> : <span className="pill open">off</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="quiet" onClick={() => inviteTenant(u.id)}>Invite tenant</button>{' '}
                <button className="quiet" onClick={() => inviteTenant(u.id, 'MANAGER')}>Invite manager</button>{' '}
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
          <option>GENERATOR</option><option>EDL</option><option>COLD_WATER</option><option>HOT_WATER</option><option>OTHER</option>
        </select>
      </div>
    </Shell>
  );
}
