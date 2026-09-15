'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, money } from '@/lib/api';

export default function TenantHome() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const m = await api('/v1/auth/me');
        if (!m.memberships.some((x: any) => x.unitId)) return router.push('/tenant/join');
        setMe(m);
        setBills(await api('/v1/bills/mine'));
      } catch {
        router.push('/');
      }
    })();
  }, []);

  const membership = me?.memberships?.find((m: any) => m.unitId);
  const due = bills.filter((b) => ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(b.status));
  const dueTotal = due.reduce((s, b) => s + b.totalMinor, 0);

  return (
    <>
      {membership && (
        <p style={{ color: 'var(--soft)', fontWeight: 600, marginBottom: 12 }}>
          {membership.building.nameEn} · Unit {membership.unit?.unitNumber}
        </p>
      )}
      <div className="t-due">
        <div className="label">Amount due</div>
        <div className="amount">{money(dueTotal)}</div>
        {due[0] && <div className="sub">Due {new Date(due[0].dueAt).toLocaleDateString()}</div>}
        {due[0] && <button onClick={() => router.push(`/tenant/bill?id=${due[0].id}`)}>View statement &amp; pay</button>}
        {!due[0] && <div className="sub">Nothing due — you're all settled.</div>}
      </div>

      <div className="t-quick">
        <Link href="/tenant/readings">Submit reading</Link>
        <Link href="/tenant/community">Maintenance</Link>
        <Link href="/tenant/community?tab=votes">Votes</Link>
        <Link href="/tenant/card">Card &amp; autopay</Link>
      </div>

      <h2 className="t-h">Statements</h2>
      {bills.map((b) => (
        <Link key={b.id} href={`/tenant/bill?id=${b.id}`} className="t-row">
          <div className="grow">
            <div className="title">{b.period.label}</div>
            <div className="sub">{b.period.building.nameEn}</div>
          </div>
          <span className="amt">{money(b.totalMinor, b.currency)}</span>
          <span className={`t-pill ${b.status === 'PAID' ? 'paid' : b.status === 'VOID' ? 'void' : 'due'}`}>
            {b.status === 'VOID' ? 'rolled over' : b.status.toLowerCase().replace('_', ' ')}
          </span>
        </Link>
      ))}
      {bills.length === 0 && (
        <p className="t-note">No statements yet — your first one appears when the building closes a billing period.</p>
      )}
    </>
  );
}
