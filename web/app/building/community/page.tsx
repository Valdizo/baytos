'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, money } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Community /></Suspense>; }

function Community() {
  const id = useSearchParams().get('id') || '';
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [pForm, setPForm] = useState<any>({});
  const [prForm, setPrForm] = useState<any>({});
  const [err, setErr] = useState('');

  const load = async () => {
    setMaintenance(await api(`/v1/buildings/${id}/maintenance`));
    setProposals(await api(`/v1/buildings/${id}/proposals`));
    setProjects(await api(`/v1/buildings/${id}/projects`));
    setClaims(await api(`/v1/buildings/${id}/reimbursements`));
  };
  useEffect(() => { if (id) load().catch((e) => setErr(e.message)); }, [id]);

  const setStatus = (rid: string, status: string) =>
    api(`/v1/maintenance/${rid}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(load);
  const review = (cid: string, decision: string) =>
    api(`/v1/reimbursements/${cid}`, { method: 'PATCH', body: JSON.stringify({ decision }) }).then(load);

  async function closeVote(pid: string, title: string) {
    if (!confirm(`Close voting on "${title}"? The tally decides the outcome and no further votes are counted.`)) return;
    try { await api(`/v1/proposals/${pid}/close`, { method: 'POST' }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function setProjectStatus(pid: string, status: string) {
    try { await api(`/v1/projects/${pid}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function createProposal() {
    await api(`/v1/buildings/${id}/proposals`, {
      method: 'POST',
      body: JSON.stringify({
        titleEn: pForm.titleEn, description: pForm.description || '',
        estimatedCostMinor: pForm.cost ? Math.round(parseFloat(pForm.cost) * 100) : null,
        closesAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    setPForm({}); load();
  }

  async function createProject() {
    await api(`/v1/buildings/${id}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        title: prForm.title, description: prForm.description || '',
        targetMinor: Math.round(parseFloat(prForm.target) * 100),
        monthlyPerUnitMinor: Math.round(parseFloat(prForm.monthly) * 100),
      }),
    });
    setPrForm({}); load();
  }

  return (
    <Shell buildingId={id}>
      <h1>Maintenance, votes & projects</h1>
      <p className="sub">Requests from tenants, building proposals, project funds and reimbursement claims.</p>
      {err && <div className="error">{err}</div>}

      <h2>Maintenance requests</h2>
      <table className="ledger">
        <thead><tr><th>Title</th><th>Category</th><th>Reporter</th><th>Priority</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {maintenance.map((m) => (
            <tr key={m.id}>
              <td><b>{m.title}</b><div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{m.description}</div></td>
              <td>{m.category}</td>
              <td>{m.reporter.name}</td>
              <td>{m.priority.toLowerCase()}</td>
              <td><span className="pill open">{m.status.toLowerCase().replace('_', ' ')}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {m.status === 'NEW' && <button className="quiet" onClick={() => setStatus(m.id, 'APPROVED')}>Approve</button>}{' '}
                {['APPROVED', 'IN_PROGRESS'].includes(m.status) && <button className="quiet" onClick={() => setStatus(m.id, 'COMPLETED')}>Mark done</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Proposals & voting</h2>
      <table className="ledger">
        <thead><tr><th>Proposal</th><th className="num">Est. cost</th><th>Approve</th><th>Reject</th><th>Status</th></tr></thead>
        <tbody>
          {proposals.map((p) => (
            <tr key={p.id}>
              <td><b>{p.titleEn}</b>{p.titleAr && <span dir="rtl" style={{ marginRight: 8, color: 'var(--ink-soft)' }}> · {p.titleAr}</span>}</td>
              <td className="num">{p.estimatedCostMinor ? money(p.estimatedCostMinor) : '—'}</td>
              <td>{p.tally.approve}</td>
              <td>{p.tally.reject}</td>
              <td>
                <span className={`pill ${p.status === 'APPROVED' ? 'paid' : p.status === 'REJECTED' ? 'overdue' : 'issued'}`}>{p.status.toLowerCase()}</span>
                {p.status === 'OPEN' && (
                  <> <button className="quiet" style={{ padding: '2px 8px', fontSize: 12 }}
                             onClick={() => closeVote(p.id, p.titleEn)}>close vote</button></>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="panel" style={{ marginTop: 12 }}>
        <div className="formrow">
          <div><label>New proposal title</label><input value={pForm.titleEn || ''} onChange={(e) => setPForm({ ...pForm, titleEn: e.target.value })} placeholder="Install solar panels" /></div>
          <div><label>Estimated cost ($)</label><input type="number" value={pForm.cost || ''} onChange={(e) => setPForm({ ...pForm, cost: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12 }}><button onClick={createProposal}>Open 14-day vote</button></div>
      </div>

      <h2>Project funds</h2>
      <table className="ledger">
        <thead><tr><th>Project</th><th className="num">Monthly / unit</th><th className="num">Collected</th><th className="num">Target</th><th>Status</th></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td><b>{p.title}</b></td>
              <td className="num">{money(p.monthlyPerUnitMinor)}</td>
              <td className="num money">{money(p.collectedMinor)} ({p.progressPercent}%)</td>
              <td className="num">{money(p.targetMinor)}</td>
              <td>
                <span className="pill issued">{p.status.toLowerCase()}</span>
                {p.status !== 'COMPLETED' && (
                  <> <button className="quiet" style={{ padding: '2px 8px', fontSize: 12 }}
                             onClick={() => setProjectStatus(p.id, p.status === 'FUNDING' ? 'FUNDED' : 'COMPLETED')}>
                    mark {p.status === 'FUNDING' ? 'funded' : 'completed'}
                  </button></>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="panel" style={{ marginTop: 12 }}>
        <div className="formrow">
          <div><label>New project</label><input value={prForm.title || ''} onChange={(e) => setPrForm({ ...prForm, title: e.target.value })} placeholder="New elevator" /></div>
          <div><label>Target ($)</label><input type="number" value={prForm.target || ''} onChange={(e) => setPrForm({ ...prForm, target: e.target.value })} /></div>
          <div><label>Monthly per apartment ($)</label><input type="number" value={prForm.monthly || ''} onChange={(e) => setPrForm({ ...prForm, monthly: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12 }}><button onClick={createProject}>Start collecting</button></div>
      </div>

      <h2>Reimbursement claims</h2>
      <table className="ledger">
        <thead><tr><th>Claimant</th><th>Description</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td>{c.claimant.name}</td>
              <td>{c.description}</td>
              <td className="num money">{money(c.amountMinor)}</td>
              <td><span className={`pill ${c.status === 'APPROVED' || c.status === 'CREDITED' ? 'paid' : c.status === 'REJECTED' ? 'overdue' : 'issued'}`}>{c.status.toLowerCase()}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {c.status === 'SUBMITTED' && (
                  <>
                    <button className="quiet" onClick={() => review(c.id, 'APPROVED')}>Approve as credit</button>{' '}
                    <button className="danger" onClick={() => review(c.id, 'REJECTED')}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
