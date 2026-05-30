'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';
import VaccinationTab from '@/components/vaccination-tab';

interface BookingDetail {
  id: string;
  status: string;
  scheduledStart: string;
  notes: string | null;
  customer: { fullName: string; phone: string | null; email: string | null; tags: string[]; statementCreditCents: number };
  pet: { id: string; name: string; breed: string | null; weightKg: number | null; tags: string[]; medicalNotes: string | null; groomNotes: string | null } | null;
  lineItems: { id: string; description: string; unitPriceCents: number }[];
  workflow: { stage: string; occurredAt: string }[];
  consents: { formType: string; signedAt: string | null }[];
  invoice: { status: string; totalCents: number; taxLines: { component: string; rate: number; amountCents: number }[] } | null;
}

const WORKFLOW_STAGES = ['CHECK_IN','BEFORE_PHOTOS','BATH','DRYING','STYLING','NAILS','QUALITY_CHECK','AFTER_PHOTOS','READY'];

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<BookingDetail>(`/bookings/${id}`).then(setBooking).finally(() => setLoading(false));
  }, [id, router]);

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
          {/* Actions */}
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-2">
            <h2 className="mb-3 font-semibold">Actions</h2>
            {booking.status === 'PENDING' && (
              <button onClick={() => approve(false)} className="w-full rounded-md bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700">
                Approve booking
              </button>
            )}
            <a href={`/pos/checkout/${booking.id}`}
              className="block w-full rounded-md border py-2 text-center text-sm font-medium hover:bg-neutral-50">
              POS checkout
            </a>
          </div>

          {/* Invoice */}
          {booking.invoice && (
            <div className="rounded-xl border bg-white p-5 shadow-sm text-sm">
              <h2 className="mb-3 font-semibold">Invoice</h2>
              <p className="text-neutral-500">Status: <span className="font-medium text-neutral-900">{booking.invoice.status}</span></p>
              {booking.invoice.taxLines.map(t => (
                <p key={t.component} className="text-neutral-500">{t.component} ({(t.rate * 100).toFixed(2)}%): ${(t.amountCents / 100).toFixed(2)}</p>
              ))}
              <p className="mt-2 font-semibold">Total: ${(booking.invoice.totalCents / 100).toFixed(2)} CAD</p>
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
