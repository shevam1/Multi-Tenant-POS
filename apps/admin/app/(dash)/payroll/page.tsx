'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Store { id: string; name: string }
interface Config { commissionIncludesDiscount: boolean; clockInOutEnabled: boolean; autoSplitTipsEnabled: boolean; tipSplitMode: string }
interface RosterRow {
  id: string; fullName: string; role: string; roleName: string; storeId: string | null;
  payType: string; commissionRate: number; productCommissionRate: number; hourlyRateCents: number;
}
interface HoursRow { userId: string; fullName: string; totalHours: number; incompleteCount: number; hasIncomplete: boolean }
interface SummaryRow {
  id: string; fullName: string; roleName: string; payType: string; hours: number;
  serviceRevenueCents: number; tipsCents: number; commissionCents: number; hourlyCents: number; grossCents: number;
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const TABS = ['Commission', 'Clock In/Out', 'Auto Split Tips', 'Pay Summary'] as const;
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (r: number) => `${Math.round(r * 100)}%`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function PayrollPage() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Commission');
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [cfg, setCfg] = useState<Config | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [editRow, setEditRow] = useState<RosterRow | null>(null);
  const [showPunch, setShowPunch] = useState(false);
  // report
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayStr());
  const [hours, setHours] = useState<HoursRow[] | null>(null);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [saved, setSaved] = useState('');

  const loadRoster = useCallback(async (sid: string) => {
    setRoster(await apiFetch<RosterRow[]>(`/payroll/roster${sid ? `?storeId=${sid}` : ''}`));
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      if (!u.permissions.includes('settings.manage')) { router.push('/dashboard'); return; }
      const [c, st] = await Promise.all([
        apiFetch<Config>('/payroll/config'),
        apiFetch<Store[]>('/customers/stores').catch(() => []),
      ]);
      setCfg(c); setStores(st);
      const sid = u.role === 'FRANCHISE_HQ_ADMIN' ? (st[0]?.id ?? '') : (u.storeId ?? '');
      setStoreId(sid);
      loadRoster(sid);
    }).catch(() => router.push('/login'));
  }, [router, loadRoster]);

  async function saveCfg(patch: Partial<Config>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    await apiFetch('/payroll/config', { method: 'PUT', body: JSON.stringify(patch) });
    setSaved('cfg'); setTimeout(() => setSaved(''), 1500);
  }

  async function runReport() {
    setHours(await apiFetch<HoursRow[]>(`/timeclock/report?storeId=${storeId}&from=${from}&to=${to}`));
  }
  async function runSummary() {
    const r = await apiFetch<{ rows: SummaryRow[] }>(`/payroll/summary?storeId=${storeId}&from=${from}&to=${to}`);
    setSummary(r.rows);
  }
  async function exportCsv() {
    const res = await fetch(`${API_BASE}/api/timeclock/export?storeId=${storeId}&from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `timeclock-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!cfg) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;
  const isHQ = me?.role === 'FRANCHISE_HQ_ADMIN';

  return (
    <div>
      <main className="mx-auto max-w-5xl px-8 py-8 space-y-5">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          {isHQ && stores.length > 1 && (
            <select className="ml-auto rounded border bg-white px-2 py-1.5 text-xs" value={storeId}
              onChange={e => { setStoreId(e.target.value); loadRoster(e.target.value); setHours(null); setSummary(null); }}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="mb-4 overflow-x-auto border-b">
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === t ? 'border-amber-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Commission Configurations ── */}
        {tab === 'Commission' && (
          <>
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold mb-1">Calculation scope {saved === 'cfg' && <span className="text-xs text-green-600 ml-2">✓ Saved</span>}</h2>
              <p className="text-xs text-neutral-400 mb-3">How commission revenue is computed against discounts.</p>
              {[['Exclude discount', false, 'Use the baseline catalog price, ignoring markdowns.'],
                ['Include discount', true, 'Use the final subtotal after coupons / overrides.']].map(([label, val, desc]) => (
                <label key={String(val)} className="flex items-start gap-2 py-1.5 text-sm cursor-pointer">
                  <input type="radio" className="mt-0.5" checked={cfg.commissionIncludesDiscount === val}
                    onChange={() => saveCfg({ commissionIncludesDiscount: val as boolean })} />
                  <span><span className="font-medium">{label}</span> <span className="text-neutral-400">— {desc}</span></span>
                </label>
              ))}
            </section>

            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="border-b px-4 py-3"><h2 className="font-semibold">Workforce roster</h2></div>
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500">
                  <tr>{['Staff', 'Role', 'Type', 'Service', 'Product', 'Hourly', ''].map(h => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {roster.map(r => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-medium">{r.fullName}</td>
                      <td className="px-4 py-2.5 text-neutral-500">{r.roleName}</td>
                      <td className="px-4 py-2.5">{r.payType === 'HOURLY' ? 'By Hourly' : 'By Commission'}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{r.payType === 'HOURLY' ? '—' : pct(r.commissionRate)}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{r.payType === 'HOURLY' ? '—' : pct(r.productCommissionRate)}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{r.payType === 'HOURLY' ? `${fmt(r.hourlyRateCents)}/h` : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setEditRow(r)} className="text-brand text-xs hover:underline">Edit</button></td>
                    </tr>
                  ))}
                  {roster.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No staff.</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        )}

        {/* ── Clock In/Out ── */}
        {tab === 'Clock In/Out' && (
          <>
            <section className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div><h2 className="font-semibold">Clock In/Out engine</h2><p className="text-xs text-neutral-400 mt-0.5">Enables the self-service time clock on staff devices.</p></div>
              <label className="flex items-center gap-2 text-sm">
                <span className={cfg.clockInOutEnabled ? 'text-amber-600 font-medium' : 'text-neutral-400'}>{cfg.clockInOutEnabled ? 'On' : 'Off'}</span>
                <button type="button" onClick={() => saveCfg({ clockInOutEnabled: !cfg.clockInOutEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full ${cfg.clockInOutEnabled ? 'bg-amber-400' : 'bg-neutral-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.clockInOutEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </section>

            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div><label className="block text-xs text-neutral-500 mb-1">From</label><input type="date" className="rounded-lg border px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div><label className="block text-xs text-neutral-500 mb-1">To</label><input type="date" className="rounded-lg border px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} /></div>
                <button onClick={runReport} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Run report</button>
                <button onClick={exportCsv} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50">Export CSV</button>
                <button onClick={() => setShowPunch(true)} className="ml-auto rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50">+ Time Punch</button>
              </div>
              {hours && (
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500">
                    <tr>{['Staff', 'Total Hours', 'Incomplete'].map(h => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {hours.map(h => (
                      <tr key={h.userId}>
                        <td className="px-4 py-2.5 font-medium">{h.fullName}</td>
                        <td className="px-4 py-2.5">{h.totalHours} h</td>
                        <td className="px-4 py-2.5">{h.hasIncomplete ? <span className="text-amber-600">{h.incompleteCount} ⚠</span> : '—'}</td>
                      </tr>
                    ))}
                    {hours.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-400">No entries in range.</td></tr>}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {/* ── Auto Split Tips ── */}
        {tab === 'Auto Split Tips' && (
          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="font-semibold">Auto split tips</h2><p className="text-xs text-neutral-400 mt-0.5">Distributes tips across staff linked to a checkout receipt.</p></div>
              <label className="flex items-center gap-2 text-sm">
                <span className={cfg.autoSplitTipsEnabled ? 'text-amber-600 font-medium' : 'text-neutral-400'}>{cfg.autoSplitTipsEnabled ? 'On' : 'Off'}</span>
                <button type="button" onClick={() => saveCfg({ autoSplitTipsEnabled: !cfg.autoSplitTipsEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full ${cfg.autoSplitTipsEnabled ? 'bg-amber-400' : 'bg-neutral-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.autoSplitTipsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </div>
            <div className={cfg.autoSplitTipsEnabled ? '' : 'opacity-40 pointer-events-none'}>
              {[['PRICE', 'Split based on service price', 'Proportional to the service value each employee performed.'],
                ['EQUAL', 'Split equally', 'Divides tips evenly among all staff on the invoice.']].map(([val, label, desc]) => (
                <label key={val} className="flex items-start gap-2 py-1.5 text-sm cursor-pointer">
                  <input type="radio" className="mt-0.5" checked={cfg.tipSplitMode === val} onChange={() => saveCfg({ tipSplitMode: val })} />
                  <span><span className="font-medium">{label}</span> <span className="text-neutral-400">— {desc}</span></span>
                </label>
              ))}
            </div>
          </section>
        )}

        {/* ── Pay Summary ── */}
        {tab === 'Pay Summary' && (
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div><label className="block text-xs text-neutral-500 mb-1">From</label><input type="date" className="rounded-lg border px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div><label className="block text-xs text-neutral-500 mb-1">To</label><input type="date" className="rounded-lg border px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} /></div>
              <button onClick={runSummary} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Calculate</button>
            </div>
            <p className="text-xs text-neutral-400 mb-3">Estimate from clocked hours + commission on paid invoices ({cfg.commissionIncludesDiscount ? 'incl.' : 'excl.'} discount{cfg.autoSplitTipsEnabled ? `, tips split ${cfg.tipSplitMode.toLowerCase()}` : ''}).</p>
            {summary && (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500">
                  <tr>{['Staff', 'Type', 'Hours', 'Service rev.', 'Commission', 'Hourly', 'Tips', 'Gross'].map(h => <th key={h} className="px-3 py-2.5 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {summary.map(r => (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 font-medium">{r.fullName}</td>
                      <td className="px-3 py-2.5 text-neutral-500">{r.payType === 'HOURLY' ? 'Hourly' : 'Commission'}</td>
                      <td className="px-3 py-2.5">{r.hours}</td>
                      <td className="px-3 py-2.5 text-neutral-600">{fmt(r.serviceRevenueCents)}</td>
                      <td className="px-3 py-2.5">{r.payType === 'HOURLY' ? '—' : fmt(r.commissionCents)}</td>
                      <td className="px-3 py-2.5">{r.payType === 'HOURLY' ? fmt(r.hourlyCents) : '—'}</td>
                      <td className="px-3 py-2.5">{fmt(r.tipsCents)}</td>
                      <td className="px-3 py-2.5 font-semibold">{fmt(r.grossCents)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-neutral-400">No staff.</td></tr>}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      {editRow && <RosterModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); loadRoster(storeId); }} />}
      {showPunch && <PunchModal roster={roster} storeId={storeId} onClose={() => setShowPunch(false)} onSaved={() => { setShowPunch(false); runReport(); }} />}
    </div>
  );
}

function RosterModal({ row, onClose, onSaved }: { row: RosterRow; onClose: () => void; onSaved: () => void }) {
  const [payType, setPayType] = useState(row.payType);
  const [service, setService] = useState(String(Math.round(row.commissionRate * 100)));
  const [product, setProduct] = useState(String(Math.round(row.productCommissionRate * 100)));
  const [hourly, setHourly] = useState((row.hourlyRateCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await apiFetch(`/payroll/roster/${row.id}`, { method: 'PATCH', body: JSON.stringify({
      payType,
      commissionRate: Math.max(0, Math.min(100, Number(service))) / 100,
      productCommissionRate: Math.max(0, Math.min(100, Number(product))) / 100,
      hourlyRateCents: Math.round(parseFloat(hourly || '0') * 100),
    })});
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg">{row.fullName}</h2><button onClick={onClose} className="text-neutral-400 text-xl">×</button></div>
        <p className="text-xs text-neutral-500">{row.roleName}</p>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Compensation type</label>
          <div className="flex gap-2">
            {[['COMMISSION', 'By Commission'], ['HOURLY', 'By Hourly']].map(([v, l]) => (
              <button key={v} onClick={() => setPayType(v)} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${payType === v ? 'bg-brand text-white border-brand' : 'hover:bg-neutral-50'}`}>{l}</button>
            ))}
          </div>
        </div>
        {payType === 'COMMISSION' ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-neutral-500 mb-1">Service commission %</label><input type="number" min={0} max={100} className="w-full rounded-lg border px-3 py-2 text-sm" value={service} onChange={e => setService(e.target.value)} /></div>
            <div><label className="block text-xs text-neutral-500 mb-1">Product commission %</label><input type="number" min={0} max={100} className="w-full rounded-lg border px-3 py-2 text-sm" value={product} onChange={e => setProduct(e.target.value)} /></div>
          </div>
        ) : (
          <div><label className="block text-xs text-neutral-500 mb-1">Hourly rate (CAD)</label><input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={hourly} onChange={e => setHourly(e.target.value)} /></div>
        )}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PunchModal({ roster, storeId, onClose, onSaved }: { roster: RosterRow[]; storeId: string; onClose: () => void; onSaved: () => void }) {
  const [userId, setUserId] = useState(roster[0]?.id ?? '');
  const [date, setDate] = useState(todayStr());
  const [clockIn, setClockIn] = useState('09:00');
  const [clockOut, setClockOut] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!notes.trim()) { setError('A note is required.'); return; }
    setSaving(true);
    try {
      await apiFetch('/timeclock/manual', { method: 'POST', body: JSON.stringify({ userId, storeId, date, clockIn, clockOut, notes }) });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message.replace(/^API \d+: /, '') : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg">Manual time punch</h2><button onClick={onClose} className="text-neutral-400 text-xl">×</button></div>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Staff</label>
          <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={userId} onChange={e => setUserId(e.target.value)}>
            {roster.map(r => <option key={r.id} value={r.id}>{r.fullName}</option>)}
          </select>
        </div>
        <div><label className="block text-xs text-neutral-500 mb-1">Date</label><input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-neutral-500 mb-1">Clock in</label><input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" value={clockIn} onChange={e => setClockIn(e.target.value)} /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Clock out</label><input type="time" className="w-full rounded-lg border px-3 py-2 text-sm" value={clockOut} onChange={e => setClockOut(e.target.value)} /></div>
        </div>
        <div><label className="block text-xs text-neutral-500 mb-1">Note (required)</label><textarea rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for the manual entry…" /></div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add entry'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
