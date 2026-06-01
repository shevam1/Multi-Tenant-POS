'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Groomer { id: string; fullName: string; role: string }
interface CalBooking {
  id: string; status: string; scheduledStart: string; scheduledEnd: string | null;
  assignedGroomerId: string | null; flags: string[]; source: string;
  customer: { id: string; fullName: string };
  pet: { id: string; name: string; breed: string | null } | null;
  lineItems: { description: string; unitPriceCents: number }[];
}

const DAY_START_H = 8;
const DAY_END_H = 19;
const SLOT_MIN = 30;
const PX_PER_MIN = 1.1;
const DAY_MINUTES = (DAY_END_H - DAY_START_H) * 60;

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 border-yellow-300 text-yellow-900',
  CONFIRMED: 'bg-green-100 border-green-300 text-green-900',
  CHECKED_IN: 'bg-indigo-100 border-indigo-300 text-indigo-900',
  IN_PROGRESS: 'bg-purple-100 border-purple-300 text-purple-900',
  READY: 'bg-teal-100 border-teal-300 text-teal-900',
  COMPLETED: 'bg-neutral-100 border-neutral-300 text-neutral-500',
  NO_SHOW: 'bg-orange-100 border-orange-300 text-orange-700',
};
const FLAG_META: Record<string, { label: string; color: string }> = {
  AWAITING_VACCINATION: { label: 'Awaiting vaccination', color: 'bg-amber-400' },
  UNREACHABLE: { label: 'Client unreachable', color: 'bg-red-400' },
  DEPOSIT_DUE: { label: 'Deposit due', color: 'bg-orange-400' },
  VIP: { label: 'VIP', color: 'bg-violet-400' },
  FIRST_VISIT: { label: 'First visit', color: 'bg-blue-400' },
  SPECIAL_HANDLING: { label: 'Special handling', color: 'bg-pink-400' },
};

function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function minutesFromDayStart(isoStr: string) { const d = new Date(isoStr); return (d.getHours() - DAY_START_H) * 60 + d.getMinutes(); }
function durationMin(b: CalBooking) {
  if (b.scheduledEnd) return Math.max(30, (new Date(b.scheduledEnd).getTime() - new Date(b.scheduledStart).getTime()) / 60000);
  return 60;
}

export default function CalendarPage() {
  const router = useRouter();
  const { storeId } = useShell();
  const [groomers, setGroomers] = useState<Groomer[]>([]);
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [flagMenu, setFlagMenu] = useState<string | null>(null);

  const loadBoard = useCallback(async (sid: string, d: Date) => {
    if (!sid) { setLoading(false); return; }
    const ws = iso(startOfWeek(d));
    const [g, b] = await Promise.all([
      apiFetch<Groomer[]>(`/scheduling/staff?storeId=${sid}`).catch(() => []),
      apiFetch<CalBooking[]>(`/bookings/calendar?storeId=${sid}&weekStart=${ws}`).catch(() => []),
    ]);
    setGroomers(g.filter(u => u.role === 'GROOMER' || u.role === 'STORE_MANAGER'));
    setBookings(b);
    setLoading(false);
  }, []);

  useEffect(() => { loadBoard(storeId, day); }, [storeId, day, loadBoard]);

  const dayBookings = bookings.filter(b => iso(new Date(b.scheduledStart)) === iso(day));
  const columns = [...groomers.map(g => ({ id: g.id, name: g.fullName.split(' ')[0] })), { id: '__unassigned', name: 'Unassigned' }];

  async function onDrop(groomerId: string, slotMin: number) {
    if (!dragId) return;
    const booking = dayBookings.find(b => b.id === dragId);
    setDragId(null);
    if (!booking) return;
    const newStart = new Date(day);
    newStart.setHours(DAY_START_H, 0, 0, 0);
    newStart.setMinutes(newStart.getMinutes() + slotMin);
    const newEnd = new Date(newStart.getTime() + durationMin(booking) * 60000);
    try {
      await apiFetch(`/bookings/${booking.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduledStart: newStart.toISOString(), scheduledEnd: newEnd.toISOString(),
          assignedGroomerId: groomerId === '__unassigned' ? null : groomerId,
        }),
      });
      loadBoard(storeId, day);
    } catch (e) { alert(e instanceof Error ? e.message : 'Reschedule failed'); }
  }

  async function toggleFlag(bookingId: string, flag: string) {
    const b = dayBookings.find(x => x.id === bookingId);
    if (!b) return;
    const flags = b.flags.includes(flag) ? b.flags.filter(f => f !== flag) : [...b.flags, flag];
    await apiFetch(`/bookings/${bookingId}/flags`, { method: 'PATCH', body: JSON.stringify({ flags }) });
    setFlagMenu(null);
    loadBoard(storeId, day);
  }

  const hours = Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
            <button onClick={() => setDay(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })} className="rounded px-2 py-1 text-sm hover:bg-secondary">‹</button>
            <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }} className="rounded px-3 py-1 text-sm font-medium hover:bg-secondary">Today</button>
            <button onClick={() => setDay(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })} className="rounded px-2 py-1 text-sm hover:bg-secondary">›</button>
          </div>
          <span className="rounded-lg bg-amber-accent/15 px-3 py-1.5 text-sm font-semibold text-amber-700">
            {day.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <span className="text-xs text-muted-foreground">{groomers.length} groomers · {dayBookings.length} appts</span>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Card className="overflow-x-auto p-0">
          <div className="flex min-w-max">
            <div className="sticky left-0 z-10 w-16 shrink-0 border-r bg-white">
              <div className="h-10 border-b" />
              <div className="relative" style={{ height: DAY_MINUTES * PX_PER_MIN }}>
                {hours.map(h => (
                  <div key={h} className="absolute left-0 right-0 pr-2 text-right text-xs text-muted-foreground" style={{ top: (h - DAY_START_H) * 60 * PX_PER_MIN - 6 }}>
                    {h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}
                  </div>
                ))}
              </div>
            </div>

            {columns.map(col => {
              const colBookings = dayBookings.filter(b => col.id === '__unassigned' ? !b.assignedGroomerId : b.assignedGroomerId === col.id);
              return (
                <div key={col.id} className="w-48 shrink-0 border-r">
                  <div className="sticky top-0 flex h-10 items-center justify-center border-b bg-white text-sm font-medium">
                    {col.name} <span className="ml-1 text-xs text-muted-foreground">({colBookings.length})</span>
                  </div>
                  <div className="relative bg-white" style={{ height: DAY_MINUTES * PX_PER_MIN }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={e => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const offsetMin = (e.clientY - rect.top) / PX_PER_MIN;
                      const slotMin = Math.max(0, Math.round(offsetMin / SLOT_MIN) * SLOT_MIN);
                      onDrop(col.id, slotMin);
                    }}>
                    {hours.map(h => (
                      <div key={h} className="pointer-events-none absolute left-0 right-0 border-b border-neutral-100" style={{ top: (h - DAY_START_H) * 60 * PX_PER_MIN }} />
                    ))}
                    {colBookings.map(b => {
                      const top = Math.max(0, minutesFromDayStart(b.scheduledStart)) * PX_PER_MIN;
                      const height = Math.max(28, durationMin(b) * PX_PER_MIN - 2);
                      return (
                        <div key={b.id} draggable
                          onDragStart={e => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); }}
                          onClick={() => router.push(`/bookings/${b.id}`)}
                          className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded-md border px-2 py-1 shadow-sm hover:shadow-md ${STATUS_COLOR[b.status] ?? 'border-neutral-200 bg-white'}`}
                          style={{ top, height }}>
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate text-xs font-semibold">
                              {new Date(b.scheduledStart).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })} {b.pet?.name ?? b.customer.fullName.split(' ')[0]}
                            </span>
                            <button onClick={e => { e.stopPropagation(); setFlagMenu(flagMenu === b.id ? null : b.id); }} className="shrink-0 text-xs opacity-50 hover:opacity-100">⚑</button>
                          </div>
                          <p className="truncate text-xs opacity-80">{b.lineItems.map(l => l.description).join(', ') || b.customer.fullName}</p>
                          {b.flags.length > 0 && (
                            <div className="mt-0.5 flex gap-0.5">
                              {b.flags.map(f => <span key={f} title={FLAG_META[f]?.label ?? f} className={`h-2 w-2 rounded-full ${FLAG_META[f]?.color ?? 'bg-neutral-400'}`} />)}
                            </div>
                          )}
                          {flagMenu === b.id && (
                            <div onClick={e => e.stopPropagation()} className="absolute left-1 top-7 z-30 w-44 rounded-lg border bg-white p-2 shadow-xl">
                              <p className="mb-1 text-xs font-semibold text-muted-foreground">Status tags</p>
                              {Object.entries(FLAG_META).map(([key, meta]) => (
                                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-secondary">
                                  <input type="checkbox" checked={b.flags.includes(key)} onChange={() => toggleFlag(b.id, key)} />
                                  <span className={`h-2 w-2 rounded-full ${meta.color}`} />
                                  {meta.label}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
