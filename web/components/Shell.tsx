'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  ['dashboard', 'Overview'],
  ['units', 'Apartments'],
  ['readings', 'Meter readings'],
  ['expenses', 'Expenses'],
  ['billing', 'Billing'],
  ['community', 'Maintenance & votes'],
];

export default function Shell({ buildingId, children }: { buildingId: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          Baytos
          <small>Building portal</small>
        </div>
        <nav>
          {nav.map(([slug, label]) => (
            <Link key={slug} href={`/building/${slug}?id=${buildingId}`} className={path?.includes(`/${slug}`) ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="foot">
          <a href="/" style={{ color: 'inherit' }} onClick={() => localStorage.removeItem('baytos_token')}>
            Sign out
          </a>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
