'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Booking {
  id: string;
  status: string;
  scheduledStart: string;
  customer: { fullName: string; tags: string[] };
  pet: { name: string; breed: string | null } | null;
  lineItems: { description: string }[];
  notes: string | null;
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

const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

export default function DashboardPage() {
  const { me, storeId } = useShell();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [newBookingAlert, setNewBookingAlert] = useState(false);

  const fetchBookings = useCallback(async (sid: string) => {
    if (!sid) return;
    setBookings(await apiFetch<Booking[]>(`/bookings?storeId=${sid}&date=${today}`).catch(() => []));
  }, [today]);

  useEffect(() => { fetchBookings(storeId); }, [storeId, fetchBookings]);

  useEffect(() => {
    if (!storeId || !me.tenantId) return;
    const socket = getSocket(storeId, me.tenantId);
    socket.on('booking:new', () => { setNewBookingAlert(true); fetchBookings(storeId); });
    socket.on('booking:status', () => fetchBookings(storeId));
    socket.on('queue:update', () => fetchBookings(storeId));
    return () => { socket.off('booking:new'); socket.off('booking:status'); socket.off('queue:update'); };
  }, [storeId, me.tenantId, fetchBookings]);

  async function approve(id: string) {
    await apiFetch(`/bookings/${id}/approve`, { method: 'PATCH' });
    fetchBookings(storeId);
  }

  const pending = bookings.filter(b => b.status === 'PENDING');
  const active = bookings.filter(b => QUEUE_STAGES.includes(b.status as (typeof QUEUE_STAGES)[number]));
  const stats = [
    { label: "Today's bookings", value: bookings.length },
    { label: 'Pending approval', value: pending.length },
    { label: 'Active queue', value: active.length },
    { label: 'Completed', value: bookings.filter(b => b.status === 'COMPLETED').length },
  ];
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })();
  const firstName = me.fullName.split(' ')[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-8 py-8">
      {/* Page heading */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}, {firstName}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening{me.storeName ? ` at ${me.storeName}` : ''} today.</p>
        </div>
        <Button onClick={() => { window.location.href = '/calendar'; }}>+ New Appointment</Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map(s => (
          <Card key={s.label} className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-3xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      {newBookingAlert && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
          <p className="text-sm font-medium text-primary">🔔 New booking request received via website</p>
          <button onClick={() => setNewBookingAlert(false)} className="text-xs text-primary/60 hover:text-primary">Dismiss</button>
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Pending approval</h2>
          <div className="space-y-2">
            {pending.map(b => (
              <Card key={b.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium">{b.customer.fullName}</span>
                  {b.pet && <span className="ml-2 text-sm text-muted-foreground">· {b.pet.name} ({b.pet.breed ?? 'mixed'})</span>}
                  <div className="mt-0.5 flex gap-1">
                    {b.customer.tags.map(t => <span key={t} className="rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700">{t}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{fmtTime(b.scheduledStart)}</span>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => approve(b.id)}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => { window.location.href = `/bookings/${b.id}`; }}>View</Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Live queue board */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Live queue board</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {QUEUE_STAGES.map(stage => (
            <Card key={stage} className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage.replace(/_/g, ' ')}</p>
              <div className="space-y-2">
                {active.filter(b => b.status === stage).map(b => (
                  <div key={b.id} className="rounded-lg border p-3 hover:bg-secondary">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{b.pet?.name ?? '—'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{b.customer.fullName}</p>
                  </div>
                ))}
                {active.filter(b => b.status === stage).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Today's schedule */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Today&apos;s schedule — {today}</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings today (or no store assigned to your account).</p>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>{['Time', 'Customer', 'Pet', 'Services', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-secondary/60">
                    <td className="whitespace-nowrap px-4 py-3">{fmtTime(b.scheduledStart)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.customer.fullName}</div>
                      <div className="mt-0.5 flex gap-1">{b.customer.tags.map(t => <span key={t} className="rounded bg-pink-100 px-1 py-0.5 text-xs text-pink-700">{t}</span>)}</div>
                    </td>
                    <td className="px-4 py-3">{b.pet ? `${b.pet.name} (${b.pet.breed ?? 'mixed'})` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.lineItems.map(l => l.description).join(', ') || '—'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3"><a href={`/bookings/${b.id}`} className="text-xs text-primary hover:underline">View</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
