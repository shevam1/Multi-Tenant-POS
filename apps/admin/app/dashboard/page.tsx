'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Booking {
  id: string;
  status: string;
  scheduledStart: string;
  customer: { fullName: string; tags: string[] };
  pet: { name: string; breed: string | null } | null;
  lineItems: { description: string }[];
  notes: string | null;
}

interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
  storeId: string | null;
  fullName: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  READY: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-neutral-100 text-neutral-500',
  CANCELLED: 'bg-red-100 text-red-500',
  NO_SHOW: 'bg-orange-100 text-orange-700',
  LATE: 'bg-amber-100 text-amber-700',
};

const QUEUE_STAGES = ['CHECKED_IN', 'IN_PROGRESS', 'READY'] as const;
const STAGE_LABELS: Record<string, string> = {
  CHECK_IN: 'Check-in', BEFORE_PHOTOS: 'Before photos', BATH: 'Bath', DRYING: 'Drying',
  STYLING: 'Styling', NAILS: 'Nails', QUALITY_CHECK: 'QC', AFTER_PHOTOS: 'After photos', READY: 'Ready',
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [storeId, setStoreId] = useState('');
  const [newBookingAlert, setNewBookingAlert] = useState(false);

  const fetchMe = useCallback(async () => {
    if (!getToken()) { router.push('/login'); return; }
    const me = await apiFetch<AuthUser>('/auth/me').catch(() => null);
    if (!me) { router.push('/login'); return; }
    setUser(me);
    return me;
  }, [router]);

  const fetchBookings = useCallback(async (sid: string) => {
    if (!sid) return;
    const data = await apiFetch<Booking[]>(`/bookings?storeId=${sid}&date=${today}`).catch(() => []);
    setBookings(data);
  }, [today]);

  useEffect(() => {
    fetchMe().then(me => {
      if (me?.storeId) {
        setStoreId(me.storeId);
        fetchBookings(me.storeId);
      }
    });
  }, [fetchMe, fetchBookings]);

  useEffect(() => {
    if (!storeId || !user?.tenantId) return;
    const socket = getSocket(storeId, user.tenantId);
    socket.on('booking:new', () => {
      setNewBookingAlert(true);
      fetchBookings(storeId);
    });
    socket.on('booking:status', () => fetchBookings(storeId));
    socket.on('queue:update', () => fetchBookings(storeId));
    return () => { socket.off('booking:new'); socket.off('booking:status'); socket.off('queue:update'); };
  }, [storeId, user, fetchBookings]);

  async function approve(id: string) {
    await apiFetch(`/bookings/${id}/approve`, { method: 'PATCH' });
    fetchBookings(storeId);
  }

  const pending = bookings.filter(b => b.status === 'PENDING');
  const active = bookings.filter(b => QUEUE_STAGES.includes(b.status as typeof QUEUE_STAGES[number]));
  const today_count = bookings.length;
  const completed = bookings.filter(b => b.status === 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-brand">OmniPOS</span>
          <span className="ml-2 text-sm text-neutral-500">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-neutral-600">{user.fullName} · {user.role.replace(/_/g,' ')}</span>}
          <a href="/scheduling" className="rounded-md bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200">
            Schedule
          </a>
          <a href="/timeclock" className="rounded-md bg-teal-100 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-200">
            Time Clock
          </a>
          <a href="/clients" className="rounded-md bg-orange-100 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-200">
            Clients
          </a>
          <a href="/analytics" className="rounded-md bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200">
            HQ Analytics
          </a>
          <a href="/memberships" className="rounded-md bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200">
            Memberships
          </a>
          <a href="/forms" className="rounded-md bg-pink-100 px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-200">
            Forms
          </a>
          <a href="/compliance" className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200">
            Vaccine report
          </a>
          <a href="/groomer" className="rounded-md bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200">
            Groomer PWA
          </a>
          <button onClick={() => { localStorage.clear(); router.push('/login'); }}
            className="text-xs text-neutral-400 hover:text-neutral-600">Sign out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Today's bookings", value: today_count },
            { label: 'Pending approval', value: pending.length },
            { label: 'Active queue', value: active.length },
            { label: 'Completed', value: completed },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-white p-5 shadow-sm">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">{s.label}</p>
              <p className="mt-1 text-3xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* New booking alert */}
        {newBookingAlert && (
          <div className="flex items-center justify-between rounded-lg bg-brand/10 border border-brand/20 px-4 py-3">
            <p className="text-sm font-medium text-brand">🔔 New booking request received via website</p>
            <button onClick={() => setNewBookingAlert(false)} className="text-xs text-brand/60 hover:text-brand">Dismiss</button>
          </div>
        )}

        {/* Pending approval queue */}
        {pending.length > 0 && (
          <section>
            <h2 className="mb-3 font-semibold text-lg">Pending approval</h2>
            <div className="space-y-2">
              {pending.map(b => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm">
                  <div>
                    <span className="font-medium">{b.customer.fullName}</span>
                    {b.pet && <span className="ml-2 text-neutral-500 text-sm">· {b.pet.name} ({b.pet.breed ?? 'mixed'})</span>}
                    <div className="mt-0.5 flex gap-1">
                      {b.customer.tags.map(t => (
                        <span key={t} className="rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-500">{new Date(b.scheduledStart).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => approve(b.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                      Approve
                    </button>
                    <a href={`/bookings/${b.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">
                      View
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live queue board */}
        <section>
          <h2 className="mb-3 font-semibold text-lg">Live queue board</h2>
          <div className="grid grid-cols-3 gap-4">
            {QUEUE_STAGES.map(stage => (
              <div key={stage} className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {stage.replace(/_/g, ' ')}
                </p>
                <div className="space-y-2">
                  {active.filter(b => b.status === stage).map(b => (
                    <div key={b.id} className="rounded-lg border p-3 hover:bg-neutral-50">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{b.pet?.name ?? '—'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                          {b.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">{b.customer.fullName}</p>
                    </div>
                  ))}
                  {active.filter(b => b.status === stage).length === 0 && (
                    <p className="text-xs text-neutral-400 text-center py-4">Empty</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Today's full schedule */}
        <section>
          <h2 className="mb-3 font-semibold text-lg">Today&apos;s schedule — {today}</h2>
          {bookings.length === 0
            ? <p className="text-sm text-neutral-500">No bookings today (or no store assigned to your account).</p>
            : (
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500 tracking-wide">
                    <tr>
                      {['Time', 'Customer', 'Pet', 'Services', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bookings.map(b => (
                      <tr key={b.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {new Date(b.scheduledStart).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{b.customer.fullName}</div>
                          <div className="flex gap-1 mt-0.5">
                            {b.customer.tags.map(t => <span key={t} className="rounded bg-pink-100 px-1 py-0.5 text-xs text-pink-700">{t}</span>)}
                          </div>
                        </td>
                        <td className="px-4 py-3">{b.pet ? `${b.pet.name} (${b.pet.breed ?? 'mixed'})` : '—'}</td>
                        <td className="px-4 py-3 text-neutral-500">{b.lineItems.map(l => l.description).join(', ') || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                            {b.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <a href={`/bookings/${b.id}`} className="text-brand text-xs hover:underline">View</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </section>
      </main>
    </div>
  );
}
