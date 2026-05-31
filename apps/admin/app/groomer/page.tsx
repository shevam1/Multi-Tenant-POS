'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface BookingPhoto { id: string; kind: string; url: string; createdAt: string }
interface GroomerPet {
  id: string; name: string; species: string; breed: string | null; weightKg: number | null;
  dateOfBirth: string | null; gender: string | null; hairLength: string | null; isFixed: boolean;
  tags: string[]; allergies: string | null; medicalNotes: string | null; groomNotes: string | null; photoUrl: string | null;
}
interface GroomerBooking {
  id: string;
  status: string;
  scheduledStart: string;
  notes: string | null;
  customer: { id: string; fullName: string; tags: string[] };
  pet: GroomerPet | null;
  lineItems: { id: string; description: string; unitPriceCents: number }[];
  workflow: { stage: string; occurredAt: string }[];
  photos?: BookingPhoto[];
}
interface AddOn { id: string; name: string; basePriceCents: number; kind: string }

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
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showPetInfo, setShowPetInfo] = useState(false);

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
    // Load add-on catalog for the "add on" picker
    apiFetch<AddOn[]>('/catalog').then(items => setAddOns(items.filter(i => i.kind === 'ADDON'))).catch(() => {});
  }, [router]);

  async function refreshActive() {
    if (!active) return;
    const updated = await apiFetch<GroomerBooking>(`/bookings/${active.id}`);
    setActive(updated);
    setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
  }

  async function addAddOn(catalogItemId: string) {
    if (!active || !catalogItemId) return;
    await apiFetch(`/bookings/${active.id}/line-items`, { method: 'POST', body: JSON.stringify({ catalogItemId }) });
    refreshActive();
  }
  async function removeAddOn(lineItemId: string) {
    if (!active) return;
    await apiFetch(`/bookings/${active.id}/line-items/${lineItemId}`, { method: 'DELETE' });
    refreshActive();
  }

  async function saveGroomerNote() {
    if (!active?.customer.id || !noteDraft.trim()) return;
    setSavingNote(true);
    await apiFetch(`/customers/${active.customer.id}/notes`, { method: 'POST', body: JSON.stringify({ body: noteDraft.trim() }) });
    setNoteDraft('');
    setSavingNote(false);
    alert('Note saved to client profile.');
  }

  async function advanceStage(stage: string) {
    if (!active) return;
    await apiFetch(`/bookings/${active.id}/workflow`, { method: 'POST', body: JSON.stringify({ stage }) });
    const updated = await apiFetch<GroomerBooking>(`/bookings/${active.id}`);
    setActive(updated);
    setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
  }

  async function uploadPhotos(kind: 'BEFORE' | 'AFTER', files: FileList) {
    if (!active) return;
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > 2_000_000) { alert(`${file.name} too large (max 2 MB) — skipped`); continue; }
      const url = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
      await apiFetch(`/bookings/${active.id}/photos`, { method: 'POST', body: JSON.stringify({ kind, url }) });
    }
    refreshActive();
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
        {active.pet && (
          <>
            <button onClick={() => setShowPetInfo(s => !s)} className="mt-3 text-xs text-neutral-400 hover:text-neutral-200">
              {showPetInfo ? '▲ Hide' : '▼ View'} full pet info
            </button>
            {showPetInfo && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-neutral-900/50 p-3 text-sm">
                <div><span className="text-neutral-500">Species:</span> {active.pet.species}</div>
                <div><span className="text-neutral-500">Breed:</span> {active.pet.breed ?? 'N/A'}</div>
                <div><span className="text-neutral-500">Gender:</span> {active.pet.gender ?? 'N/A'}</div>
                <div><span className="text-neutral-500">Fixed:</span> {active.pet.isFixed ? 'Yes' : 'Intact'}</div>
                <div><span className="text-neutral-500">Hair:</span> {active.pet.hairLength ?? 'N/A'}</div>
                <div><span className="text-neutral-500">Weight:</span> {active.pet.weightKg ?? '?'} kg</div>
                <div><span className="text-neutral-500">DOB:</span> {active.pet.dateOfBirth ? new Date(active.pet.dateOfBirth).toLocaleDateString('en-CA') : 'N/A'}</div>
                {active.pet.allergies && <div className="col-span-2 text-orange-300">⚠ Allergies: {active.pet.allergies}</div>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Services + add-ons */}
      <div className="rounded-xl bg-neutral-800 p-4 mb-4">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-2">Services &amp; add-ons</p>
        <div className="space-y-1 mb-3">
          {active.lineItems.map(l => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span>{l.description} <span className="text-neutral-500">${(l.unitPriceCents / 100).toFixed(2)}</span></span>
              <button onClick={() => removeAddOn(l.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
            </div>
          ))}
          {active.lineItems.length === 0 && <p className="text-sm text-neutral-500">No services yet.</p>}
        </div>
        <select className="w-full rounded-lg bg-neutral-700 border border-neutral-600 px-3 py-2 text-sm text-white"
          value="" onChange={e => addAddOn(e.target.value)}>
          <option value="">+ Add on a service (flows to checkout)…</option>
          {addOns.map(a => <option key={a.id} value={a.id}>{a.name} — ${(a.basePriceCents / 100).toFixed(2)}</option>)}
        </select>
        <p className="mt-1 text-xs text-neutral-500">e.g. add De-matting if the groom ran long — it appears on the bill at checkout.</p>
      </div>

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

      {/* Before / After photos */}
      <div className="rounded-xl bg-neutral-800 p-4 mb-4">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-3">Before / After photos</p>
        <div className="grid grid-cols-2 gap-3">
          {(['BEFORE', 'AFTER'] as const).map(kind => {
            const photos = (active.photos ?? []).filter(p => p.kind === kind);
            return (
              <div key={kind}>
                <p className="text-xs text-neutral-400 mb-1">{kind}</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {photos.map(p => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={p.url} alt={kind} className="w-full rounded-lg object-cover aspect-square" />
                    ))}
                  </div>
                  <label className="flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-neutral-600 text-sm text-neutral-400 cursor-pointer hover:border-brand">
                    + Add {kind.toLowerCase()} photo(s)
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                      onChange={e => { if (e.target.files?.length) uploadPhotos(kind, e.target.files); }} />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Groomer note → client profile */}
      <div className="rounded-xl bg-neutral-800 p-4 mb-4">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-2">Add note to client profile</p>
        <textarea rows={2} value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
          className="w-full rounded-lg bg-neutral-700 border border-neutral-600 px-3 py-2 text-sm text-white resize-none"
          placeholder="e.g. Very anxious with dryer — keep low. Pulls on nails." />
        <button onClick={saveGroomerNote} disabled={savingNote || !noteDraft.trim()}
          className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {savingNote ? 'Saving…' : 'Save to client profile'}
        </button>
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
