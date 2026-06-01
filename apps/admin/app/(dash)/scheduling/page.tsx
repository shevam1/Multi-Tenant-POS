'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Shift {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  role: string | null;
  status: string;
  notes: string | null;
  user: { id: string; fullName: string; role: string };
}

interface StaffUser {
  id: string;
  fullName: string;
  role: string;
  storeId: string | null;
}

interface AuthMe {
  userId: string;
  tenantId: string;
  role: string;
  storeId: string | null;
  fullName: string;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-neutral-100 text-neutral-500',
  CANCELLED: 'bg-red-100 text-red-500',
};

export default function SchedulingPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ userId: '', startsAt: '', endsAt: '', role: '' });
  const [error, setError] = useState('');

  const fetchShifts = useCallback(async (storeId: string, ws: string) => {
    const data = await apiFetch<Shift[]>(`/scheduling/shifts?storeId=${storeId}&weekStart=${ws}`);
    setShifts(data);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      if (!u.storeId) { setLoading(false); return; }
      await fetchShifts(u.storeId, weekStart);
      const staffList = await apiFetch<StaffUser[]>(`/scheduling/staff?storeId=${u.storeId}`).catch(() => []);
      setStaff(staffList.length ? staffList : [{ id: u.userId, fullName: u.fullName, role: u.role, storeId: u.storeId }]);
      setLoading(false);
    }).catch(() => router.push('/login'));
  }, [router, weekStart, fetchShifts]);

  async function addShift() {
    if (!me?.storeId) return;
    setError('');
    try {
      await apiFetch('/scheduling/shifts', {
        method: 'POST',
        body: JSON.stringify({
          storeId: me.storeId,
          userId: form.userId || me.userId,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          role: form.role || undefined,
        }),
      });
      await fetchShifts(me.storeId, weekStart);
      setAdding(false);
      setForm({ userId: '', startsAt: '', endsAt: '', role: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create shift');
    }
  }

  async function cancelShift(id: string) {
    if (!me?.storeId) return;
    await apiFetch(`/scheduling/shifts/${id}`, { method: 'DELETE' });
    await fetchShifts(me.storeId, weekStart);
  }

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().slice(0, 10)); }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().slice(0, 10)); }

  const weekDays = DAYS.map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

  // Group shifts by day
  const byDay = weekDays.map(day => ({
    date: day,
    shifts: shifts.filter(s => {
      const sd = new Date(s.startsAt);
      return sd.getFullYear() === day.getFullYear() && sd.getMonth() === day.getMonth() && sd.getDate() === day.getDate();
    }),
  }));

  const isManager = me?.role === 'STORE_MANAGER' || me?.role === 'FRANCHISE_HQ_ADMIN';

  return (
    <div>
      <main className="mx-auto max-w-6xl px-8 py-8 space-y-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Staff Scheduling</h1>
          <div className="flex items-center gap-2">
            <a href="/timeclock" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Time Clock</a>
            <a href="/scheduling/report" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Hours Report</a>
          </div>
        </div>
        {/* Week nav */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevWeek} className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">← Prev</button>
            <span className="font-medium text-sm">
              Week of {new Date(weekStart).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={nextWeek} className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">Next →</button>
          </div>
          {isManager && (
            <button onClick={() => setAdding(true)}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              + Add shift
            </button>
          )}
        </div>

        {/* Add shift form */}
        {adding && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <h2 className="font-semibold">New shift</h2>
            {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Staff member *</label>
                <select className="w-full rounded border px-2.5 py-1.5 text-sm"
                  value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}>
                  <option value="">Select staff…</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName} — {s.role.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Start *</label>
                <input type="datetime-local" className="w-full rounded border px-2.5 py-1.5 text-sm"
                  value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End *</label>
                <input type="datetime-local" className="w-full rounded border px-2.5 py-1.5 text-sm"
                  value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Role label</label>
                <input className="w-full rounded border px-2.5 py-1.5 text-sm" placeholder="Groomer, Reception…"
                  value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addShift} disabled={!form.userId || !form.startsAt || !form.endsAt}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
              <button onClick={() => { setAdding(false); setError(''); }} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Weekly grid */}
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="grid grid-cols-7 gap-2">
            {byDay.map(({ date, shifts: dayShifts }) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={date.toISOString()} className={`rounded-xl border bg-white p-3 min-h-[120px] ${isToday ? 'ring-2 ring-brand/30' : ''}`}>
                  <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-brand' : 'text-neutral-500'}`}>
                    {DAYS[date.getDay()]} {date.getDate()}
                  </p>
                  <div className="space-y-1.5">
                    {dayShifts.map(s => (
                      <div key={s.id} className={`rounded-md px-2 py-1.5 text-xs group relative ${STATUS_COLORS[s.status] ?? 'bg-blue-100 text-blue-700'}`}>
                        <p className="font-medium truncate">{s.user.fullName.split(' ')[0]}</p>
                        <p className="text-xs opacity-70">
                          {new Date(s.startsAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}–
                          {new Date(s.endsAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {s.role && <p className="text-xs opacity-60 truncate">{s.role}</p>}
                        {isManager && s.status !== 'CANCELLED' && (
                          <button onClick={() => cancelShift(s.id)}
                            className="absolute top-1 right-1 hidden group-hover:block text-xs opacity-60 hover:opacity-100">✕</button>
                        )}
                      </div>
                    ))}
                    {dayShifts.length === 0 && (
                      <p className="text-xs text-neutral-300 text-center pt-2">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
