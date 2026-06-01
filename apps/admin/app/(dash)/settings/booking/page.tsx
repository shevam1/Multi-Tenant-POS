'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Settings {
  allowDoubleBooking: boolean; largeDogWeightKg: number; scheduleIntervalMin: number; weightUnit: string;
}
interface AuthMe { permissions: string[] }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-teal-500' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function BookingControlsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(u => {
      if (!u.permissions.includes('settings.manage')) { router.push('/dashboard'); return; }
      apiFetch<Settings>('/settings').then(setS);
    }).catch(() => router.push('/login'));
  }, [router]);

  async function save() {
    if (!s) return;
    setSaving(true);
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({
      allowDoubleBooking: s.allowDoubleBooking, largeDogWeightKg: s.largeDogWeightKg, scheduleIntervalMin: s.scheduleIntervalMin,
    })});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;
  const unit = s.weightUnit === 'LB' ? 'lb' : 'kg';

  return (
    <div>
      <main className="mx-auto max-w-xl px-8 py-8">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Appointment &amp; Booking Controls</h1>
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-6">
          {/* Double booking */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Allow double booking</p>
              <p className="text-xs text-neutral-500">When off, the calendar blocks overlapping appointments for the same groomer.</p>
            </div>
            <Toggle on={s.allowDoubleBooking} onChange={v => setS({ ...s, allowDoubleBooking: v })} />
          </div>

          {/* Schedule interval */}
          <div className="flex items-center justify-between border-t pt-5">
            <div>
              <p className="font-medium text-sm">Schedule by (slot interval)</p>
              <p className="text-xs text-neutral-500">Time-slice granularity for online booking slots.</p>
            </div>
            <select className="rounded-lg border px-3 py-2 text-sm bg-white" value={s.scheduleIntervalMin} onChange={e => setS({ ...s, scheduleIntervalMin: Number(e.target.value) })}>
              {[15, 30, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>

          {/* Large dog weight */}
          <div className="flex items-center justify-between border-t pt-5">
            <div>
              <p className="font-medium text-sm">Large dog weight threshold</p>
              <p className="text-xs text-neutral-500">Pets over this weight are flagged as Large. Set 0 to disable.</p>
            </div>
            <div className="flex items-center gap-1">
              <input type="number" min="0" step="0.5" className="w-20 rounded-lg border px-3 py-2 text-sm" value={s.largeDogWeightKg} onChange={e => setS({ ...s, largeDogWeightKg: Number(e.target.value) })} />
              <span className="text-sm text-neutral-400">{unit}</span>
            </div>
          </div>

          <div className="border-t pt-5 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save controls'}</button>
            {saved && <span className="text-sm text-green-600">✓ Saved</span>}
          </div>
        </div>
      </main>
    </div>
  );
}
