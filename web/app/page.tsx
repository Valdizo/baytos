'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function Page() { return <Suspense fallback={null}><Login /></Suspense>; }

function Login() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [mode, setMode] = useState<'login' | 'register' | 'create'>('login');
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setError('');
    try {
      if (mode === 'register') {
        const { accessToken } = await api('/v1/auth/register', { method: 'POST', body: JSON.stringify(form) });
        localStorage.setItem('baytos_token', accessToken);
        if (next) return router.push(next);
        setMode('create');
        return;
      }
      if (mode === 'create') {
        const b = await api('/v1/buildings', { method: 'POST', body: JSON.stringify(form) });
        router.push(next || `/building/dashboard?id=${b.id}`);
        return;
      }
      const { accessToken } = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('baytos_token', accessToken);
      if (next) return router.push(next);
      const me = await api('/v1/auth/me');
      const managed = me.memberships.find((m: any) => ['PRESIDENT', 'MANAGER'].includes(m.role));
      if (managed) router.push(`/building/dashboard?id=${managed.building.id}`);
      else if (me.memberships.some((m: any) => m.unitId)) router.push('/tenant');
      else setMode('create');
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="auth">
      <div className="panel">
        <h1>Baytos</h1>
        <p className="sub">Bills, meters and collections for your building</p>
        {error && <div className="error">{error}</div>}
        {mode !== 'create' ? (
          <>
            {mode === 'register' && (
              <>
                <label>Full name</label>
                <input onChange={set('name')} placeholder="Joseph Khoury" />
              </>
            )}
            <label>Email</label>
            <input onChange={set('email')} placeholder="president@demo.lb" />
            <label>Password</label>
            <input type="password" onChange={set('password')} placeholder="••••••••" />
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button onClick={submit}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
              <button className="quiet" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'New here? Register' : 'Have an account? Sign in'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Create your building</h2>
            <p className="sub">
              Managing a building? Set it up below. Joining as a tenant?{' '}
              <a href="/tenant/join" style={{ color: 'var(--cedar)', fontWeight: 600 }}>Enter your invite code instead</a>.
            </p>
            <label>Building name (English)</label>
            <input onChange={set('nameEn')} placeholder="Cedar Residence" />
            <label>Building name (Arabic, optional)</label>
            <input dir="rtl" onChange={set('nameAr')} placeholder="سكن الأرز" />
            <label>Address</label>
            <input onChange={set('address')} placeholder="Mina Street, Tripoli" />
            <div style={{ marginTop: 18 }}>
              <button onClick={submit}>Create building</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
