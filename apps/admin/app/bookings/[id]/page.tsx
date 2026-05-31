'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';
import VaccinationTab from '@/components/vaccination-tab';

interface BookingGroomer { userId: string; role: string | null; user: { id: string; fullName: string } }
interface BookingDetail {
  id: string;
  status: string;
  scheduledStart: string;
  storeId: string;
  assignedGroomerId: string | null;
  notes: string | null;
  customer: { fullName: string; phone: string | null; email: string | null; tags: string[]; statementCreditCents: number };
  pet: { id: string; name: string; breed: string | null; weightKg: number | null; tags: string[]; medicalNotes: string | null; groomNotes: string | null } | null;
  lineItems: { id: string; description: string; unitPriceCents: number }[];
  workflow: { stage: string; occurredAt: string }[];
  consents: { formType: string; signedAt: string | null }[];
  invoice: { status: string; totalCents: number; subtotalCents: number; discountCents: number; tipCents: number; cashRoundingCents: number; taxLines: { component: string; rate: number; amountCents: number }[] } | null;
  groomers: BookingGroomer[];
  extraPets: { petId: string; pet: { id: string; name: string; breed: string | null } }[];
  photos: { id: string; kind: string; url: string; createdAt: string }[];
}

interface Staff { id: string; fullName: string; role: string }

const WORKFLOW_STAGES = ['CHECK_IN','BEFORE_PHOTOS','BATH','DRYING','STYLING','NAILS','QUALITY_CHECK','AFTER_PHOTOS','READY'];

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<BookingDetail>(`/bookings/${id}`).then(b => {
      setBooking(b);
      if (b.storeId) apiFetch<Staff[]>(`/scheduling/staff?storeId=${b.storeId}`).then(s => setStaff(s.filter(u => u.role === 'GROOMER' || u.role === 'STORE_MANAGER'))).catch(() => {});
    }).finally(() => setLoading(false));
  }, [id, router]);

  async function autoSchedule() {
    try {
      const res = await apiFetch<{ groomerName: string }>(`/bookings/${id}/auto-schedule`, { method: 'POST' });
      alert(`Auto-assigned to ${res.groomerName} (lightest workload).`);
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : 'Auto-schedule failed'); }
  }
  async function assignPrimary(userId: string) {
    await apiFetch(`/bookings/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify({ assignedGroomerId: userId || null }) });
    reload();
  }
  async function addGroomer(userId: string) {
    if (!userId) return;
    await apiFetch(`/bookings/${id}/groomers`, { method: 'POST', body: JSON.stringify({ userId }) });
    reload();
  }
  async function removeGroomer(userId: string) {
    await apiFetch(`/bookings/${id}/groomers/${userId}`, { method: 'DELETE' });
    reload();
  }

  async function advanceStage(stage: string) {
    await apiFetch(`/bookings/${id}/workflow`, { method: 'POST', body: JSON.stringify({ stage }) });
    apiFetch<BookingDetail>(`/bookings/${id}`).then(setBooking);
  }

  async function approve(override = false) {
    try {
      await apiFetch(`/bookings/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ override }) });
      apiFetch<BookingDetail>(`/bookings/${id}`).then(setBooking);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Approve failed';
      if (msg.includes('consent forms not signed') && confirm(`${msg}\n\nOverride and confirm anyway?`)) {
        approve(true);
      } else {
        alert(msg);
      }
    }
  }

  function copySigningLink() {
    const webBase = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001');
    const link = `${webBase}/sign/${id}`;
    navigator.clipboard.writeText(link);
    alert(`Pre-visit signing link copied:\n${link}\n\nSend this to the client to sign on their own device.`);
  }

  async function reload() { apiFetch<BookingDetail>(`/bookings/${id}`).then(setBooking); }

  async function reschedule() {
    if (!booking) return;
    const current = new Date(booking.scheduledStart);
    const local = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const input = prompt('New date & time (YYYY-MM-DDTHH:MM):', local);
    if (!input) return;
    try {
      const start = new Date(input);
      // Preserve duration if we have a scheduledEnd, else default 60 min
      const end = new Date(start.getTime() + 60 * 60000);
      await apiFetch(`/bookings/${id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() }),
      });
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : 'Reschedule failed'); }
  }

  async function markNoShow() {
    const feeStr = prompt('No-show fee (CAD)? Charges card on file, else deducts statement credit. Leave 0 for none.', '25');
    if (feeStr === null) return;
    const feeCents = Math.round(parseFloat(feeStr || '0') * 100);
    try {
      const res = await apiFetch<{ chargeMethod?: string; note?: string }>(`/bookings/${id}/no-show`, { method: 'POST', body: JSON.stringify({ feeCents }) });
      alert(feeCents > 0 ? `Marked NO_SHOW. Fee ${res.chargeMethod === 'card' ? 'charged to card' : res.chargeMethod === 'credit' ? 'deducted from credit' : 'not collected'}.${res.note ? '\n' + res.note : ''}` : 'Marked NO_SHOW.');
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function cancelBooking() {
    const reason = prompt('Cancellation reason?');
    if (reason === null) return;
    const feeStr = prompt('Cancellation fee (CAD)? Charges card on file. Leave 0 for none.', '0');
    const feeCents = Math.round(parseFloat(feeStr || '0') * 100);
    try {
      await apiFetch(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason, feeCents }) });
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function closeBooking() {
    if (!confirm('Force-close this booking as COMPLETED?')) return;
    try {
      await apiFetch(`/bookings/${id}/close`, { method: 'POST' });
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  if (!booking) return <div className="p-8 text-sm text-red-500">Booking not found</div>;

  const completedStages = new Set(booking.workflow.map(w => w.stage));
  const nextStage = WORKFLOW_STAGES.find(s => !completedStages.has(s));

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-neutral-500 hover:text-neutral-700">← Back</button>
        <h1 className="font-semibold">Booking detail</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{booking.status.replace(/_/g,' ')}</span>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8 grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          {/* Customer + Pet */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Customer & Pet</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">{booking.customer.fullName}</p>
                {booking.customer.phone && <p className="text-neutral-500">{booking.customer.phone}</p>}
                {booking.customer.email && <p className="text-neutral-500">{booking.customer.email}</p>}
                <div className="flex gap-1 mt-1">
                  {booking.customer.tags.map(t => <span key={t} className="rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700">{t}</span>)}
                </div>
                {booking.customer.statementCreditCents > 0 && (
                  <p className="mt-1 text-xs text-green-600">Statement credit: ${(booking.customer.statementCreditCents / 100).toFixed(2)}</p>
                )}
              </div>
              {booking.pet && (
                <div>
                  <p className="font-medium">{booking.pet.name}</p>
                  <p className="text-neutral-500">{booking.pet.breed ?? 'Mixed'} · {booking.pet.weightKg ?? '?'} kg</p>
                  <div className="flex gap-1 mt-1">
                    {booking.pet.tags.map(t => <span key={t} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{t}</span>)}
                  </div>
                  {booking.pet.medicalNotes && <p className="mt-1 text-xs text-red-600">⚠ {booking.pet.medicalNotes}</p>}
                  {booking.pet.groomNotes && <p className="mt-1 text-xs text-neutral-500">📋 {booking.pet.groomNotes}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Grooming workflow */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Grooming workflow</h2>
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_STAGES.map(stage => {
                const done = completedStages.has(stage);
                const event = booking.workflow.find(w => w.stage === stage);
                return (
                  <div key={stage} className={`rounded-lg border px-3 py-2 text-xs ${done ? 'border-green-200 bg-green-50 text-green-700' : 'border-neutral-200 bg-neutral-50 text-neutral-400'}`}>
                    <p className="font-medium">{stage.replace(/_/g,' ')}</p>
                    {event && <p className="mt-0.5 text-green-600">{new Date(event.occurredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                );
              })}
            </div>
            {nextStage && booking.status !== 'COMPLETED' && (
              <button onClick={() => advanceStage(nextStage)}
                className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                Advance to: {nextStage.replace(/_/g,' ')}
              </button>
            )}
          </div>

          {/* Consents */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Consents</h2>
              <button onClick={copySigningLink}
                className="rounded-md bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/20">
                Copy signing link
              </button>
            </div>
            {booking.consents.length === 0
              ? <p className="text-sm text-neutral-400">No consent forms submitted yet. Send the signing link so the client can sign before arrival.</p>
              : booking.consents.map(c => (
                <div key={c.formType} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <span>{c.formType.replace(/_/g,' ')}</span>
                  <span className={c.signedAt ? 'text-green-600' : 'text-red-500'}>
                    {c.signedAt ? `✓ Signed ${new Date(c.signedAt).toLocaleDateString()}` : 'Not signed'}
                  </span>
                </div>
              ))
            }
          </div>

          {/* Additional pets (multi-pet booking) */}
          {booking.extraPets.length > 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-2 font-semibold">Additional pets</h2>
              <div className="flex flex-wrap gap-2">
                {booking.extraPets.map(ep => (
                  <span key={ep.petId} className="rounded-full bg-neutral-100 px-2.5 py-1 text-sm">
                    {ep.pet.name}{ep.pet.breed ? ` (${ep.pet.breed})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Before / After photos (from groomer PWA) */}
          {booking.photos.length > 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">Before / After photos</h2>
              <div className="grid grid-cols-2 gap-4">
                {(['BEFORE', 'AFTER'] as const).map(kind => (
                  <div key={kind}>
                    <p className="text-xs font-semibold text-neutral-400 uppercase mb-1">{kind}</p>
                    <div className="space-y-2">
                      {booking.photos.filter(p => p.kind === kind).map(p => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.url} alt={kind} className="w-full rounded-lg border object-cover" />
                      ))}
                      {booking.photos.filter(p => p.kind === kind).length === 0 && (
                        <p className="text-xs text-neutral-300">None</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vaccinations */}
          {booking.pet && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold">Vaccinations</h2>
              <VaccinationTab petId={booking.pet.id} />
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Groomers */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Groomers</h2>
              <button onClick={autoSchedule} className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200">
                ⚡ Auto-schedule
              </button>
            </div>
            <label className="block text-xs text-neutral-500 mb-1">Primary groomer</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white mb-3"
              value={booking.assignedGroomerId ?? ''} onChange={e => assignPrimary(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>

            {/* Additional groomers (multi-hand) */}
            <label className="block text-xs text-neutral-500 mb-1">Additional groomers</label>
            <div className="space-y-1 mb-2">
              {booking.groomers.map(g => (
                <div key={g.userId} className="flex items-center justify-between rounded bg-neutral-50 px-2 py-1 text-sm">
                  <span>{g.user.fullName}</span>
                  <button onClick={() => removeGroomer(g.userId)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
              {booking.groomers.length === 0 && <p className="text-xs text-neutral-300">None</p>}
            </div>
            <select className="w-full rounded-lg border px-3 py-1.5 text-sm bg-white" value="" onChange={e => addGroomer(e.target.value)}>
              <option value="">+ Add groomer…</option>
              {staff.filter(s => s.id !== booking.assignedGroomerId && !booking.groomers.some(g => g.userId === s.id))
                .map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </div>

          {/* Actions */}
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-2">
            <h2 className="mb-3 font-semibold">Actions</h2>
            {booking.status === 'PENDING' && (
              <button onClick={() => approve(false)} className="w-full rounded-md bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700">
                Approve booking
              </button>
            )}
            {/* POS checkout — only when there's something to charge and not already invoiced */}
            {!booking.invoice && !['CANCELLED', 'NO_SHOW'].includes(booking.status) && (
              <a href={`/pos/checkout/${booking.id}`}
                className="block w-full rounded-md bg-brand py-2 text-center text-sm font-medium text-white hover:opacity-90">
                POS checkout
              </a>
            )}

            {/* Process flows for active bookings */}
            {!['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status) && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs font-semibold text-neutral-400 uppercase">Process flow</p>
                <button onClick={reschedule} className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Reschedule
                </button>
                {['PENDING', 'CONFIRMED', 'LATE'].includes(booking.status) && (
                  <button onClick={markNoShow} className="w-full rounded-md border border-orange-200 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50">
                    Mark no-show
                  </button>
                )}
                {['CHECKED_IN', 'IN_PROGRESS', 'READY'].includes(booking.status) && (
                  <button onClick={closeBooking} className="w-full rounded-md border border-blue-200 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
                    Force-close (unclosed → completed)
                  </button>
                )}
                <button onClick={cancelBooking} className="w-full rounded-md border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  Cancel booking
                </button>
              </div>
            )}
          </div>

          {/* Invoice */}
          {booking.invoice && (
            <div className="rounded-xl border bg-white p-5 shadow-sm text-sm space-y-1">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Invoice</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${booking.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{booking.invoice.status}</span>
              </div>
              <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span>${(booking.invoice.subtotalCents / 100).toFixed(2)}</span></div>
              {booking.invoice.discountCents > 0 && (
                <div className="flex justify-between text-green-600"><span>Credit / discount applied</span><span>−${(booking.invoice.discountCents / 100).toFixed(2)}</span></div>
              )}
              {booking.invoice.taxLines.map(t => (
                <div key={t.component} className="flex justify-between text-neutral-500"><span>{t.component} ({(t.rate * 100).toFixed(2)}%)</span><span>${(t.amountCents / 100).toFixed(2)}</span></div>
              ))}
              {booking.invoice.tipCents > 0 && <div className="flex justify-between text-neutral-500"><span>Tip</span><span>${(booking.invoice.tipCents / 100).toFixed(2)}</span></div>}
              {booking.invoice.cashRoundingCents !== 0 && <div className="flex justify-between text-neutral-500"><span>Cash rounding</span><span>${(booking.invoice.cashRoundingCents / 100).toFixed(2)}</span></div>}
              <div className="flex justify-between pt-2 mt-1 border-t font-semibold"><span>Total</span><span>${(booking.invoice.totalCents / 100).toFixed(2)} CAD</span></div>
            </div>
          )}

          {/* Services */}
          <div className="rounded-xl border bg-white p-5 shadow-sm text-sm">
            <h2 className="mb-3 font-semibold">Services</h2>
            {booking.lineItems.length === 0
              ? <p className="text-neutral-400">No services added</p>
              : booking.lineItems.map(l => (
                <div key={l.id} className="flex justify-between py-1.5 border-b last:border-0">
                  <span>{l.description}</span>
                  <span className="text-neutral-500">${(l.unitPriceCents / 100).toFixed(2)}</span>
                </div>
              ))
            }
          </div>
        </div>
      </main>
    </div>
  );
}
