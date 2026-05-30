'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Store { id: string; name: string }
interface Staff { id: string; fullName: string; role: string }
interface Report {
  filters: { from: string; to: string; storeId: string | null; groomerId: string | null; period: string };
  summary: { totalAppts: number; totalPets: number; earnedRevenueCents: number; expectedRevenueCents: number };
  revenueTrend: { bucket: string; revenueCents: number }[];
  revenueByStaff: { name: string; revenueCents: number; appts: number }[];
  commissionByStaff: { name: string; commissionCents: number }[];
  tipsByStaff: { name: string; tipsCents: number }[];
  salesItems: { name: string; count: number; revenueCents: number }[];
  paymentStatus: Record<string, number>;
  salesByMethod: { tender: string; amountCents: number }[];
  bookingsByStatus: Record<string, number>;
  bookingsBySource: Record<string, number>;
  revenueByLocation: { storeName: string; revenueCents: number; appts: number }[];
  rates: { noShowRate: number; cancellationRate: number };
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const fmt = (c: number) => `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// Available report sections (the "graphs & charts selector")
const SECTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'revenue', label: 'Revenue trend' },
  { key: 'revenueByStaff', label: 'Revenue by Staff' },
  { key: 'commissionByStaff', label: 'Commission by Staff' },
  { key: 'tipsByStaff', label: 'Tips by Staff' },
  { key: 'salesItems', label: 'Sales Item' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'salesByMethod', label: 'Sales by method' },
  { key: 'bookingsByStatus', label: 'Bookings by Status' },
  { key: 'bookingsBySource', label: 'Bookings by Source' },
  { key: 'revenueByLocation', label: 'Revenue by Location' },
  { key: 'rates', label: 'No-show / Cancellation rate' },
];

// Horizontal bar chart (dependency-free)
function BarChart({ rows, max, fmtVal, color = 'bg-brand' }: {
  rows: { label: string; value: number }[]; max: number; fmtVal: (v: number) => string; color?: string;
}) {
  const m = Math.max(max, 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-neutral-600">{r.label}</span>
          <div className="flex-1 h-5 rounded bg-neutral-100">
            <div className={`h-5 rounded ${color} flex items-center justify-end px-2`} style={{ width: `${Math.max(4, Math.round(r.value / m * 100))}%` }}>
              <span className="text-xs font-medium text-white whitespace-nowrap">{fmtVal(r.value)}</span>
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-neutral-400">No data.</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm break-inside-avoid">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [groomers, setGroomers] = useState<Staff[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  // Selectors
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [storeId, setStoreId] = useState('');
  const [groomerId, setGroomerId] = useState('');
  const [enabled, setEnabled] = useState<Set<string>>(new Set(SECTIONS.map(s => s.key)));
  const [showSections, setShowSections] = useState(false);

  const load = useCallback(async (params: { from: string; to: string; storeId: string; groomerId: string; period: string }) => {
    setLoading(true);
    const qs = new URLSearchParams({ from: params.from, to: params.to, period: params.period });
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.groomerId) qs.set('groomerId', params.groomerId);
    const r = await apiFetch<Report>(`/analytics/report?${qs}`).catch(() => null);
    setReport(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      if (!u.permissions.includes('analytics.view')) { router.push('/dashboard'); return; }
      const [s, staff] = await Promise.all([
        apiFetch<Store[]>('/customers/stores').catch(() => []),
        apiFetch<Staff[]>('/staff').catch(() => []),
      ]);
      setStores(s);
      setGroomers(staff.filter(u2 => u2.role === 'GROOMER' || u2.role === 'STORE_MANAGER'));
      load({ from, to, storeId: '', groomerId: '', period: 'day' });
    }).catch(() => router.push('/login'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function applyPeriodPreset(p: 'day' | 'week' | 'month' | 'year') {
    setPeriod(p);
    const today = new Date();
    const start = new Date();
    if (p === 'day') start.setDate(today.getDate() - 13);       // ~2 weeks of days
    else if (p === 'week') start.setDate(today.getDate() - 7 * 11); // ~12 weeks
    else if (p === 'month') start.setMonth(today.getMonth() - 11);  // 12 months
    else start.setFullYear(today.getFullYear() - 4);                // 5 years
    const f = isoDate(start), t = isoDate(today);
    setFrom(f); setTo(t);
    load({ from: f, to: t, storeId, groomerId, period: p });
  }

  function refresh() { load({ from, to, storeId, groomerId, period }); }

  function toggleSection(key: string) {
    setEnabled(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const on = (k: string) => enabled.has(k);
  const r = report;

  return (
    <div className="min-h-screen bg-neutral-50">
      <style>{`@media print { .no-print { display: none !important; } .print-full { box-shadow:none !important; border:1px solid #eee !important; } body { background: white; } }`}</style>

      <header className="no-print border-b bg-white px-6 py-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">HQ Analytics</h1>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Period presets */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['day', 'week', 'month', 'year'] as const).map(p => (
              <button key={p} onClick={() => applyPeriodPreset(p)}
                className={`px-3 py-1.5 text-xs font-medium capitalize ${period === p ? 'bg-brand text-white' : 'bg-white hover:bg-neutral-50'}`}>
                {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          {/* Date range */}
          <input type="date" className="rounded border px-2 py-1 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-neutral-400 text-xs">to</span>
          <input type="date" className="rounded border px-2 py-1 text-xs" value={to} onChange={e => setTo(e.target.value)} />
          {/* Location */}
          <select className="rounded border px-2 py-1.5 text-xs bg-white" value={storeId} onChange={e => setStoreId(e.target.value)}>
            <option value="">All locations</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {/* Groomer */}
          <select className="rounded border px-2 py-1.5 text-xs bg-white" value={groomerId} onChange={e => setGroomerId(e.target.value)}>
            <option value="">All groomers</option>
            {groomers.map(g => <option key={g.id} value={g.id}>{g.fullName}</option>)}
          </select>
          {/* Sections */}
          <div className="relative">
            <button onClick={() => setShowSections(s => !s)} className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">
              Sections ({enabled.size})
            </button>
            {showSections && (
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border bg-white p-3 shadow-xl">
                <div className="flex justify-between mb-2">
                  <button onClick={() => setEnabled(new Set(SECTIONS.map(s => s.key)))} className="text-xs text-brand">Select All</button>
                  <button onClick={() => setEnabled(new Set())} className="text-xs text-brand">Deselect All</button>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {SECTIONS.map(s => (
                    <label key={s.key} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                      <input type="checkbox" checked={on(s.key)} onChange={() => toggleSection(s.key)} />
                      {s.label}
                    </label>
                  ))}
                </div>
                <button onClick={() => setShowSections(false)} className="mt-2 w-full rounded-md bg-brand py-1.5 text-xs font-medium text-white">Apply</button>
              </div>
            )}
          </div>
          <button onClick={refresh} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white">Run</button>
          <button onClick={() => window.print()} className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-neutral-900">Download PDF</button>
        </div>
      </header>

      {/* Print header */}
      <div className="hidden print:block px-6 pt-4">
        <h1 className="text-xl font-bold">OmniPOS Analytics Report</h1>
        <p className="text-sm text-neutral-500">
          {from} → {to} · {period} · {storeId ? stores.find(s => s.id === storeId)?.name : 'All locations'} · {groomerId ? groomers.find(g => g.id === groomerId)?.fullName : 'All groomers'}
        </p>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-5">
        {loading && <p className="text-sm text-neutral-400">Loading…</p>}
        {!loading && r && (
          <>
            {/* Summary */}
            {on('summary') && (
              <Section title="Summary">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    ['Total appts', String(r.summary.totalAppts)],
                    ['Total pets', String(r.summary.totalPets)],
                    ['Earned revenue', fmt(r.summary.earnedRevenueCents)],
                    ['Expected revenue', fmt(r.summary.expectedRevenueCents)],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-neutral-400 uppercase">{label}</p>
                      <p className="mt-1 text-2xl font-bold">{val}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Revenue trend */}
            {on('revenue') && (
              <Section title={`Revenue trend (by ${period})`}>
                <BarChart rows={r.revenueTrend.map(t => ({ label: t.bucket, value: t.revenueCents }))}
                  max={Math.max(...r.revenueTrend.map(t => t.revenueCents), 1)} fmtVal={fmt} color="bg-emerald-500" />
              </Section>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {on('revenueByStaff') && (
                <Section title="Revenue by Staff">
                  <BarChart rows={r.revenueByStaff.map(s => ({ label: s.name, value: s.revenueCents }))}
                    max={Math.max(...r.revenueByStaff.map(s => s.revenueCents), 1)} fmtVal={fmt} />
                </Section>
              )}
              {on('commissionByStaff') && (
                <Section title="Commission by Staff">
                  <BarChart rows={r.commissionByStaff.map(s => ({ label: s.name, value: s.commissionCents }))}
                    max={Math.max(...r.commissionByStaff.map(s => s.commissionCents), 1)} fmtVal={fmt} color="bg-violet-500" />
                </Section>
              )}
              {on('tipsByStaff') && (
                <Section title="Tips by Staff">
                  <BarChart rows={r.tipsByStaff.map(s => ({ label: s.name, value: s.tipsCents }))}
                    max={Math.max(...r.tipsByStaff.map(s => s.tipsCents), 1)} fmtVal={fmt} color="bg-pink-500" />
                </Section>
              )}
              {on('salesByMethod') && (
                <Section title="Sales by method">
                  <BarChart rows={r.salesByMethod.map(s => ({ label: s.tender.replace(/_/g, ' '), value: s.amountCents }))}
                    max={Math.max(...r.salesByMethod.map(s => s.amountCents), 1)} fmtVal={fmt} color="bg-sky-500" />
                </Section>
              )}
            </div>

            {/* Sales items */}
            {on('salesItems') && (
              <Section title="Sales Item">
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{['Item', 'Count', 'Revenue'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {r.salesItems.map(s => (
                        <tr key={s.name}><td className="px-4 py-2">{s.name}</td><td className="px-4 py-2">{s.count}</td><td className="px-4 py-2 font-medium text-green-700">{fmt(s.revenueCents)}</td></tr>
                      ))}
                      {r.salesItems.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-neutral-400">No sales.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {on('paymentStatus') && (
                <Section title="Payment Status">
                  <div className="space-y-1 text-sm">
                    {Object.entries(r.paymentStatus).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-neutral-500">{k}</span><span className="font-medium">{v}</span></div>
                    ))}
                  </div>
                </Section>
              )}
              {on('bookingsByStatus') && (
                <Section title="Bookings by Status">
                  <div className="space-y-1 text-sm">
                    {Object.entries(r.bookingsByStatus).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-neutral-500">{k.replace(/_/g, ' ')}</span><span className="font-medium">{v}</span></div>
                    ))}
                  </div>
                </Section>
              )}
              {on('bookingsBySource') && (
                <Section title="Bookings by Source">
                  <div className="space-y-1 text-sm">
                    {Object.entries(r.bookingsBySource).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-neutral-500">{k}</span><span className="font-medium">{v}</span></div>
                    ))}
                  </div>
                </Section>
              )}
              {on('rates') && (
                <Section title="No-show / Cancellation">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-neutral-400 uppercase">No-show rate</p><p className={`text-2xl font-bold ${r.rates.noShowRate > 10 ? 'text-amber-600' : ''}`}>{r.rates.noShowRate}%</p></div>
                    <div><p className="text-xs text-neutral-400 uppercase">Cancellation rate</p><p className="text-2xl font-bold">{r.rates.cancellationRate}%</p></div>
                  </div>
                </Section>
              )}
            </div>

            {/* Revenue by location */}
            {on('revenueByLocation') && !storeId && (
              <Section title="Revenue by Location">
                <BarChart rows={r.revenueByLocation.map(l => ({ label: l.storeName, value: l.revenueCents }))}
                  max={Math.max(...r.revenueByLocation.map(l => l.revenueCents), 1)} fmtVal={fmt} color="bg-indigo-500" />
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
