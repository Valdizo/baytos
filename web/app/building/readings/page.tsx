'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Readings /></Suspense>; }

function Readings() {
  const id = useSearchParams().get('id') || '';
  const [grid, setGrid] = useState<any[]>([]);
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => api(`/v1/buildings/${id}/reading-grid`).then(setGrid).catch((e) => setErr(e.message));
  useEffect(() => { if (id) load(); }, [id]);

  async function submit(meterId: string) {
    setErr(''); setMsg('');
    try {
      await api(`/v1/meters/${meterId}/readings`, { method: 'POST', body: JSON.stringify({ value: entry[meterId] }) });
      setMsg('Reading saved and verified.');
      load();
    } catch (e: any) { setErr(e.message); }
  }
  async function verify(readingId: string) {
    await api(`/v1/readings/${readingId}/verify`, { method: 'POST' });
    load();
  }

  return (
    <Shell buildingId={id}>
      <h1>Meter readings</h1>
      <p className="sub">Enter this month's reading for every meter. Tenant-submitted readings appear here for verification.</p>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="error">{err}</div>}
      <table className="ledger">
        <thead>
          <tr><th>Unit</th><th>Meter</th><th className="num">Previous</th><th className="num">Latest</th><th>Status</th><th className="num">New reading</th><th></th></tr>
        </thead>
        <tbody>
          {grid.map((g) => (
            <tr key={g.meterId}>
              <td><b>{g.unitNumber}</b></td>
              <td>{g.type} <span style={{ color: 'var(--ink-soft)' }}>({g.unitLabel})</span></td>
              <td className="num">{g.previous ? Number(g.previous.value).toFixed(1) : '—'}</td>
              <td className="num">{g.latest ? Number(g.latest.value).toFixed(1) : '—'}</td>
              <td>
                {g.latest?.status === 'SUBMITTED'
                  ? <button className="quiet" onClick={() => verify(g.latest.id)}>Verify tenant reading</button>
                  : g.latest ? <span className="pill paid">{g.latest.status.toLowerCase().replace(/_/g, ' ')}</span> : <span className="pill open">none</span>}
              </td>
              <td style={{ width: 130 }}>
                <input className="num" placeholder="4390.0" value={entry[g.meterId] || ''} onChange={(e) => setEntry({ ...entry, [g.meterId]: e.target.value })} />
              </td>
              <td><button className="quiet" onClick={() => submit(g.meterId)}>Save</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
