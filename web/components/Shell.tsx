'use client';
import Link from 'next/link';
import { useEffect } from 'react';
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

  // Copy each ledger table's column headers onto its cells as data-label, so the
  // stacked phone layout (globals.css, max-width 860px) can show "Unit: 1A" instead
  // of a bare value. Done here rather than by hand on 55 <td>s, and it picks up any
  // table added later. Observes childList only — setting an attribute can't re-trigger it.
  useEffect(() => {
    const label = () => {
      document.querySelectorAll('table.ledger').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((h) => h.textContent?.trim() || '');
        table.querySelectorAll('tbody tr').forEach((row) => {
          Array.from(row.children).forEach((cell, i) => {
            if (heads[i]) (cell as HTMLElement).dataset.label = heads[i];
          });
        });
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
