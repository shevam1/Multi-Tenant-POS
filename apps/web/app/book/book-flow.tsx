'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  theme: { primaryColor?: string; logoText?: string };
  stores: { id: string; name: string; province: string }[];
}

interface CatalogItem {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  durationMin: number | null;
}

type Step = 'returning' | 'new-customer' | 'pet' | 'service' | 'schedule' | 'confirm' | 'done';

interface BookingForm {
  isNew: boolean;
  fullName: string; phone: string; email: string;
  petName: string; petBreed: string; petWeight: string;
  selectedItems: string[];
  scheduledStart: string;
  storeId: string;
  notes: string;
}

export default function BookFlow() {
  const params = useSearchParams();
  const slug = params.get('tenant') ?? 'pawsome';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [step, setStep] = useState<Step>('returning');
  const [form, setForm] = useState<BookingForm>({
    isNew: true, fullName: '', phone: '', email: '',
    petName: '', petBreed: '', petWeight: '',
    selectedItems: [], scheduledStart: '', storeId: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Tenant>(`/public/tenant/${slug}`),
      apiFetch<CatalogItem[]>(`/public/tenant/${slug}/catalog`),
    ]).then(([t, c]) => {
      setTenant(t);
      setCatalog(c);
      if (t.stores[0]) setForm(f => ({ ...f, storeId: t.stores[0].id }));
    }).catch(() => setError('Unable to load booking page. Please try again.'));
  }, [slug]);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/public/tenant/${slug}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          storeId: form.storeId,
          customer: { fullName: form.fullName, phone: form.phone || undefined, email: form.email || undefined },
          pet: form.petName ? { name: form.petName, breed: form.petBreed || undefined, weightKg: form.petWeight ? Number(form.petWeight) : undefined } : undefined,
          scheduledStart: new Date(form.scheduledStart).toISOString(),
          catalogItemIds: form.selectedItems,
          notes: form.notes || undefined,
          isNewCustomer: form.isNew,
        }),
      });
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  const brand = tenant?.theme?.primaryColor ?? '#db2777';
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const packages = catalog.filter(i => i.kind === 'PACKAGE');

  if (error && !tenant) return <div className="p-8 text-red-500 text-center">{error}</div>;
  if (!tenant) return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <p className="text-sm font-semibold" style={{ color: brand }}>{tenant.theme?.logoText ?? tenant.name}</p>
        <h1 className="text-lg font-bold">{tenant.name}</h1>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10">
        {/* ── New vs returning ── */}
        {step === 'returning' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Book an appointment</h2>
            <p className="text-neutral-500">Is this your first time with us?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setForm(f => ({ ...f, isNew: true })); setStep('new-customer'); }}
                className="rounded-xl border-2 py-6 text-center font-medium hover:bg-neutral-50 transition">
                <div className="text-2xl mb-2">🐾</div>New customer
              </button>
              <button onClick={() => { setForm(f => ({ ...f, isNew: false })); setStep('new-customer'); }}
                className="rounded-xl border-2 py-6 text-center font-medium hover:bg-neutral-50 transition">
                <div className="text-2xl mb-2">👋</div>Returning customer
              </button>
            </div>
          </div>
        )}

        {/* ── Customer info ── */}
        {step === 'new-customer' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">{form.isNew ? 'Tell us about yourself' : 'Welcome back!'}</h2>
            <div className="space-y-3">
              {[
                { label: 'Full name *', key: 'fullName', type: 'text', placeholder: 'Jane Doe' },
                { label: 'Phone', key: 'phone', type: 'tel', placeholder: '+1 (416) 555-0100' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'jane@example.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={form[f.key as keyof BookingForm] as string}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button onClick={() => setStep('pet')} disabled={!form.fullName}
              style={{ backgroundColor: brand }}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
          </div>
        )}

        {/* ── Pet info ── */}
        {step === 'pet' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">Your pet</h2>
            <div className="space-y-3">
              {[
                { label: 'Pet name *', key: 'petName', type: 'text', placeholder: 'Rex' },
                { label: 'Breed', key: 'petBreed', type: 'text', placeholder: 'Golden Retriever' },
                { label: 'Weight (kg)', key: 'petWeight', type: 'number', placeholder: '25' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={form[f.key as keyof BookingForm] as string}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('new-customer')} className="flex-1 rounded-xl border py-3 text-sm font-medium">Back</button>
              <button onClick={() => setStep('service')} disabled={!form.petName}
                style={{ backgroundColor: brand }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}

        {/* ── Service selection ── */}
        {step === 'service' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">Choose a service</h2>
            <div className="space-y-3">
              {packages.map(item => (
                <label key={item.id}
                  className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${form.selectedItems.includes(item.id) ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                  style={form.selectedItems.includes(item.id) ? { borderColor: brand } : {}}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4"
                    checked={form.selectedItems.includes(item.id)}
                    onChange={e => setForm(f => ({
                      ...f, selectedItems: e.target.checked
                        ? [...f.selectedItems, item.id]
                        : f.selectedItems.filter(id => id !== item.id),
                    }))} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{item.name}</p>
                    {item.description && <p className="text-xs text-neutral-500 mt-0.5">{item.description}</p>}
                    <p className="mt-1 text-xs text-neutral-400">{fmt(item.basePriceCents)}{item.durationMin ? ` · ${item.durationMin} min` : ''}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('pet')} className="flex-1 rounded-xl border py-3 text-sm font-medium">Back</button>
              <button onClick={() => setStep('schedule')}
                style={{ backgroundColor: brand }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white">Continue</button>
            </div>
          </div>
        )}

        {/* ── Schedule ── */}
        {step === 'schedule' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">Pick a date &amp; time</h2>
            {tenant.stores.length > 1 && (
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <select className="w-full rounded-lg border px-3 py-2.5 text-sm"
                  value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
                  {tenant.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Date &amp; time *</label>
              <input type="datetime-local" className="w-full rounded-lg border px-3 py-2.5 text-sm"
                value={form.scheduledStart}
                onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <textarea className="w-full rounded-lg border px-3 py-2.5 text-sm" rows={3} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Anything we should know about your pet…" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('service')} className="flex-1 rounded-xl border py-3 text-sm font-medium">Back</button>
              <button onClick={() => setStep('confirm')} disabled={!form.scheduledStart}
                style={{ backgroundColor: brand }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50">Review booking</button>
            </div>
          </div>
        )}

        {/* ── Confirm ── */}
        {step === 'confirm' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">Confirm your booking</h2>
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Customer</span><span className="font-medium">{form.fullName}</span></div>
              {form.phone && <div className="flex justify-between"><span className="text-neutral-500">Phone</span><span>{form.phone}</span></div>}
              {form.petName && <div className="flex justify-between"><span className="text-neutral-500">Pet</span><span className="font-medium">{form.petName}{form.petBreed && ` (${form.petBreed})`}</span></div>}
              <div className="flex justify-between"><span className="text-neutral-500">Date</span><span>{new Date(form.scheduledStart).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Location</span><span>{tenant.stores.find(s => s.id === form.storeId)?.name}</span></div>
              {form.selectedItems.length > 0 && (
                <div>
                  <p className="text-neutral-500 mb-1">Services</p>
                  {form.selectedItems.map(id => { const item = catalog.find(c => c.id === id); return item ? <p key={id} className="font-medium">{item.name} — {fmt(item.basePriceCents)}</p> : null; })}
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-400 text-center">Your booking is pending approval. We&apos;ll confirm it shortly.</p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('schedule')} className="flex-1 rounded-xl border py-3 text-sm font-medium">Back</button>
              <button onClick={submit} disabled={submitting}
                style={{ backgroundColor: brand }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Request appointment'}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="text-5xl">🐾</div>
            <h2 className="text-2xl font-bold">Booking request sent!</h2>
            <p className="text-neutral-500 max-w-sm">Your appointment is <strong>pending approval</strong>. Our team will confirm it shortly.</p>
            <button onClick={() => setStep('returning')}
              style={{ backgroundColor: brand }}
              className="mt-4 rounded-xl px-6 py-3 text-sm font-semibold text-white">Book another</button>
          </div>
        )}
      </main>
    </div>
  );
}
