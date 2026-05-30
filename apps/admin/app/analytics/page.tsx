'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface RevenueSummary {
  totalRevenueCents: number;
  totalInvoices: number;
  stores: { storeId: string; storeName: string; province: string; revenueCents: number; discountCents: number; taxCents: number; tipCents: number; invoiceCount: number }[];
}

interface BookingsSummary {
  total: number;
  completionRate: number;
  noShowRate: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byStore: { storeId: string; storeName: string; total: number; completed: number; noShow: number; cancelled: number }[];
}

interface MembershipSummary {
  activeMembers: number;
  totalLoyaltyPoints: number;
  byTier: { tier: string; count: number }[];
}

interface StaffHoursRow { fullName: string; storeName: string; totalHours: number }
interface TopService { name: string; count: number; revenueCents: number }

const fmt = (c: number) => `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (c: number) => c >= 100_000 ? `$${(c / 100_000).toFixed(1)}k` : fmt(c);

const TIER_COLORS: Record<string, string> = {
  SILVER: 'bg-neutral-200 text-neutral-700',
  GOLD: 'bg-amber-200 text-amber-800',
  PLATINUM: 'bg-violet-200 text-violet-800',
};

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${accent ?? ''}`}>
      <p className="text-xs font-semibold uppercase text-neutral-400">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default function AnalyticsPage() {
  const router = useRouter();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [bookings, setBookings] = useState<BookingsSummary | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [staff, setStaff] = useState<StaffHoursRow[]>([]);
  const [services, setServices] = useState<TopService[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    const qs = `from=${f}&to=${t}`;
    const [rev, bk, mem, sh, svc] = await Promise.allSettled([
      apiFetch<RevenueSummary>(`/analytics/revenue?${qs}`),
      apiFetch<BookingsSummary>(`/analytics/bookings?${qs}`),
      apiFetch<MembershipSummary>('/analytics/memberships'),
      apiFetch<StaffHoursRow[]>(`/analytics/staff-hours?${qs}`),
      apiFetch<TopService[]>(`/analytics/top-services?${qs}`),
    ]);
    if (rev.status === 'fulfilled') setRevenue(rev.value);
    if (bk.status === 'fulfilled') setBookings(bk.value);
    if (mem.status === 'fulfilled') setMembership(mem.value);
    if (sh.status === 'fulfilled') setStaff(sh.value);
    if (svc.status === 'fulfilled') setServices(svc.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    load(from, to);
  }, [router, load, from, to]);

  const maxRev = Math.max(...(revenue?.stores.map(s => s.revenueCents) ?? [1]));
  const maxBk = Math.max(...(bookings?.byStore.map(s => s.total) ?? [1]));

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Franchise HQ Analytics</h1>
        <span className="text-xs text-neutral-400 ml-1">§13</span>
        <div className="ml-auto flex items-center gap-2">
          <input type="date" className="rounded border px-2 py-1 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-neutral-400 text-sm">to</span>
          <input type="date" className="rounded border px-2 py-1 text-sm" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {loading && <p className="text-sm text-neutral-400">Loading analytics…</p>}

        {/* KPI row */}
        {revenue && bookings && membership && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total revenue" value={fmtK(revenue.totalRevenueCents)} sub={`${revenue.totalInvoices} invoices`} />
            <StatCard label="Bookings" value={String(bookings.total)} sub={`${bookings.completionRate}% completion rate`} />
            <StatCard label="Active members" value={String(membership.activeMembers)} sub={`${(membership.totalLoyaltyPoints).toLocaleString()} pts outstanding`} />
            <StatCard label="No-show rate" value={`${bookings.noShowRate}%`} accent={bookings.noShowRate > 10 ? 'border-amber-200' : ''} />
          </div>
        )}

        {/* Revenue by store */}
        {revenue && (
          <section>
            <h2 className="mb-3 font-semibold">Revenue by store</h2>
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                  <tr>{['Store', 'Province', 'Revenue', 'Discount', 'Tax', 'Tips', 'Invoices', 'Share'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {revenue.stores.map(s => (
                    <tr key={s.storeId} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-medium">{s.storeName}</td>
                      <td className="px-4 py-3 text-neutral-500">{s.province}</td>
                      <td className="px-4 py-3 font-semibold text-green-700">{fmt(s.revenueCents)}</td>
                      <td className="px-4 py-3 text-red-500">{s.discountCents > 0 ? `-${fmt(s.discountCents)}` : '—'}</td>
                      <td className="px-4 py-3 text-neutral-500">{fmt(s.taxCents)}</td>
                      <td className="px-4 py-3 text-neutral-500">{fmt(s.tipCents)}</td>
                      <td className="px-4 py-3">{s.invoiceCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-neutral-100">
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round(s.revenueCents / maxRev * 100)}%` }} />
                          </div>
                          <span className="text-xs text-neutral-500">{Math.round(s.revenueCents / revenue.totalRevenueCents * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-neutral-50 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-green-700">{fmt(revenue.totalRevenueCents)}</td>
                    <td colSpan={5} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Bookings + membership split */}
        <div className="grid grid-cols-2 gap-6">
          {/* Bookings by store */}
          {bookings && (
            <section>
              <h2 className="mb-3 font-semibold">Bookings by store</h2>
              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                {bookings.byStore.map(s => (
                  <div key={s.storeId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{s.storeName}</span>
                      <span className="text-neutral-500">{s.total}</span>
                    </div>
                    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-neutral-100">
                      <div className="bg-green-400" style={{ width: `${s.total > 0 ? s.completed / s.total * 100 : 0}%` }} />
                      <div className="bg-amber-400" style={{ width: `${s.total > 0 ? s.cancelled / s.total * 100 : 0}%` }} />
                      <div className="bg-red-400" style={{ width: `${s.total > 0 ? s.noShow / s.total * 100 : 0}%` }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-neutral-400">
                      <span className="text-green-600">{s.completed} done</span>
                      <span className="text-amber-600">{s.cancelled} cancel</span>
                      <span className="text-red-500">{s.noShow} no-show</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t flex gap-4 text-xs text-neutral-500">
                  {Object.entries(bookings.bySource).map(([src, count]) => (
                    <span key={src}>{src}: {count}</span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Membership tiers */}
          {membership && (
            <section>
              <h2 className="mb-3 font-semibold">Membership breakdown</h2>
              <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
                {membership.byTier.map(t => (
                  <div key={t.tier} className="flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_COLORS[t.tier] ?? 'bg-neutral-200 text-neutral-700'}`}>{t.tier}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 rounded-full bg-neutral-100">
                        <div className="h-2 rounded-full bg-violet-400" style={{ width: `${membership.activeMembers > 0 ? t.count / membership.activeMembers * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{t.count}</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-neutral-400 pt-1 border-t">
                  {membership.totalLoyaltyPoints.toLocaleString()} total loyalty points outstanding
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Top services + staff hours */}
        <div className="grid grid-cols-2 gap-6">
          {services.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Top services</h2>
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                    <tr>{['Service', 'Count', 'Revenue'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {services.map((s, i) => (
                      <tr key={s.name} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 flex items-center gap-2">
                          <span className="text-xs text-neutral-400 w-4">{i + 1}</span>
                          {s.name}
                        </td>
                        <td className="px-4 py-2">{s.count}</td>
                        <td className="px-4 py-2 font-medium text-green-700">{fmt(s.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {staff.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Staff hours</h2>
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                    <tr>{['Staff', 'Store', 'Hours'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {staff.map(s => (
                      <tr key={s.fullName} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 font-medium">{s.fullName}</td>
                        <td className="px-4 py-2 text-neutral-500">{s.storeName}</td>
                        <td className="px-4 py-2">{s.totalHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
