'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function Join() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function join() {
    setError('');
    try {
      if (!localStorage.getItem('baytos_token')) return router.push('/?next=/tenant/join');
      await api('/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ code: code.trim().toUpperCase() }) });
      router.push('/tenant');
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="auth">
      <div className="panel">
        <h1>Join your apartment</h1>
        <p className="sub">
          Your building president or manager creates an invitation for your apartment and gives you an 8-character code.
          When you join, record your meters' current readings with the manager — you'll never pay for consumption from
          before your move-in.
        </p>
        {error && <div className="error">{error}</div>}
        <label>Invitation code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="4F2A9C1B"
          style={{ letterSpacing: 4, textAlign: 'center', textTransform: 'uppercase', fontSize: 18 }}
        />
        <div style={{ marginTop: 18 }}>
          <button onClick={join}>Join apartment</button>
        </div>
      </div>
    </div>
  );
}
