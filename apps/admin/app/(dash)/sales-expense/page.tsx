'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface Report {
  summary: { appointmentSalesCents: number; retailSalesCents: number; totalSalesCents: number; expensesCents: number; netCents: number };
  servicesBreakdown: { name: string; count: number; revenueCents: number }[];
  expenseByCategory: { category: string; amountCents: number }[];
  appointments: { id: string; date: string; customer: string; serviceCents: number; retailCents: number }[];
  expenses: { id: string; category: string; description: string | null; amountCents: number; incurredAt: string }[];
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const fmt = (c: number) => `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function SalesExpensePage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [storeId, setStoreId] = useState('');
  const [service, setService] = useState('');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [tab, setTab] = useState<'sales' | 'expenses'>('sales');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);

  const load = useCallback(async (params: { from: string; to: string; storeId: string; service: string }) => {
    setLoading(true);
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.service) qs.set('service', params.service);
    const r = await apiFetch<Report>(`/finance/report?${qs}`).catch(() => null);
    setReport(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      if (!u.permissions.includes('analytics.view')) { router.push('/dashboard'); return; }
      const [s, svc] = await Promise.all([
        apiFetch<Store[]>('/customers/stores').catch(() => []),
        apiFetch<string[]>('/finance/services').catch(() => []),
      ]);
      setStores(s); setServices(svc);
      load({ from, to, storeId: '', service: '' });
    }).catch(() => router.push('/login'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function refresh() { load({ from, to, storeId, service }); }

  return (
    <div>
      <main className="mx-auto max-w-5xl px-8 py-8 space-y-5">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Sales &amp; Expense</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
          <input type="date" className="rounded border px-2 py-1 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-neutral-400 text-xs">to</span>
          <input type="date" className="rounded border px-2 py-1 text-xs" value={to} onChange={e => setTo(e.target.value)} />
          {me?.role === 'FRANCHISE_HQ_ADMIN' && stores.length > 0 && (
            <select className="rounded border px-2 py-1.5 text-xs bg-white" value={storeId} onChange={e => setStoreId(e.target.value)}>
              <option value="">All locations</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select className="rounded border px-2 py-1.5 text-xs bg-white" value={service} onChange={e => setService(e.target.value)}>
            <option value="">All services / packages</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={refresh} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Run</button>
          </div>
        </div>
        {loading || !report ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                ['Appointments', report.summary.appointmentSalesCents, 'text-blue-700'],
                ['Retail', report.summary.retailSalesCents, 'text-emerald-700'],
                ['Total sales', report.summary.totalSalesCents, ''],
                ['Expenses', report.summary.expensesCents, 'text-red-600'],
                ['Net', report.summary.netCents, report.summary.netCents >= 0 ? 'text-green-700' : 'text-red-600'],
              ].map(([label, val, cls]) => (
                <div key={label as string} className="rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-xs text-neutral-400 uppercase">{label}</p>
                  <p className={`mt-1 text-2xl font-bold ${cls}`}>{fmt(val as number)}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b">
              {(['sales', 'expenses'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 capitalize ${tab === t ? 'border-amber-400 text-neutral-900' : 'border-transparent text-neutral-500'}`}>{t}</button>
              ))}
            </div>

            {tab === 'sales' && (
              <div className="grid md:grid-cols-2 gap-5">
                {/* Services breakdown */}
                <section className="rounded-xl border bg-white p-5 shadow-sm">
                  <h2 className="mb-3 font-semibold">Sales by service / package</h2>
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-neutral-500"><tr>{['Service', 'Count', 'Revenue'].map(h => <th key={h} className="py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {report.servicesBreakdown.map(s => (
                        <tr key={s.name}><td className="py-1.5">{s.name}</td><td className="py-1.5">{s.count}</td><td className="py-1.5 font-medium text-green-700">{fmt(s.revenueCents)}</td></tr>
                      ))}
                      {report.servicesBreakdown.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-neutral-400">No sales.</td></tr>}
                    </tbody>
                  </table>
                </section>
                {/* Appointments */}
                <section className="rounded-xl border bg-white p-5 shadow-sm">
                  <h2 className="mb-3 font-semibold">Appointments &amp; retail</h2>
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-neutral-500"><tr>{['Date', 'Customer', 'Service', 'Retail'].map(h => <th key={h} className="py-1 text-left">{h}</th>)}</tr></thead>
                      <tbody className="divide-y">
                        {report.appointments.map(a => (
                          <tr key={a.id}>
                            <td className="py-1.5 text-xs">{new Date(a.date).toLocaleDateString('en-CA')}</td>
                            <td className="py-1.5">{a.customer}</td>
                            <td className="py-1.5">{a.serviceCents ? fmt(a.serviceCents) : '—'}</td>
                            <td className="py-1.5 text-emerald-700">{a.retailCents ? fmt(a.retailCents) : '—'}</td>
                          </tr>
                        ))}
                        {report.appointments.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-neutral-400">No appointments.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === 'expenses' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {report.expenseByCategory.map(c => (
                      <span key={c.category} className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{c.category}: <span className="font-medium">{fmt(c.amountCents)}</span></span>
                    ))}
                  </div>
                  <button onClick={() => setShowAddExpense(true)} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">+ Expense</button>
                </div>
                <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{['Date', 'Category', 'Description', 'Amount', ''].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {report.expenses.map(e => (
                        <tr key={e.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-2 text-xs">{new Date(e.incurredAt).toLocaleDateString('en-CA')}</td>
                          <td className="px-4 py-2">{e.category}</td>
                          <td className="px-4 py-2 text-neutral-500">{e.description ?? '—'}</td>
                          <td className="px-4 py-2 font-medium text-red-600">{fmt(e.amountCents)}</td>
                          <td className="px-4 py-2 text-right"><button onClick={async () => { await apiFetch(`/finance/expenses/${e.id}`, { method: 'DELETE' }); refresh(); }} className="text-xs text-red-400 hover:underline">delete</button></td>
                        </tr>
                      ))}
                      {report.expenses.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No expenses in range.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showAddExpense && (
        <ExpenseModal stores={stores} defaultStore={storeId || me?.storeId || stores[0]?.id || ''}
          onClose={() => setShowAddExpense(false)} onSaved={() => { setShowAddExpense(false); refresh(); }} />
      )}
    </div>
  );
}

function ExpenseModal({ stores, defaultStore, onClose, onSaved }: { stores: Store[]; defaultStore: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ storeId: defaultStore, category: 'Supplies', description: '', amount: '', incurredAt: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const CATEGORIES = ['Supplies', 'Rent', 'Payroll', 'Utilities', 'Marketing', 'Equipment', 'Other'];
  async function save() {
    if (!form.amount || !form.storeId) return;
    setSaving(true);
    await apiFetch('/finance/expenses', { method: 'POST', body: JSON.stringify({
      storeId: form.storeId, category: form.category, description: form.description || undefined,
      amountCents: Math.round(parseFloat(form.amount) * 100), incurredAt: form.incurredAt,
    })});
    setSaving(false); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[400px] rounded-2xl bg-white p-6 shadow-2xl space-y-3">
        <h2 className="font-bold text-lg">Add expense</h2>
        {stores.length > 1 && (
          <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-neutral-500 mb-1">Amount (CAD) *</label><input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Date</label><input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.incurredAt} onChange={e => setForm(f => ({ ...f, incurredAt: e.target.value }))} /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !form.amount} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add expense'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
