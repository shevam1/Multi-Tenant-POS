'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Groomer { id: string; fullName: string; role: string }
interface Store { id: string; name: string }
interface CalBooking {
  id: string; status: string; scheduledStart: string; scheduledEnd: string | null;
  assignedGroomerId: string | null; flags: string[]; source: string;
  customer: { id: string; fullName: string };
  pet: { id: string; name: string; breed: string | null } | null;
  lineItems: { description: string; unitPriceCents: number }[];
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

// Calendar window
const DAY_START_H = 8;   // 8 AM
const DAY_END_H = 19;    // 7 PM
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

function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; }
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function minutesFromDayStart(isoStr: string) {
  const d = new Date(isoStr);
  return (d.getHours() - DAY_START_H) * 60 + d.getMinutes();
}
function durationMin(b: CalBooking) {
  if (b.scheduledEnd) return Math.max(30, (new Date(b.scheduledEnd).getTime() - new Date(b.scheduledStart).getTime()) / 60000);
  return 60;
}

export default function CalendarPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [groomers, setGroomers] = useState<Groomer[]>([]);
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [flagMenu, setFlagMenu] = useState<string | null>(null);

  const loadBoard = useCallback(async (sid: string, d: Date) => {
    if (!sid) return;
    const ws = iso(startOfWeek(d));
    const [g, b] = await Promise.all([
      apiFetch<Groomer[]>(`/scheduling/staff?storeId=${sid}`).catch(() => []),
      apiFetch<CalBooking[]>(`/bookings/calendar?storeId=${sid}&weekStart=${ws}`).catch(() => []),
    ]);
    setGroomers(g.filter(u => u.role === 'GROOMER' || u.role === 'STORE_MANAGER'));
    setBookings(b);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      const isHQ = u.role === 'FRANCHISE_HQ_ADMIN';
      let sid = u.storeId ?? '';
      if (isHQ) {
        const s = await apiFetch<Store[]>('/customers/stores').catch(() => []);
        setStores(s);
        sid = s[0]?.id ?? '';
      }
      setStoreId(sid);
      await loadBoard(sid, day);
      setLoading(false);
    }).catch(() => router.push('/login'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function changeDay(deltaDays: number) {
    const d = new Date(day); d.setDate(d.getDate() + deltaDays);
    setDay(d); loadBoard(storeId, d);
  }
  function changeStore(sid: string) { setStoreId(sid); loadBoard(sid, day); }

  // Bookings for the selected day
  const dayBookings = bookings.filter(b => iso(new Date(b.scheduledStart)) === iso(day));
  const columns = [...groomers.map(g => ({ id: g.id, name: g.fullName.split(' ')[0] })), { id: '__unassigned', name: 'Unassigned' }];

  async function onDrop(groomerId: string, slotMin: number) {
    if (!dragId) return;
    const booking = dayBookings.find(b => b.id === dragId);
    setDragId(null);
    if (!booking) return;
    // Compute new start time from slot
    const newStart = new Date(day);
    newStart.setHours(DAY_START_H, 0, 0, 0);
    newStart.setMinutes(newStart.getMinutes() + slotMin);
    const dur = durationMin(booking);
    const newEnd = new Date(newStart.getTime() + dur * 60000);
    try {
      await apiFetch(`/bookings/${booking.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduledStart: newStart.toISOString(),
          scheduledEnd: newEnd.toISOString(),
          assignedGroomerId: groomerId === '__unassigned' ? null : groomerId,
        }),
      });
      loadBoard(storeId, day);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reschedule failed');
    }
  }

  async function toggleFlag(bookingId: string, flag: string) {
    const b = dayBookings.find(x => x.id === bookingId);
    if (!b) return;
    const flags = b.flags.includes(flag) ? b.flags.filter(f => f !== flag) : [...b.flags, flag];
    await apiFetch(`/bookings/${bookingId}/flags`, { method: 'PATCH', body: JSON.stringify({ flags }) });
    setFlagMenu(null);
    loadBoard(storeId, day);
  }

  // Hour gridlines
  const hours = Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i);
  const slots = Array.from({ length: DAY_MINUTES / SLOT_MIN }, (_, i) => i * SLOT_MIN);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Calendar</h1>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => changeDay(-1)} className="rounded border px-2 py-1 text-sm hover:bg-neutral-50">‹</button>
          <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDay(d); loadBoard(storeId, d); }}
            className="rounded border px-3 py-1 text-sm hover:bg-neutral-50">Today</button>
          <button onClick={() => changeDay(1)} className="rounded border px-2 py-1 text-sm hover:bg-neutral-50">›</button>
          <span className="ml-2 text-sm font-medium">{day.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {me?.role === 'FRANCHISE_HQ_ADMIN' && stores.length > 0 && (
            <select className="rounded-md border px-2 py-1.5 text-xs bg-white" value={storeId} onChange={e => changeStore(e.target.value)}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <span className="text-xs text-neutral-400">{groomers.length} groomers · {dayBookings.length} appts</span>
        </div>
      </header>

      {loading ? <p className="p-8 text-sm text-neutral-400">Loading…</p> : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {/* Time gutter */}
            <div className="w-16 shrink-0 border-r bg-white sticky left-0 z-10">
              <div className="h-10 border-b" />
              <div className="relative" style={{ height: DAY_MINUTES * PX_PER_MIN }}>
                {hours.map(h => (
                  <div key={h} className="absolute left-0 right-0 text-right pr-2 text-xs text-neutral-400"
                    style={{ top: (h - DAY_START_H) * 60 * PX_PER_MIN - 6 }}>
                    {h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}
                  </div>
                ))}
              </div>
            </div>

            {/* Groomer columns */}
            {columns.map(col => {
              const colBookings = dayBookings.filter(b =>
                col.id === '__unassigned' ? !b.assignedGroomerId : b.assignedGroomerId === col.id);
              return (
                <div key={col.id} className="w-48 shrink-0 border-r">
                  <div className="h-10 border-b bg-white flex items-center justify-center text-sm font-medium sticky top-0">
                    {col.name} <span className="ml-1 text-xs text-neutral-400">({colBookings.length})</span>
                  </div>
                  <div className="relative bg-white" style={{ height: DAY_MINUTES * PX_PER_MIN }}>
                    {/* Hour gridlines */}
                    {hours.map(h => (
                      <div key={h} className="absolute left-0 right-0 border-b border-neutral-100"
                        style={{ top: (h - DAY_START_H) * 60 * PX_PER_MIN }} />
                    ))}
                    {/* Drop slots */}
                    {slots.map(slotMin => (
                      <div key={slotMin}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => onDrop(col.id, slotMin)}
                        className="absolute left-0 right-0 hover:bg-brand/5"
                        style={{ top: slotMin * PX_PER_MIN, height: SLOT_MIN * PX_PER_MIN }} />
                    ))}
                    {/* Appointment cards */}
                    {colBookings.map(b => {
                      const top = Math.max(0, minutesFromDayStart(b.scheduledStart)) * PX_PER_MIN;
                      const height = Math.max(28, durationMin(b) * PX_PER_MIN - 2);
                      return (
                        <div key={b.id} draggable
                          onDragStart={() => setDragId(b.id)}
                          onClick={() => router.push(`/bookings/${b.id}`)}
                          className={`absolute left-1 right-1 rounded-md border px-2 py-1 cursor-grab overflow-hidden shadow-sm hover:shadow-md ${STATUS_COLOR[b.status] ?? 'bg-white border-neutral-200'}`}
                          style={{ top, height }}>
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-semibold truncate">
                              {new Date(b.scheduledStart).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })} {b.pet?.name ?? b.customer.fullName.split(' ')[0]}
                            </span>
                            <button onClick={e => { e.stopPropagation(); setFlagMenu(flagMenu === b.id ? null : b.id); }}
                              className="text-xs opacity-50 hover:opacity-100 shrink-0">⚑</button>
                          </div>
                          <p className="text-xs truncate opacity-80">{b.lineItems.map(l => l.description).join(', ') || b.customer.fullName}</p>
                          {/* Flag dots */}
                          {b.flags.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {b.flags.map(f => (
                                <span key={f} title={FLAG_META[f]?.label ?? f}
                                  className={`h-2 w-2 rounded-full ${FLAG_META[f]?.color ?? 'bg-neutral-400'}`} />
                              ))}
                            </div>
                          )}
                          {/* Flag menu */}
                          {flagMenu === b.id && (
                            <div onClick={e => e.stopPropagation()}
                              className="absolute left-1 top-7 z-30 w-44 rounded-lg border bg-white p-2 shadow-xl">
                              <p className="text-xs font-semibold text-neutral-400 mb-1">Status tags</p>
                              {Object.entries(FLAG_META).map(([key, meta]) => (
                                <label key={key} className="flex items-center gap-2 py-0.5 text-xs cursor-pointer hover:bg-neutral-50 rounded px-1">
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
        </div>
      )}
    </div>
  );
}
