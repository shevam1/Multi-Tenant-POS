'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface HoursRow {
  userId: string;
  fullName: string;
  totalMinutes: number;
  totalHours: number;
  incompleteCount: number;
  hasIncomplete: boolean;
}

interface AuthMe { storeId: string | null; role: string }

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default function HoursReportPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 14); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async (sid: string, f: string, t: string) => {
    if (!sid) return;
    setLoading(true);
    const data = await apiFetch<HoursRow[]>(`/timeclock/report?storeId=${sid}&from=${f}&to=${t}T23:59:59`).catch(() => []);
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(u => {
      if (!u.storeId) { setLoading(false); return; }
      setStoreId(u.storeId);
      fetchReport(u.storeId, from, to);
    });
  }, [router, fetchReport, from, to]);

  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
  const totalIncomplete = rows.reduce((s, r) => s + r.incompleteCount, 0);

  return (
    <div>
      <main className="mx-auto max-w-4xl px-8 py-8 space-y-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Hours Report</h1>
          <span className="ml-auto text-xs text-muted-foreground">Feeds payroll · spec §12</span>
        </div>
        {/* Date range */}
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">From</label>
            <input type="date" className="rounded border px-3 py-1.5 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">To</label>
            <input type="date" className="rounded border px-3 py-1.5 text-sm" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button onClick={() => fetchReport(storeId, from, to)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Run report</button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500 uppercase">Staff</p>
            <p className="mt-1 text-3xl font-bold">{rows.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500 uppercase">Total hours</p>
            <p className="mt-1 text-3xl font-bold">{totalHours.toFixed(1)}</p>
          </div>
          <div className={`rounded-xl border p-5 shadow-sm ${totalIncomplete > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
            <p className="text-xs text-neutral-500 uppercase">Incomplete entries</p>
            <p className={`mt-1 text-3xl font-bold ${totalIncomplete > 0 ? 'text-amber-700' : ''}`}>{totalIncomplete}</p>
          </div>
        </div>

        {/* Table */}
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                <tr>
                  {['Employee', 'Total hours', 'Incomplete', 'Payroll status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r => (
                  <tr key={r.userId} className={r.hasIncomplete ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-3 font-medium">{r.fullName}</td>
                    <td className="px-4 py-3 tabular-nums">{r.totalHours.toFixed(2)} h</td>
                    <td className="px-4 py-3">{r.incompleteCount > 0 ? r.incompleteCount : '—'}</td>
                    <td className="px-4 py-3">
                      {r.hasIncomplete
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⚠ Resolve before payroll</span>
                        : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">✓ Ready</span>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-neutral-400">No time entries in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
