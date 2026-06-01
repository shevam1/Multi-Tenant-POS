'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import ClientFormModal from '@/components/client-form-modal';
import PetFormModal from '@/components/pet-form-modal';
import VaccinationTab from '@/components/vaccination-tab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaccinationRecord { id: string; vaccineType: string; expiresAt: string | null; status: string }
interface Pet {
  id: string; name: string; species: string; breed: string | null; weightKg: number | null;
  dateOfBirth: string | null; gender: string | null; hairLength: string | null; isFixed: boolean;
  photoUrl: string | null;
  tags: string[]; allergies: string | null; medicalNotes: string | null; groomNotes: string | null;
  preferredGroomerId: string | null; vaccinations: VaccinationRecord[];
}
interface Membership { plan: { tier: string; name: string; monthlyFeeCents: number } }
interface Note { id: string; body: string; createdAt: string; author: { id: string; fullName: string } }
interface AppointmentStats {
  total: number; totalSalesCents: number; completed: number; cancelled: number;
  noShow: number; unclosed: number; outstanding: number;
}
interface BookingRow {
  id: string; status: string; scheduledStart: string; scheduledEnd: string | null;
  store: { name: string };
  pet: { id: string; name: string; breed: string | null } | null;
  lineItems: { description: string; unitPriceCents: number }[];
  invoice: { totalCents: number; status: string } | null;
}
interface PaymentMethod { id: string; last4: string; brand: string; expMonth: number; expYear: number }
interface ConsentForm { formType: string; title: string; mandatory: boolean; signed: boolean }
interface StaffUser { id: string; fullName: string; role: string }

interface Customer {
  id: string; fullName: string; phone: string | null; email: string | null;
  addressLine: string | null; city: string | null; postalCode: string | null;
  membershipTier: string | null; emergencyContact: string | null; tags: string[];
  status: string; loyaltyPoints: number; statementCreditCents: number; createdAt: string;
  stripeCustomerId: string | null;
  preferredGroomerId: string | null; autoMessageMode: string; blockMessages: boolean;
  blockOnlineBooking: boolean; optOutMarketingSms: boolean; optOutMarketingEmail: boolean;
  bookingFreqValue: number; bookingFreqUnit: string;
  pets: Pet[]; bookings: BookingRow[]; memberships: Membership[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
const AVATAR_COLORS = ['bg-rose-400', 'bg-amber-400', 'bg-teal-400', 'bg-blue-400', 'bg-violet-400', 'bg-pink-400'];
const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];

const TIER_BADGE: Record<string, string> = {
  SILVER: 'bg-neutral-200 text-neutral-700', GOLD: 'bg-amber-200 text-amber-800', PLATINUM: 'bg-violet-200 text-violet-800',
};
const STATUS_CHIP: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700', PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700', CANCELLED: 'bg-red-100 text-red-500',
  NO_SHOW: 'bg-orange-100 text-orange-600', CHECKED_IN: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700', READY: 'bg-green-100 text-green-600',
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-teal-500' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useShell();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [appts, setAppts] = useState<BookingRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [apptFilter, setApptFilter] = useState('all');
  const [rightTab, setRightTab] = useState<'appointments' | 'sales' | 'loyalty'>('appointments');
  const [bottomTab, setBottomTab] = useState<'pets' | 'preference'>('pets');
  const [showVax, setShowVax] = useState<string | null>(null);

  const [editCustomer, setEditCustomer] = useState(false);
  const [editPet, setEditPet] = useState<Pet | null>(null);
  const [addPet, setAddPet] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const [paymentLinkModal, setPaymentLinkModal] = useState(false);
  const [creditModal, setCreditModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);

  const [prefs, setPrefs] = useState<Partial<Customer>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const prefsDirty = useRef(false);

  const load = useCallback(async () => {
    const [c, s, h, n, pm] = await Promise.all([
      apiFetch<Customer>(`/customers/${id}`),
      apiFetch<AppointmentStats>(`/customers/${id}/stats`),
      apiFetch<BookingRow[]>(`/customers/${id}/appointments?filter=${apptFilter}`),
      apiFetch<Note[]>(`/customers/${id}/notes`),
      apiFetch<{ methods: PaymentMethod[] }>(`/pos/customers/${id}/payment-methods`).catch(() => ({ methods: [] })),
    ]);
    setCustomer(c); setStats(s); setAppts(h); setNotes(n); setPaymentMethods(pm.methods);
    setPrefs({}); prefsDirty.current = false;
  }, [id, apptFilter]);

  useEffect(() => {
    if (me.storeId) apiFetch<StaffUser[]>(`/scheduling/staff?storeId=${me.storeId}`).then(setStaff).catch(() => []);
    load().finally(() => setLoading(false));
    if (sp.get('edit') === '1') setEditCustomer(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!customer) return;
    apiFetch<BookingRow[]>(`/customers/${id}/appointments?filter=${apptFilter}`).then(setAppts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptFilter]);

  async function submitNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    await apiFetch(`/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ body: newNote }) });
    setNewNote('');
    setNotes(await apiFetch<Note[]>(`/customers/${id}/notes`));
    setSavingNote(false);
  }

  async function savePrefs(patch: Partial<Customer>) {
    setSavingPrefs(true);
    await apiFetch(`/customers/${id}/preferences`, { method: 'PATCH', body: JSON.stringify(patch) });
    setSavingPrefs(false);
  }
  function prefChange(key: keyof Customer, val: unknown) {
    setPrefs(p => ({ ...p, [key]: val }));
    prefsDirty.current = true;
    setTimeout(() => savePrefs({ [key]: val }), 600);
  }

  if (loading || !customer) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground">{loading ? 'Loading…' : 'Client not found'}</div>;

  const displayPrefs = { ...customer, ...prefs };
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);
  const memberSince = new Date(customer.createdAt).getFullYear();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      {/* ── Action bar (mockup header) ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 border-b bg-white px-6 py-3">
        <button onClick={() => router.push('/clients')} className="text-sm text-muted-foreground hover:text-foreground">←</button>
        <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${avatarColor(customer.id)}`}>{initials(customer.fullName || 'NS')}</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{customer.fullName || 'Not Set'}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${customer.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
              ● {customer.status === 'ACTIVE' ? 'Active' : customer.status.toLowerCase()}
            </span>
            {customer.membershipTier && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TIER_BADGE[customer.membershipTier] ?? ''}`}>{customer.membershipTier}</span>}
          </div>
          {(customer.addressLine || customer.city) && <p className="text-xs text-muted-foreground">📍 {[customer.addressLine, customer.city, customer.postalCode].filter(Boolean).join(', ')}</p>}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditCustomer(true)}>Edit Profile</Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/messages')}>Message</Button>
          <Button size="sm" onClick={() => router.push(`/bookings/new?customerId=${id}`)}>Book Appointment</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
        <aside className="flex w-[280px] shrink-0 flex-col gap-0 overflow-y-auto border-r bg-white">
          <section className="border-b p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Contact</h2><button onClick={() => setEditCustomer(true)} className="text-sm text-primary hover:underline">Edit</button></div>
            <div className="space-y-2 text-sm">
              {customer.phone && <div className="flex items-center gap-2 text-blue-600"><span>📞</span><a href={`tel:${customer.phone}`}>{customer.phone}</a></div>}
              {customer.email && <div className="flex items-center gap-2 text-blue-600"><span>✉</span><span className="truncate">{customer.email}</span></div>}
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">Preferred Staff:</span>
                <span className="text-neutral-600">{customer.preferredGroomerId ? (staff.find(s => s.id === customer.preferredGroomerId)?.fullName ?? 'Unknown') : 'Not Set'}</span>
              </div>
              <button onClick={() => setCreditModal(true)} className="text-sm text-primary hover:underline">Credit: {fmt(customer.statementCreditCents)}</button>
              <p className="pt-1 text-xs text-muted-foreground">Created on: {fmtDate(customer.createdAt)}</p>
            </div>
          </section>

          <section className="border-b p-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Tags</h2><button onClick={() => setEditCustomer(true)} className="text-sm text-primary hover:underline">Edit</button></div>
            <div className="flex flex-wrap gap-1">
              {customer.tags.map(t => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>)}
              {customer.tags.length === 0 && <span className="text-xs text-neutral-300">No tags</span>}
            </div>
          </section>

          {/* Private Notes */}
          <section className="flex-1 p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Private Notes</h2></div>
            <div className="mb-3">
              <textarea rows={2} className="w-full resize-none rounded-lg border px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Add a quick note…" value={newNote} onChange={e => setNewNote(e.target.value)} />
              {newNote.trim() && <button onClick={submitNote} disabled={savingNote} className="mt-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">{savingNote ? '…' : 'Save Note'}</button>}
            </div>
            <div className="space-y-3">
              {visibleNotes.map(n => (
                <div key={n.id} className="text-xs">
                  <p className="leading-relaxed text-neutral-800">{n.body}</p>
                  <p className="mt-1 text-muted-foreground">{fmtDate(n.createdAt)} {fmtTime(n.createdAt)} by {n.author.fullName}</p>
                </div>
              ))}
              {notes.length > 3 && <button onClick={() => setShowAllNotes(a => !a)} className="w-full rounded-lg bg-secondary py-1.5 text-xs text-muted-foreground hover:bg-neutral-200">{showAllNotes ? 'hide' : `Show ${notes.length - 3} more`}</button>}
            </div>
          </section>
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {/* Account summary */}
          {stats && (
            <div className="grid grid-cols-4 border-b bg-white">
              <div className="border-r p-5"><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-2xl font-bold">{fmt(stats.totalSalesCents)}</p></div>
              <div className="border-r p-5"><p className="text-xs text-muted-foreground">Visits</p><p className="text-2xl font-bold">{stats.completed}</p></div>
              <div className="border-r p-5"><p className="text-xs text-muted-foreground">Cancellations</p><p className="text-2xl font-bold">{stats.cancelled}</p></div>
              <div className="p-5"><p className="text-xs text-muted-foreground">Member Since</p><p className="text-2xl font-bold">{memberSince}</p></div>
            </div>
          )}

          {/* Right tabs: Appointments | Sales | Loyalty */}
          <div className="border-b bg-white">
            <div className="flex items-center justify-between px-5">
              <div className="flex gap-0">
                {(['appointments', 'sales', 'loyalty'] as const).map(t => (
                  <button key={t} onClick={() => setRightTab(t)}
                    className={`border-b-2 px-4 py-3 text-sm font-medium capitalize transition ${rightTab === t ? 'border-amber-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <button onClick={() => router.push(`/bookings/new?customerId=${id}`)} className="rounded-md bg-amber-accent px-3 py-1.5 text-xs font-bold text-neutral-900 hover:opacity-90">Book New</button>
            </div>
          </div>

          {rightTab === 'appointments' && (
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <select className="rounded-lg border bg-white px-3 py-1.5 text-sm" value={apptFilter} onChange={e => setApptFilter(e.target.value)}>
                  {[['all', 'All'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['outstanding', 'Outstanding'], ['unclosed', 'Unclosed'], ['cancelled', 'Cancelled'], ['no_show', 'No Show']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>{['ID', 'Status', 'Date', 'Pets', 'Items', 'Total Sales', 'Duration', ''].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {appts.map(a => {
                      const duration = a.scheduledEnd ? `${Math.round((new Date(a.scheduledEnd).getTime() - new Date(a.scheduledStart).getTime()) / 60000)} min` : '—';
                      return (
                        <tr key={a.id} className="hover:bg-secondary/60">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{a.id.slice(-6)}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[a.status] ?? ''}`}>{a.status.replace(/_/g, ' ')}</span></td>
                          <td className="px-3 py-2 text-xs">{fmtDate(a.scheduledStart)}</td>
                          <td className="px-3 py-2 text-xs">{a.pet?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{a.lineItems.map(l => l.description).join(', ') || '—'}</td>
                          <td className="px-3 py-2 text-xs font-medium">{a.invoice ? fmt(a.invoice.totalCents) : '—'}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{duration}</td>
                          <td className="px-3 py-2"><a href={`/bookings/${a.id}`} className="text-xs text-primary hover:underline">→</a></td>
                        </tr>
                      );
                    })}
                    {appts.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No appointments.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {rightTab === 'loyalty' && <LoyaltyTab customerId={id} customer={customer} />}
          {rightTab === 'sales' && <div className="p-5 text-sm text-muted-foreground">Sales history coming soon.</div>}

          {/* Bottom tabs: Pets | Preference */}
          <div className="mt-2 border-t bg-white">
            <div className="flex border-b px-5">
              {(['pets', 'preference'] as const).map(t => (
                <button key={t} onClick={() => setBottomTab(t)} className={`border-b-2 px-4 py-3 text-sm font-medium capitalize transition ${bottomTab === t ? 'border-amber-accent text-foreground' : 'border-transparent text-muted-foreground'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {bottomTab === 'pets' && (
              <div className="p-5">
                <div className="mb-3 flex justify-end"><button onClick={() => setAddPet(true)} className="rounded-md bg-amber-accent px-3 py-1.5 text-xs font-bold text-neutral-900 hover:opacity-90">+ Pet</button></div>
                <div className="space-y-4">
                  {customer.pets.map(pet => (
                    <div key={pet.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                      <div className="flex items-center gap-3 border-b p-4">
                        {pet.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pet.photoUrl} alt={pet.name} className="h-12 w-12 rounded-full border object-cover" />
                        ) : <div className="text-3xl">🐾</div>}
                        <div className="flex-1">
                          <p className="font-semibold">{pet.name}<span className="ml-2 text-sm font-normal text-muted-foreground">({pet.breed ?? pet.species}{pet.weightKg ? ` - ${(pet.weightKg * 2.205).toFixed(2)}Lb` : ''})</span></p>
                        </div>
                        <button onClick={() => setEditPet(pet)} className="text-xs text-primary hover:underline">Edit</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 border-b p-4 text-sm">
                        <div><span className="text-muted-foreground">Behavior: </span>{pet.tags.join(', ') || 'N/A'}</div>
                        <div><span className="text-muted-foreground">Fixed: </span>{pet.isFixed ? 'Fixed' : 'Intact'}</div>
                        <div><span className="text-muted-foreground">Hair length: </span>{pet.hairLength || 'N/A'}</div>
                        <div><span className="text-muted-foreground">Gender: </span>{pet.gender || 'N/A'}</div>
                        {pet.allergies && <div className="col-span-2"><span className="text-orange-600">⚠ Allergies: </span>{pet.allergies}</div>}
                        {pet.medicalNotes && <div className="col-span-2"><span className="text-amber-700">⚕ Medical: </span>{pet.medicalNotes}</div>}
                        {pet.groomNotes && <div className="col-span-2"><span className="text-muted-foreground">✂ Groom: </span>{pet.groomNotes}</div>}
                      </div>
                      <div className="p-4">
                        <button onClick={() => setShowVax(showVax === pet.id ? null : pet.id)} className="text-xs text-primary hover:underline">
                          {pet.vaccinations.length} vaccination record{pet.vaccinations.length !== 1 ? 's' : ''} {showVax === pet.id ? '▲' : '▼'}
                        </button>
                        {showVax === pet.id && <div className="mt-2"><VaccinationTab petId={pet.id} /></div>}
                      </div>
                    </div>
                  ))}
                  {customer.pets.length === 0 && <p className="text-sm text-muted-foreground">No pets. Click + Pet to add one.</p>}
                </div>
              </div>
            )}

            {bottomTab === 'preference' && (
              <div className="max-w-lg space-y-5 p-5">
                {savingPrefs && <p className="text-xs text-primary">Saving…</p>}
                <div className="rounded-xl border p-4">
                  <p className="mb-2 text-sm">How to send auto messages to this client</p>
                  <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={displayPrefs.autoMessageMode ?? 'FOLLOW_RULES'} onChange={e => prefChange('autoMessageMode', e.target.value)}>
                    <option value="FOLLOW_RULES">Follow the rules in Settings→Auto Message</option>
                    <option value="NEVER">Never send auto messages</option>
                    <option value="ALWAYS">Always send auto messages</option>
                  </select>
                </div>
                {[
                  { key: 'blockMessages' as const, label: 'Block Message' },
                  { key: 'blockOnlineBooking' as const, label: 'Block book online' },
                  { key: 'optOutMarketingSms' as const, label: 'Opt out of marketing SMS' },
                  { key: 'optOutMarketingEmail' as const, label: 'Opt out of marketing email' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between"><span className="text-sm">{label}</span><Toggle on={!!(displayPrefs[key] ?? false)} onChange={v => prefChange(key, v)} /></div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-sm">Booking frequency</span>
                  <div className="flex gap-2">
                    <select className="w-16 rounded-lg border bg-white px-2 py-1 text-sm" value={displayPrefs.bookingFreqValue ?? 1} onChange={e => prefChange('bookingFreqValue', Number(e.target.value))}>{[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n}</option>)}</select>
                    <select className="rounded-lg border bg-white px-2 py-1 text-sm" value={displayPrefs.bookingFreqUnit ?? 'MONTHS'} onChange={e => prefChange('bookingFreqUnit', e.target.value)}><option value="WEEKS">Weeks</option><option value="MONTHS">Months</option></select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Preferred groomer</span>
                  <select className="rounded-lg border bg-white px-3 py-1.5 text-sm" value={displayPrefs.preferredGroomerId ?? ''} onChange={e => prefChange('preferredGroomerId', e.target.value || null)}>
                    <option value="">Not set</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <span className="text-sm">Mark as inactive</span>
                  <div className="flex items-center gap-2">
                    <Toggle on={customer.status !== 'ACTIVE'} onChange={v => prefChange('status', v ? 'INACTIVE' : 'ACTIVE')} />
                    <span className="text-xs text-muted-foreground">{customer.status === 'ACTIVE' ? 'active' : customer.status.toLowerCase()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment card + Agreements */}
          <div className="grid grid-cols-2 gap-4 border-t p-5">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-bold">Payment Card · Stripe</h2>
              {paymentMethods.length > 0 ? (
                <div className="space-y-2">
                  {paymentMethods.map(pm => (
                    <div key={pm.id} className="flex items-center gap-3 text-sm"><span>💳</span><span className="font-medium text-amber-600">Ends in {pm.last4}</span><span className="text-muted-foreground">Exp: {pm.expMonth}/{pm.expYear}</span></div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No card on file</p>}
              <div className="mt-4 flex gap-2">
                <button onClick={() => setCardModal(true)} className="rounded-md bg-amber-accent px-3 py-1.5 text-xs font-bold text-neutral-900 hover:opacity-90">+ Card</button>
                <button onClick={() => setPaymentLinkModal(true)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Generate payment link</button>
              </div>
            </div>
            <ConsentAgreements customerId={id} />
          </div>
        </main>
      </div>

      {editCustomer && <ClientFormModal customer={customer} onClose={() => setEditCustomer(false)} onSaved={() => { setEditCustomer(false); load(); }} />}
      {addPet && <PetFormModal customerId={id} pet={null} onClose={() => setAddPet(false)} onSaved={() => { setAddPet(false); load(); }} />}
      {editPet && <PetFormModal customerId={id} pet={editPet} onClose={() => setEditPet(null)} onSaved={() => { setEditPet(null); load(); }} />}
      {paymentLinkModal && <PaymentLinkModal customerId={id} onClose={() => setPaymentLinkModal(false)} />}
      {creditModal && <CreditModal customerId={id} current={customer.statementCreditCents} onClose={() => setCreditModal(false)} onSaved={() => { setCreditModal(false); load(); }} />}
      {cardModal && <AddCardModal customerId={id} onClose={() => setCardModal(false)} onSaved={() => { setCardModal(false); load(); }} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LoyaltyTab({ customerId, customer }: { customerId: string; customer: Customer }) {
  const [data, setData] = useState<{ points: number; ledger: { id: string; points: number; reason: string; createdAt: string }[] } | null>(null);
  useEffect(() => { apiFetch<typeof data>(`/memberships/customer/${customerId}/loyalty`).then(setData).catch(() => null); }, [customerId]);
  return (
    <div className="space-y-4 p-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Loyalty points</p><p className="text-3xl font-bold">{(data?.points ?? customer.loyaltyPoints).toLocaleString()}</p></div>
        {customer.memberships.length > 0 && (
          <div className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">Membership</p><p className="font-bold">{customer.memberships[0].plan.name}</p><p className="text-sm text-muted-foreground">${(customer.memberships[0].plan.monthlyFeeCents / 100).toFixed(0)}/mo</p></div>
        )}
      </div>
      {data?.ledger && data.ledger.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Reason</th><th className="px-4 py-2 text-right">Points</th></tr></thead>
            <tbody className="divide-y">
              {data.ledger.slice(0, 10).map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleDateString('en-CA')}</td>
                  <td className="px-4 py-2">{l.reason}</td>
                  <td className={`px-4 py-2 text-right font-medium ${l.points < 0 ? 'text-red-500' : 'text-green-600'}`}>{l.points > 0 ? '+' : ''}{l.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConsentAgreements({ customerId }: { customerId: string }) {
  const [forms, setForms] = useState<ConsentForm[]>([]);
  useEffect(() => {
    apiFetch<{ id: string }[]>(`/customers/${customerId}/appointments?filter=all`)
      .then(bookings => { if (!bookings.length) return; return apiFetch<{ forms: ConsentForm[] }>(`/public/sign/${bookings[0].id}`); })
      .then(session => { if (session) setForms(session.forms); })
      .catch(() => null);
  }, [customerId]);

  if (!forms.length) return (
    <div className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold">Agreements</h2><p className="text-sm text-muted-foreground">No agreements on file.</p></div>
  );
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-bold">Agreements</h2>
      <div className="space-y-3">
        {forms.map(f => (
          <div key={f.formType} className="flex items-center justify-between text-sm">
            <div><p className="font-medium">{f.title}</p>{f.signed ? <p className="text-xs text-green-600">signed</p> : <p className="text-xs text-muted-foreground">not signed</p>}</div>
            <button
              onClick={async () => {
                const bookings = await apiFetch<{ id: string }[]>(`/customers/${customerId}/appointments?filter=upcoming`);
                if (!bookings.length) { alert('No upcoming booking to send a signing link for.'); return; }
                const link = `${window.location.origin.replace('4000', '3001')}/sign/${bookings[0].id}`;
                navigator.clipboard.writeText(link);
                alert(`Signing link copied:\n${link}`);
              }}
              className="rounded-md bg-amber-accent px-2 py-1 text-xs font-bold text-neutral-900 hover:opacity-90">Sign Agreement</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentLinkModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  async function generate() {
    setLoading(true);
    const res = await apiFetch<{ url: string }>(`/pos/customers/${customerId}/payment-link`, { method: 'POST', body: JSON.stringify({ amountCents: Math.round(parseFloat(amount) * 100), description: desc }) });
    setLink(res.url ?? ''); setLoading(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[380px] space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Generate payment link</h2>
        <div><label className="mb-1 block text-xs text-muted-foreground">Amount (CAD) *</label><input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. 25.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-muted-foreground">Description</label><input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. No-show fee" value={desc} onChange={e => setDesc(e.target.value)} /></div>
        {link && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="mb-1 text-xs font-medium text-green-700">✓ Payment link created</p>
            <a href={link} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-600 hover:underline">{link}</a>
            <button onClick={() => navigator.clipboard.writeText(link)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Copy link</button>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={generate} disabled={!amount || loading} className="flex-1 rounded-lg bg-amber-accent py-2 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-50">{loading ? 'Generating…' : 'Generate'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

const TEST_CARDS = [
  { token: 'pm_card_visa', label: 'Visa', number: '4242 4242 4242 4242', desc: 'Succeeds' },
  { token: 'pm_card_mastercard', label: 'Mastercard', number: '5555 5555 5555 4444', desc: 'Succeeds' },
  { token: 'pm_card_amex', label: 'Amex', number: '3782 822463 10005', desc: 'Succeeds' },
  { token: 'pm_card_visa_debit', label: 'Visa debit', number: '4000 0566 5566 5556', desc: 'Succeeds' },
  { token: 'pm_card_chargeDeclined', label: 'Declined card', number: '4000 0000 0000 0002', desc: 'Always declines' },
];

function AddCardModal({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [token, setToken] = useState('pm_card_visa');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setSaving(true); setError('');
    try { await apiFetch(`/pos/customers/${customerId}/attach-test-card`, { method: 'POST', body: JSON.stringify({ token }) }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to attach card'); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Add card on file</h2>
        <p className="text-xs text-muted-foreground">Test mode — pick a Stripe test card. In production this uses Stripe.js Elements to securely tokenize a real card.</p>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          {TEST_CARDS.map(c => (
            <label key={c.token} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${token === c.token ? 'border-primary bg-primary/5' : 'hover:bg-secondary'}`}>
              <input type="radio" name="card" checked={token === c.token} onChange={() => setToken(c.token)} />
              <div className="flex-1"><p className="text-sm font-medium">{c.label} <span className="font-normal text-muted-foreground">·· {c.number.slice(-4)}</span></p><p className="text-xs text-muted-foreground">{c.number} — {c.desc}</p></div>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-amber-accent py-2 text-sm font-bold text-neutral-900 hover:opacity-90 disabled:opacity-50">{saving ? 'Attaching…' : 'Add card'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CreditModal({ customerId, current, onClose, onSaved }: { customerId: string; current: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!amount) return;
    setSaving(true);
    const cents = Math.round(parseFloat(amount) * 100) * (mode === 'deduct' ? -1 : 1);
    await apiFetch(`/customers/${customerId}/credit`, { method: 'POST', body: JSON.stringify({ deltaCents: cents }) });
    setSaving(false); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[360px] space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Manage statement credit</h2>
        <p className="text-sm text-muted-foreground">Current balance: <span className="font-semibold text-primary">${(current / 100).toFixed(2)}</span></p>
        <div className="flex gap-2">
          <button onClick={() => setMode('add')} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${mode === 'add' ? 'border-green-300 bg-green-50 text-green-700' : ''}`}>Add credit</button>
          <button onClick={() => setMode('deduct')} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${mode === 'deduct' ? 'border-red-300 bg-red-50 text-red-600' : ''}`}>Deduct</button>
        </div>
        <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Amount (CAD)" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={save} disabled={!amount || saving} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : `${mode === 'add' ? 'Add' : 'Deduct'} credit`}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
