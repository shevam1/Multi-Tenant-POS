'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface ClockStatus {
  clockedIn: boolean;
  since: string | null;
  entryId: string | null;
}

interface TimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  incomplete: boolean;
  user: { id: string; fullName: string };
}

function fmtDuration(fromIso: string, toIso?: string | null): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const mins = Math.floor((to - from) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function TimeclockPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    const [st, hist] = await Promise.all([
      apiFetch<ClockStatus>('/timeclock/status'),
      apiFetch<TimeEntry[]>('/timeclock/history'),
    ]);
    setStatus(st);
    setHistory(hist);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    refresh().finally(() => setLoading(false));
  }, [router, refresh]);

  // Live timer tick while clocked in
  useEffect(() => {
    if (!status?.clockedIn) return;
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [status?.clockedIn]);

  async function toggle() {
    setBusy(true);
    try {
      await apiFetch(status?.clockedIn ? '/timeclock/out' : '/timeclock/in', { method: 'POST' });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Time Clock</h1>
        <a href="/scheduling" className="ml-auto rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">Schedule</a>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        {/* Clock widget */}
        <div className={`rounded-2xl border p-8 text-center shadow-sm ${status?.clockedIn ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
          {status?.clockedIn ? (
            <>
              <p className="text-sm text-green-700 font-medium">● Clocked in</p>
              <p className="mt-2 text-4xl font-bold tabular-nums">{fmtDuration(status.since!)}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Since {new Date(status.since!).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-500">You are clocked out</p>
              <p className="mt-2 text-4xl font-bold text-neutral-300">—</p>
            </>
          )}
          <button onClick={toggle} disabled={busy}
            className={`mt-6 w-full rounded-xl py-4 text-base font-bold text-white transition disabled:opacity-50 ${status?.clockedIn ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
            {busy ? '…' : status?.clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        </div>

        {/* History */}
        <section>
          <h2 className="mb-3 font-semibold">Recent entries</h2>
          {history.length === 0 ? (
            <p className="text-sm text-neutral-400">No time entries yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                  <tr>
                    {['Date', 'In', 'Out', 'Duration', ''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map(e => (
                    <tr key={e.id} className={e.incomplete ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-3">{new Date(e.clockIn).toLocaleDateString('en-CA')}</td>
                      <td className="px-4 py-3">{new Date(e.clockIn).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3">
                        {e.clockOut
                          ? new Date(e.clockOut).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
                          : <span className="text-green-600">Active</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{e.clockOut ? fmtDuration(e.clockIn, e.clockOut) : '—'}</td>
                      <td className="px-4 py-3">
                        {e.incomplete && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⚠ Incomplete</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
