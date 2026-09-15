'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  ['/tenant', 'Home', 'M12 3 3 10v10h6v-6h6v6h6V10z'],
  ['/tenant/readings', 'Meters', 'M12 3a9 9 0 0 0-9 9h4a5 5 0 1 1 10 0h4a9 9 0 0 0-9-9zm0 11 4-5-6 3z'],
  ['/tenant/community', 'Building', 'M4 21V5l8-3 8 3v16h-5v-5h-6v5zM9 8h2v2H9zm4 0h2v2h-2zM9 12h2v2H9zm4 0h2v2h-2z'],
  ['/tenant/card', 'Card', 'M2 5h20v4H2zm0 6h20v8H2zm3 4h6v2H5z'],
] as const;

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  if (path === '/tenant/join') return <>{children}</>;
  return (
    <div className="t-app">
      <header className="t-top">
        <span className="t-brand">Baytos</span>
        <button
          className="t-signout"
          onClick={() => { localStorage.removeItem('baytos_token'); router.push('/'); }}
        >
          Sign out
        </button>
      </header>
      <main className="t-main">{children}</main>
      <nav className="t-nav">
        {TABS.map(([href, label, d]) => (
          <Link key={href} href={href} className={`t-tab ${path === href || (href !== '/tenant' && path.startsWith(href)) ? 'on' : ''}`}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d={d} fill="currentColor" /></svg>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
