'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, money } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Expenses /></Suspense>; }

function Expenses() {
  const id = useSearchParams().get('id') || '';
  const [expenses, setExpenses] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ allocation: 'EQUAL', category: 'MAINTENANCE' });
  const [err, setErr] = useState('');

  const load = () => api(`/v1/buildings/${id}/expenses`).then(setExpenses).catch((e) => setErr(e.message));
  useEffect(() => { if (id) load(); }, [id]);

  async function add() {
    setErr('');
    try {
      await api(`/v1/buildings/${id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ ...form, amountMinor: Math.round(parseFloat(form.amount) * 100) }),
      });
      setForm({ allocation: 'EQUAL', category: 'MAINTENANCE' });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell buildingId={id}>
      <h1>Shared expenses</h1>
      <p className="sub">Pending expenses are split across apartments when you close the billing period.</p>
      {err && <div className="error">{err}</div>}
      <table className="ledger">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Split</th><th className="num">Amount</th><th>Status</th></tr></thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.incurredAt).toLocaleDateString()}</td>
              <td>{e.category}</td>
              <td>{e.description}</td>
              <td>{e.allocation.toLowerCase()}</td>
              <td className="num money">{money(e.amountMinor)}</td>
              <td><span className={`pill ${e.status === 'PENDING' ? 'issued' : 'paid'}`}>{e.status.toLowerCase()}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Record an expense</h2>
      <div className="panel">
        <div className="formrow">
          <div>
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>MAINTENANCE</option><option>ELEVATOR</option><option>CLEANING</option>
              <option>GENERATOR_FUEL</option><option>WATER_TRUCK</option><option>CONCIERGE</option><option>OTHER</option>
            </select>
          </div>
          <div>
            <label>Split method</label>
            <select value={form.allocation} onChange={(e) => setForm({ ...form, allocation: e.target.value })}>
              <option value="EQUAL">Equal per apartment</option>
              <option value="AREA">By apartment area</option>
              <option value="OWNERSHIP">By ownership share</option>
            </select>
          </div>
          <div>
            <label>Amount ($)</label>
            <input type="number" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="80.00" />
          </div>
        </div>
        <label>Description</label>
        <input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Elevator monthly maintenance" />
        <div style={{ marginTop: 14 }}><button onClick={add}>Add expense</button></div>
      </div>
    </Shell>
  );
}
