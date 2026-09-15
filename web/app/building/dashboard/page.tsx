'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, money } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Dashboard /></Suspense>; }

function Dashboard() {
  const id = useSearchParams().get('id') || '';
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api(`/v1/buildings/${id}/dashboard`).then(setD).catch((e) => setError(e.message));
  }, [id]);

  return (
    <Shell buildingId={id}>
      {error && <div className="error">{error}</div>}
      {d && (
        <>
          <h1>{d.building.nameEn}</h1>
          <p className="sub">{d.building.address} · {d.unitCount} apartments · billed in {d.building.currency}</p>

          <div className="statgrid">
            <div className="stat">
              <div className="v money">{money(d.unpaidTotalMinor, d.building.currency)}</div>
              <div className="l">outstanding across {d.unpaidBillCount} bills</div>
            </div>
            <div className="stat">
              <div className="v">{d.openPeriod ? d.openPeriod.label : '—'}</div>
              <div className="l">{d.openPeriod ? 'billing period open' : 'no open period'}</div>
            </div>
            <div className="stat">
              <div className="v">{d.openMaintenance}</div>
              <div className="l">maintenance requests in progress</div>
            </div>
            <div className="stat">
              <div className="v">{d.openProposals}</div>
              <div className="l">proposals open for voting</div>
            </div>
          </div>

          {d.projects.length > 0 && (
            <>
              <h2>Project funds</h2>
              <table className="ledger">
                <thead><tr><th>Project</th><th className="num">Collected</th><th className="num">Target</th><th style={{width: 220}}>Progress</th></tr></thead>
                <tbody>
                  {d.projects.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td className="num money">{money(p.collectedMinor)}</td>
                      <td className="num">{money(p.targetMinor)}</td>
                      <td>
                        <div className="progress"><div style={{ width: `${Math.min(100, (p.collectedMinor / p.targetMinor) * 100)}%` }} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
