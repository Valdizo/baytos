'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, money } from '@/lib/api';

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'ELEVATOR', 'GENERATOR', 'CLEANING', 'OTHER'];

function Community() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'votes' ? 'votes' : 'maintenance');
  const [buildingId, setBuildingId] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ category: 'PLUMBING', scope: 'COMMON_AREA' });
  const [claimForm, setClaimForm] = useState<any>({});
  const [msg, setMsg] = useState('');

  async function load(bid?: string) {
    const b = bid || buildingId;
    if (!b) return;
    setRequests(await api(`/v1/buildings/${b}/maintenance`));
    setClaims(await api(`/v1/buildings/${b}/reimbursements`));
    setProposals(await api(`/v1/buildings/${b}/proposals`));
    setProjects(await api(`/v1/buildings/${b}/projects`));
  }
  useEffect(() => {
    (async () => {
      const me = await api('/v1/auth/me');
      const m = me.memberships.find((x: any) => x.unitId) || me.memberships[0];
      if (!m) return;
      setBuildingId(m.building.id);
      await load(m.building.id);
    })().catch(() => {});
  }, []);

  async function submitRequest() {
    setMsg('');
    try {
      await api(`/v1/buildings/${buildingId}/maintenance`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ category: 'PLUMBING', scope: 'COMMON_AREA' });
      setMsg('Submitted — your building manager has been notified.');
      load();
    } catch (e: any) { setMsg(e.message); }
  }

  async function submitClaim() {
    setMsg('');
    try {
      await api(`/v1/buildings/${buildingId}/reimbursements`, {
        method: 'POST',
        body: JSON.stringify({ description: claimForm.description, amountMinor: Math.round(parseFloat(claimForm.amount) * 100) }),
      });
      setClaimForm({});
      setMsg('Claim submitted — if approved, it is credited on your next statement.');
      load();
    } catch (e: any) { setMsg(e.message); }
  }

  async function vote(pid: string, choice: string) {
    try {
      await api(`/v1/proposals/${pid}/votes`, { method: 'POST', body: JSON.stringify({ choice }) });
      load();
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <div className="t-seg">
        <button className={tab === 'maintenance' ? 'on' : ''} onClick={() => setTab('maintenance')}>Maintenance</button>
        <button className={tab === 'votes' ? 'on' : ''} onClick={() => setTab('votes')}>Votes &amp; projects</button>
      </div>
      {msg && <p className="t-note" style={{ marginBottom: 10 }}>{msg}</p>}

      {tab === 'maintenance' ? (
        <>
          <div className="t-card">
            <div className="t-chiprow">
              {CATEGORIES.map((c) => (
                <button key={c} className={`t-chip ${form.category === c ? 'on' : ''}`} onClick={() => setForm({ ...form, category: c })}>
                  {c.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="t-chiprow">
              {[['COMMON_AREA', 'Common area'], ['PRIVATE_UNIT', 'My apartment']].map(([v, l]) => (
                <button key={v} className={`t-chip ${form.scope === v ? 'on' : ''}`} onClick={() => setForm({ ...form, scope: v })}>{l}</button>
              ))}
            </div>
            <input className="t-input" placeholder="Title — e.g. Water leaking beside main pump" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="t-input" rows={3} placeholder="Describe the problem" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button className="t-btn" onClick={submitRequest}>Submit request</button>
          </div>
          {requests.map((r) => (
            <div key={r.id} className="t-row">
              <div className="grow">
                <div className="title">{r.title}</div>
                <div className="sub">{r.category.toLowerCase()} · {r.scope === 'COMMON_AREA' ? 'common area' : 'apartment'}</div>
              </div>
              <span className="t-pill void">{r.status.toLowerCase().replace('_', ' ')}</span>
            </div>
          ))}

          <h2 className="t-h">Paid for the building? Claim it back</h2>
          <div className="t-card">
            <input className="t-input" placeholder="What did you pay for?" value={claimForm.description || ''} onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })} />
            <input className="t-input" inputMode="decimal" placeholder="Amount ($)" value={claimForm.amount || ''} onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })} />
            <button className="t-btn" onClick={submitClaim}>Request reimbursement</button>
          </div>
          {claims.map((c) => (
            <div key={c.id} className="t-row">
              <div className="grow"><div className="title">{c.description}</div><div className="sub">{money(c.amountMinor)}</div></div>
              <span className="t-pill void">{c.status.toLowerCase()}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          {proposals.map((p) => (
            <div key={p.id} className="t-card">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.titleEn}</div>
              {p.titleAr && <div dir="rtl" style={{ color: 'var(--soft)' }}>{p.titleAr}</div>}
              <p style={{ color: 'var(--soft)', marginTop: 4, lineHeight: 1.5 }}>{p.description}</p>
              {p.estimatedCostMinor && <p style={{ color: 'var(--brass)', fontWeight: 700, marginTop: 6 }}>Estimated cost: {money(p.estimatedCostMinor)}</p>}
              <p className="t-note">
                {p.tally.approve} approve · {p.tally.reject} reject · closes {new Date(p.closesAt).toLocaleDateString()} · one vote per apartment
              </p>
              {p.status === 'OPEN' ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="t-btn" style={{ flex: 1 }} onClick={() => vote(p.id, 'APPROVE')}>Approve</button>
                  <button className="t-btn" style={{ flex: 1, background: 'var(--clay)' }} onClick={() => vote(p.id, 'REJECT')}>Reject</button>
                  <button className="t-btn" style={{ flex: 1, background: '#e3e9e5', color: 'var(--soft)' }} onClick={() => vote(p.id, 'ABSTAIN')}>Abstain</button>
                </div>
              ) : (
                <p style={{ fontWeight: 800, marginTop: 8, color: p.status === 'APPROVED' ? 'var(--cedar)' : 'var(--clay)' }}>{p.status}</p>
              )}
            </div>
          ))}

          <h2 className="t-h">Project funds</h2>
          {projects.map((p) => (
            <div key={p.id} className="t-card">
              <div style={{ fontWeight: 700 }}>{p.title}</div>
              {p.description && <p style={{ color: 'var(--soft)', marginTop: 3 }}>{p.description}</p>}
              <div className="t-progress"><i style={{ width: `${p.progressPercent}%` }} /></div>
              <p className="t-note">
                {money(p.collectedMinor)} of {money(p.targetMinor)} ({p.progressPercent}%) · {money(p.monthlyPerUnitMinor)}/apartment/month
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense><Community /></Suspense>;
}
