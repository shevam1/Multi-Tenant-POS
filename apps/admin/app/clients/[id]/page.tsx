'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';
import ClientFormModal from '@/components/client-form-modal';
import PetFormModal from '@/components/pet-form-modal';

interface Vaccination { id: string; vaccineType: string; expiresAt: string | null }
interface Pet { id: string; name: string; species: string; breed: string | null; weightKg: number | null; dateOfBirth: string | null; gender: string | null; tags: string[]; allergies: string | null; medicalNotes: string | null; groomNotes: string | null; vaccinations: Vaccination[] }
interface Booking { id: string; status: string; scheduledStart: string; scheduledEnd: string | null; lineItems: { description: string }[] }
interface Membership { plan: { tier: string; name: string } }

interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  membershipTier: string | null;
  emergencyContact: string | null;
  tags: string[];
  status: string;
  loyaltyPoints: number;
  statementCreditCents: number;
  createdAt: string;
  pets: Pet[];
  bookings: Booking[];
  memberships: Membership[];
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700', PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700', CANCELLED: 'bg-red-100 text-red-500',
  NO_SHOW: 'bg-orange-100 text-orange-600', CHECKED_IN: 'bg-indigo-100 text-indigo-700',
};

const TIER_BADGE: Record<string, string> = {
  SILVER: 'bg-neutral-200 text-neutral-700', GOLD: 'bg-amber-200 text-amber-800', PLATINUM: 'bg-violet-200 text-violet-800',
};

function fmt(c: number) { return `$${(c / 100).toFixed(2)}`; }

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editCustomer, setEditCustomer] = useState(false);
  const [editPet, setEditPet] = useState<Pet | null>(null);
  const [addPet, setAddPet] = useState(false);

  async function load() {
    const c = await apiFetch<Customer>(`/customers/${id}`);
    setCustomer(c);
  }

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    load().finally(() => setLoading(false));
    if (sp.get('edit') === '1') setEditCustomer(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;
  if (!customer) return <div className="p-8 text-sm text-red-500">Client not found</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/clients')} className="text-sm text-neutral-500 hover:text-neutral-700">← Clients</button>
        <h1 className="font-semibold">{customer.fullName || 'Client detail'}</h1>
        {customer.membershipTier && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_BADGE[customer.membershipTier] ?? ''}`}>{customer.membershipTier}</span>
        )}
        <button onClick={() => setEditCustomer(true)} className="ml-auto rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">Edit</button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* Client info */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              ['Phone', customer.phone],
              ['Email', customer.email],
              ['Address', [customer.addressLine, customer.city, customer.postalCode].filter(Boolean).join(', ')],
              ['Emergency contact', customer.emergencyContact],
              ['Status', customer.status],
              ['Created', new Date(customer.createdAt).toLocaleDateString('en-CA')],
              ['Loyalty points', `${customer.loyaltyPoints.toLocaleString()} pts`],
              ['Statement credit', fmt(customer.statementCreditCents)],
            ].map(([k, v]) => v ? (
              <div key={k as string}>
                <span className="text-xs text-neutral-400">{k}</span>
                <p className="font-medium">{v}</p>
              </div>
            ) : null)}
          </div>
          {customer.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {customer.tags.map(t => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>)}
            </div>
          )}
        </div>

        {/* Pets */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Pets ({customer.pets.length})</h2>
            <button onClick={() => setAddPet(true)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">+ Add Pet</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {customer.pets.map(pet => (
              <div key={pet.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{pet.name}</p>
                    <p className="text-xs text-neutral-500">{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}{pet.gender ? ` · ${pet.gender}` : ''}</p>
                    {pet.weightKg && <p className="text-xs text-neutral-500">{pet.weightKg} kg</p>}
                  </div>
                  <button onClick={() => setEditPet(pet)} className="text-xs text-brand hover:underline">Edit</button>
                </div>
                {pet.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">{pet.tags.map(t => <span key={t} className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{t}</span>)}</div>
                )}
                {pet.medicalNotes && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">⚕ {pet.medicalNotes}</p>}
                {pet.allergies && <p className="mt-1 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">⚠ Allergies: {pet.allergies}</p>}
                {pet.groomNotes && <p className="mt-1 text-xs text-neutral-600 bg-neutral-50 rounded px-2 py-1">✂ {pet.groomNotes}</p>}
                {pet.vaccinations.length > 0 && (
                  <p className="mt-1 text-xs text-green-600">{pet.vaccinations.length} vaccination record{pet.vaccinations.length > 1 ? 's' : ''}</p>
                )}
              </div>
            ))}
            {customer.pets.length === 0 && <p className="text-sm text-neutral-400">No pets yet.</p>}
          </div>
        </section>

        {/* Booking history */}
        <section>
          <h2 className="mb-3 font-semibold">Booking history ({customer.bookings.length})</h2>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                <tr>{['Date', 'Services', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {customer.bookings.map(b => (
                  <tr key={b.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">{new Date(b.scheduledStart).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-4 py-3 text-neutral-600">{b.lineItems.map(l => l.description).join(', ') || '—'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status] ?? ''}`}>{b.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3"><a href={`/bookings/${b.id}`} className="text-brand text-xs hover:underline">View →</a></td>
                  </tr>
                ))}
                {customer.bookings.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-400">No bookings yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Loyalty */}
        {customer.memberships.length > 0 && (
          <section className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-semibold">Membership: {customer.memberships[0].plan.name}</p>
              <p className="text-sm text-neutral-500">{customer.loyaltyPoints.toLocaleString()} loyalty points</p>
            </div>
            <a href="/memberships" className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">Manage →</a>
          </section>
        )}
      </main>

      {editCustomer && (
        <ClientFormModal customer={customer} onClose={() => setEditCustomer(false)}
          onSaved={() => { setEditCustomer(false); load(); }} />
      )}
      {addPet && (
        <PetFormModal customerId={customer.id} pet={null} onClose={() => setAddPet(false)}
          onSaved={() => { setAddPet(false); load(); }} />
      )}
      {editPet && (
        <PetFormModal customerId={customer.id} pet={editPet} onClose={() => setEditPet(null)}
          onSaved={() => { setEditPet(null); load(); }} />
      )}
    </div>
  );
}
