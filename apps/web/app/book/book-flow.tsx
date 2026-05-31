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
  priceCents: number;
  durationMin: number | null;
  species?: string[];
  hairLengths?: string[];
  breeds?: string[];
  minWeightKg?: number | null;
  maxWeightKg?: number | null;
}

/** Service eligibility for a pet (empty filter = applies to all). */
function eligibleForPet(item: CatalogItem, pet: PetEntry): boolean {
  const breed = pet.breed.trim();
  const weight = pet.weight ? Number(pet.weight) : NaN;
  if (item.breeds?.length && breed && !item.breeds.includes(breed)) return false;
  if (!Number.isNaN(weight)) {
    if (item.minWeightKg != null && weight < item.minWeightKg) return false;
    if (item.maxWeightKg != null && weight > item.maxWeightKg) return false;
  }
  return true;
}

type Step = 'returning' | 'new-customer' | 'pet' | 'service' | 'schedule' | 'confirm' | 'done';

interface PetEntry {
  name: string; breed: string; weight: string; selectedItems: string[];
}

interface BookingForm {
  isNew: boolean;
  fullName: string; phone: string; email: string;
  pets: PetEntry[];
  scheduledStart: string;
  storeId: string;
  notes: string;
}

const emptyPet = (): PetEntry => ({ name: '', breed: '', weight: '', selectedItems: [] });

export default function BookFlow() {
  const params = useSearchParams();
  const slug = params.get('tenant') ?? 'pawsome';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [step, setStep] = useState<Step>('returning');
  const [form, setForm] = useState<BookingForm>({
    isNew: true, fullName: '', phone: '', email: '',
    pets: [emptyPet()], scheduledStart: '', storeId: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);

  useEffect(() => {
    apiFetch<Tenant>(`/public/tenant/${slug}`).then(async t => {
      setTenant(t);
      const storeId = t.stores[0]?.id ?? '';
      if (storeId) setForm(f => ({ ...f, storeId }));
      // Location-aware catalog: prices + availability for the selected store
      const c = await apiFetch<CatalogItem[]>(`/public/tenant/${slug}/catalog${storeId ? `?storeId=${storeId}` : ''}`);
      setCatalog(c);
    }).catch(() => setError('Unable to load booking page. Please try again.'));
  }, [slug]);

  // Refetch catalog when the chosen store changes (location-specific pricing)
  useEffect(() => {
    if (!form.storeId) return;
    apiFetch<CatalogItem[]>(`/public/tenant/${slug}/catalog?storeId=${form.storeId}`).then(setCatalog).catch(() => {});
  }, [form.storeId, slug]);

  // Fetch available slots when date or store changes (only open slots shown)
  useEffect(() => {
    if (!slotDate || !form.storeId) { setSlots([]); return; }
    apiFetch<{ slots: { time: string; available: boolean }[] }>(
      `/public/tenant/${slug}/availability?storeId=${form.storeId}&date=${slotDate}`,
    ).then(r => setSlots(r.slots)).catch(() => setSlots([]));
  }, [slotDate, form.storeId, slug]);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/public/tenant/${slug}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          storeId: form.storeId,
          customer: { fullName: form.fullName, phone: form.phone || undefined, email: form.email || undefined },
          pets: form.pets.filter(p => p.name).map(p => ({
            name: p.name, breed: p.breed || undefined,
            weightKg: p.weight ? Number(p.weight) : undefined,
            catalogItemIds: p.selectedItems,
          })),
          scheduledStart: new Date(form.scheduledStart).toISOString(),
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

        {/* ── Pet info (multi-pet) ── */}
        {step === 'pet' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">Your pet{form.pets.length > 1 ? 's' : ''}</h2>
            {form.pets.map((pet, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Pet {i + 1}</p>
                  {form.pets.length > 1 && (
                    <button onClick={() => setForm(f => ({ ...f, pets: f.pets.filter((_, idx) => idx !== i) }))}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                </div>
                {[
                  { label: 'Pet name *', key: 'name', type: 'text', placeholder: 'Rex' },
                  { label: 'Breed', key: 'breed', type: 'text', placeholder: 'Golden Retriever' },
                  { label: 'Weight (kg)', key: 'weight', type: 'number', placeholder: '25' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium mb-1">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      value={pet[f.key as keyof PetEntry] as string}
                      onChange={e => setForm(prev => ({ ...prev, pets: prev.pets.map((p, idx) => idx === i ? { ...p, [f.key]: e.target.value } : p) }))} />
                  </div>
                ))}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, pets: [...f.pets, emptyPet()] }))}
              className="w-full rounded-xl border-2 border-dashed py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-400">
              + Add another pet
            </button>
            <div className="flex gap-3">
              <button onClick={() => setStep('new-customer')} className="flex-1 rounded-xl border py-3 text-sm font-medium">Back</button>
              <button onClick={() => setStep('service')} disabled={!form.pets.some(p => p.name)}
                style={{ backgroundColor: brand }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}

        {/* ── Service selection (per pet) ── */}
        {step === 'service' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Choose services</h2>
            {form.pets.filter(p => p.name).map((pet, i) => {
              const petIdx = form.pets.findIndex(p => p === pet);
              const eligible = packages.filter(item => eligibleForPet(item, pet));
              return (
                <div key={petIdx} className="space-y-3">
                  <p className="text-sm font-semibold">{pet.name}{pet.breed ? ` · ${pet.breed}` : ''}</p>
                  {eligible.length === 0 && <p className="text-xs text-neutral-400">No services match this pet&apos;s size or breed — please call us to book.</p>}
                  {eligible.map(item => {
                    const selected = pet.selectedItems.includes(item.id);
                    return (
                      <label key={item.id}
                        className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${selected ? 'bg-neutral-50' : 'hover:bg-neutral-50'}`}
                        style={selected ? { borderColor: brand } : {}}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={selected}
                          onChange={e => setForm(f => ({
                            ...f, pets: f.pets.map((p, idx) => idx === petIdx ? {
                              ...p, selectedItems: e.target.checked ? [...p.selectedItems, item.id] : p.selectedItems.filter(id => id !== item.id),
                            } : p),
                          }))} />
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {item.description && <p className="text-xs text-neutral-500 mt-0.5">{item.description}</p>}
                          <p className="mt-1 text-xs text-neutral-400">{fmt(item.priceCents)}{item.durationMin ? ` · ${item.durationMin} min` : ''}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })}
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
              <label className="block text-sm font-medium mb-1">Date *</label>
              <input type="date" className="w-full rounded-lg border px-3 py-2.5 text-sm"
                value={slotDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => { setSlotDate(e.target.value); setForm(f => ({ ...f, scheduledStart: '' })); }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Available times *</label>
              {!slotDate ? (
                <p className="text-sm text-neutral-400">Pick a date to see open slots.</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-neutral-400">Loading availability…</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map(s => {
                    const t = new Date(s.time);
                    const label = t.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
                    const selected = form.scheduledStart === s.time;
                    return (
                      <button key={s.time} type="button" disabled={!s.available}
                        onClick={() => setForm(f => ({ ...f, scheduledStart: s.time }))}
                        style={selected ? { backgroundColor: brand, color: '#fff', borderColor: brand } : {}}
                        className={`rounded-lg border py-2 text-xs font-medium transition ${s.available ? 'hover:border-neutral-400' : 'opacity-30 cursor-not-allowed line-through'}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-xs text-neutral-400">Only open slots are shown — confirmed appointments are hidden.</p>
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
              <div className="flex justify-between"><span className="text-neutral-500">Date</span><span>{new Date(form.scheduledStart).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Location</span><span>{tenant.stores.find(s => s.id === form.storeId)?.name}</span></div>
              {form.pets.filter(p => p.name).map((pet, i) => (
                <div key={i} className="border-t pt-2">
                  <p className="font-medium">{pet.name}{pet.breed && ` (${pet.breed})`}</p>
                  {pet.selectedItems.map(id => { const item = catalog.find(c => c.id === id); return item ? <p key={id} className="text-xs text-neutral-500">{item.name} — {fmt(item.priceCents)}</p> : null; })}
                  {pet.selectedItems.length === 0 && <p className="text-xs text-neutral-400">No services selected</p>}
                </div>
              ))}
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
