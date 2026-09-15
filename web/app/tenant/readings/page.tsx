'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Readings() {
  const [meters, setMeters] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, any[]>>({});

  useEffect(() => {
    (async () => {
      const me = await api('/v1/auth/me');
      const m = me.memberships.find((x: any) => x.unitId);
      if (!m) return;
      const units = await api(`/v1/buildings/${m.building.id}/units`);
      const mine = units.find((u: any) => u.id === m.unitId);
      setMeters(mine?.meters || []);
    })().catch(() => {});
  }, []);

  async function submit(meterId: string) {
    try {
      const r = await api(`/v1/meters/${meterId}/readings`, { method: 'POST', body: JSON.stringify({ value: values[meterId] }) });
      setMsgs({ ...msgs, [meterId]: r.delta != null
        ? `Submitted. Consumption since last reading: ${Number(r.delta).toFixed(1)}. Your manager verifies it before billing.`
        : 'Submitted. Your manager verifies it before billing.' });
    } catch (e: any) {
      setMsgs({ ...msgs, [meterId]: `Not accepted: ${e.message}` });
    }
  }

  async function toggleHistory(meterId: string) {
    if (history[meterId]) return setHistory(({ [meterId]: _, ...rest }) => rest as any);
    const h = await api(`/v1/meters/${meterId}/consumption`);
    setHistory({ ...history, [meterId]: h });
  }

  return (
    <>
      <p className="t-note" style={{ marginTop: 0, marginBottom: 14 }}>
        Enter the number shown on each of your meters. Readings below the previous verified value are rejected automatically.
      </p>
      {meters.map((m) => (
        <div key={m.id} className="t-card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {m.type.replace('_', ' ')} <span style={{ color: 'var(--soft)', fontWeight: 400 }}>({m.unitLabel})</span>
          </div>
          <input
            className="t-input"
            style={{ textAlign: 'right', fontSize: 17 }}
            inputMode="decimal"
            placeholder="e.g. 4390.0"
            value={values[m.id] || ''}
            onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
          />
          <button className="t-btn" onClick={() => submit(m.id)}>Submit reading</button>
          {msgs[m.id] && <p className="t-note">{msgs[m.id]}</p>}
          <button className="t-chip" style={{ marginTop: 10 }} onClick={() => toggleHistory(m.id)}>
            {history[m.id] ? 'Hide history' : 'Consumption history'}
          </button>
          {history[m.id] && (
            <div style={{ marginTop: 8 }}>
              {history[m.id].map((h: any) => (
                <p key={h.id} className="t-note" style={{ marginTop: 2 }}>
                  {new Date(h.takenAt).toLocaleDateString()} — {Number(h.value).toFixed(1)}
                  {h.delta != null && <b> (+{Number(h.delta).toFixed(1)})</b>} · {h.status.toLowerCase().replace('_', ' ')}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
      {meters.length === 0 && <p className="t-note">No meters are registered for your apartment yet — ask your building manager.</p>}
    </>
  );
}
