'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface GroomerBooking {
  id: string;
  status: string;
  scheduledStart: string;
  notes: string | null;
  customer: { fullName: string; tags: string[] };
  pet: { name: string; breed: string | null; weightKg: number | null; tags: string[]; medicalNotes: string | null; groomNotes: string | null; photoUrl: string | null } | null;
  lineItems: { description: string }[];
  workflow: { stage: string; occurredAt: string }[];
}

const STAGES = ['CHECK_IN','BEFORE_PHOTOS','BATH','DRYING','STYLING','NAILS','QUALITY_CHECK','AFTER_PHOTOS','READY'];

function StageButton({ stage, done, next, onAdvance }: { stage: string; done: boolean; next: boolean; onAdvance: (s: string) => void }) {
  return (
    <button
      onClick={() => next && onAdvance(stage)}
      disabled={done || !next}
      className={`flex-1 rounded-lg py-3 px-2 text-xs font-semibold transition
        ${done ? 'bg-green-500 text-white' : next ? 'bg-brand text-white animate-pulse' : 'bg-neutral-100 text-neutral-400'}`}
    >
      {stage.replace(/_/g,' ')}
    </button>
  );
}

export default function GroomerPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<GroomerBooking[]>([]);
  const [active, setActive] = useState<GroomerBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<{ storeId: string | null }>('/auth/me')
      .then(me => {
        if (!me.storeId) { setLoading(false); return; }
        setStoreId(me.storeId);
        const today = new Date().toISOString().slice(0,10);
        return apiFetch<GroomerBooking[]>(`/bookings?storeId=${me.storeId}&date=${today}`);
      })
      .then(data => {
        if (data) setBookings(data.filter(b => ['CONFIRMED','CHECKED_IN','IN_PROGRESS','READY'].includes(b.status)));
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function advanceStage(stage: string) {
    if (!active) return;
    await apiFetch(`/bookings/${active.id}/workflow`, { method: 'POST', body: JSON.stringify({ stage }) });
    const updated = await apiFetch<GroomerBooking>(`/bookings/${active.id}`);
    setActive(updated);
    setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">Loading…</div>;

  if (!active) {
    return (
      <div className="min-h-screen bg-neutral-50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">My jobs today</h1>
          <button onClick={() => router.push('/dashboard')} className="text-xs text-brand">← Admin</button>
        </div>
        {bookings.length === 0
          ? <p className="text-center text-sm text-neutral-400 mt-16">No active jobs assigned to you today.</p>
          : (
            <div className="space-y-3">
              {bookings.map(b => (
                <button key={b.id} onClick={() => setActive(b)}
                  className="w-full rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{b.pet?.name ?? 'No pet'}</p>
                      <p className="text-sm text-neutral-500">{b.pet?.breed ?? 'Mixed'} · {b.pet?.weightKg ?? '?'} kg</p>
                      <p className="text-xs text-neutral-400 mt-1">{b.customer.fullName}</p>
                      {b.pet?.medicalNotes && <p className="mt-1 text-xs text-red-600">⚠ {b.pet.medicalNotes}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-400">
                        {new Date(b.scheduledStart).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                      }`}>{b.status.replace(/_/g,' ')}</span>
                    </div>
                  </div>
                  {b.workflow.length > 0 && (
                    <div className="mt-2 text-xs text-neutral-500">
                      Last: {b.workflow[b.workflow.length-1].stage.replace(/_/g,' ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
      </div>
    );
  }

  const completedStages = new Set(active.workflow.map(w => w.stage));
  const nextIdx = STAGES.findIndex(s => !completedStages.has(s));

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setActive(null)} className="text-sm text-neutral-400">← Jobs</button>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          active.status === 'READY' ? 'bg-green-500' : 'bg-purple-500'
        }`}>{active.status.replace(/_/g,' ')}</span>
      </div>

      {/* Job card header */}
      <div className="rounded-xl bg-neutral-800 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-full bg-neutral-700 flex items-center justify-center text-2xl">
            🐾
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold">{active.pet?.name ?? 'No pet'}</p>
            <p className="text-sm text-neutral-400">{active.pet?.breed ?? 'Mixed'} · {active.pet?.weightKg ?? '?'} kg</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(active.pet?.tags ?? []).map(t => (
                <span key={t} className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">{t}</span>
              ))}
            </div>
          </div>
        </div>
        {active.pet?.medicalNotes && (
          <div className="mt-3 rounded-lg bg-red-900/30 border border-red-500/30 px-3 py-2 text-sm text-red-300">
            ⚠ {active.pet.medicalNotes}
          </div>
        )}
        {active.pet?.groomNotes && (
          <div className="mt-2 rounded-lg bg-blue-900/20 border border-blue-500/20 px-3 py-2 text-sm text-blue-300">
            📋 {active.pet.groomNotes}
          </div>
        )}
      </div>

      {/* Services */}
      {active.lineItems.length > 0 && (
        <div className="rounded-xl bg-neutral-800 p-4 mb-4">
          <p className="text-xs font-semibold text-neutral-400 uppercase mb-2">Services</p>
          {active.lineItems.map((l, i) => <p key={i} className="text-sm">{l.description}</p>)}
        </div>
      )}

      {/* Workflow stages */}
      <div className="rounded-xl bg-neutral-800 p-4 mb-4">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-3">Workflow</p>
        <div className="grid grid-cols-3 gap-2">
          {STAGES.map((s, i) => (
            <StageButton
              key={s}
              stage={s}
              done={completedStages.has(s)}
              next={i === nextIdx}
              onAdvance={advanceStage}
            />
          ))}
        </div>
        {nextIdx >= 0 && (
          <p className="mt-3 text-xs text-center text-neutral-500">
            Tap the pulsing button to advance the workflow
          </p>
        )}
        {nextIdx < 0 && (
          <p className="mt-3 text-sm text-center text-green-400 font-semibold">✓ All stages complete — Ready for pickup</p>
        )}
      </div>

      {/* Timeline */}
      {active.workflow.length > 0 && (
        <div className="rounded-xl bg-neutral-800 p-4">
          <p className="text-xs font-semibold text-neutral-400 uppercase mb-3">Timeline</p>
          <div className="space-y-2">
            {active.workflow.map(e => (
              <div key={e.stage} className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">{e.stage.replace(/_/g,' ')}</span>
                <span className="text-neutral-500 text-xs">
                  {new Date(e.occurredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
