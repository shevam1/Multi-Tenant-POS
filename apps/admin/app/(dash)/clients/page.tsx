'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ClientFormModal from '@/components/client-form-modal';

interface Store { id: string; name: string }
interface PetRow { id: string; name: string; breed: string | null; species: string; tags: string[]; preferredGroomerId?: string | null }
interface ApptRow { id: string; scheduledStart: string; status: string }
interface CustomerRow {
  id: string; fullName: string; phone: string | null; email: string | null; tags: string[];
  membershipTier: string | null; loyaltyPoints: number; status: string; createdAt: string;
  pets: PetRow[]; lastAppt: ApptRow | null; nextAppt: { id: string; scheduledStart: string } | null;
  totalSalesCents: number;
}
interface ListResponse { data: CustomerRow[]; total: number; page: number; limit: number }
interface Coupon { id: string; code: string; description?: string | null }

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active clients' },
  { value: 'INACTIVE', label: 'Inactive clients' },
  { value: 'PENDING', label: 'Pending clients' },
  { value: 'LEAD', label: 'Leads' },
  { value: 'DELETED', label: 'Deleted clients' },
  { value: 'ALL', label: 'All clients' },
];
const ORDER_OPTIONS = [
  { value: 'firstName:asc', label: 'First name ↑' },
  { value: 'firstName:desc', label: 'First name ↓' },
  { value: 'lastName:asc', label: 'Last name ↑' },
  { value: 'lastName:desc', label: 'Last name ↓' },
  { value: 'createdAt:asc', label: 'Create time ↑' },
  { value: 'createdAt:desc', label: 'Create time ↓' },
];
const LIMITS = [20, 50, 100];
const TIER_BADGE: Record<string, string> = {
  SILVER: 'bg-neutral-200 text-neutral-700', GOLD: 'bg-amber-200 text-amber-800', PLATINUM: 'bg-violet-200 text-violet-800',
};

function fmt(c: number) { return `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function ClientsPage() {
  const { me, stores } = useShell();
  const [storeId, setStoreId] = useState(me.role !== 'FRANCHISE_HQ_ADMIN' ? (me.storeId ?? '') : '');
  const [status, setStatus] = useState('ACTIVE');
  const [order, setOrder] = useState('firstName:asc');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);

  const load = useCallback(async (params: {
    q?: string; storeId?: string; status?: string; page?: number; limit?: number; order?: string; extra?: Record<string, string>;
  }) => {
    setLoading(true);
    const [ob, od] = (params.order ?? 'firstName:asc').split(':');
    const qs = new URLSearchParams({
      page: String(params.page ?? 1), limit: String(params.limit ?? 20), status: params.status ?? 'ACTIVE',
      orderBy: ob, order: od,
      ...(params.q ? { q: params.q } : {}), ...(params.storeId ? { storeId: params.storeId } : {}), ...(params.extra ?? {}),
    });
    const data = await apiFetch<ListResponse>(`/customers?${qs}`).catch(() => null);
    setResult(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load({ storeId, status, page: 1, limit, order });
    apiFetch<Coupon[]>('/coupons').then(c => setCoupons(Array.isArray(c) ? c : [])).catch(() => {});
    ready.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    load({ q, storeId, status, page, limit, order, extra: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, status, order, page, limit]);

  function onSearch(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ q: val, storeId, status, page: 1, limit, order, extra: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) });
    }, 300);
  }
  function applyFilters(newFilters: Record<string, string>) {
    setFilters(newFilters); setPage(1); setShowFilter(false);
    load({ q, storeId, status, page: 1, limit, order, extra: Object.fromEntries(Object.entries(newFilters).filter(([, v]) => v !== '')) });
  }
  async function deleteCustomer(id: string) {
    if (!confirm('Delete this client? They will be soft-deleted and can be restored.')) return;
    await apiFetch(`/customers/${id}`, { method: 'DELETE' });
    load({ q, storeId, status, page, limit, order, extra: filters });
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
  }
  function toggleSelect(id: string) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() {
    if (!result) return;
    setSelected(selected.size === result.data.length ? new Set() : new Set(result.data.map(c => c.id)));
  }

  const totalPages = result ? Math.ceil(result.total / limit) : 1;
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // Footer widgets derived from the loaded page.
  const topSpender = useMemo(() => (result?.data ?? []).reduce<CustomerRow | null>((m, c) => (!m || c.totalSalesCents > m.totalSalesCents ? c : m), null), [result]);
  const popularBreed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of result?.data ?? []) for (const p of c.pets) if (p.breed) counts.set(p.breed, (counts.get(p.breed) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [result]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-8 py-8">
      {/* Heading */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          {result && <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">{result.total.toLocaleString()} Total</span>}
        </div>
        <Button onClick={() => setShowAdd(true)}>+ Add Client</Button>
      </div>

      {/* Filter card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">🔍</span>
              <input className="w-full rounded-md border py-2 pl-9 pr-3 text-sm" placeholder="Search name, pet or phone…" value={q} onChange={e => onSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
            <select className="rounded-md border bg-white px-3 py-2 text-sm" value={storeId} onChange={e => { setStoreId(e.target.value); setPage(1); }}>
              <option value="">All locations</option>
              {stores.map((s: Store) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select className="rounded-md border bg-white px-3 py-2 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="relative">
            <Button variant="outline" onClick={() => setShowFilter(!showFilter)}>
              ⚙ More Filters{activeFilterCount > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount}</span>}
            </Button>
            {showFilter && <FilterPanel filters={filters} onApply={applyFilters} onClose={() => setShowFilter(false)} />}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">Order by:</span>
            <select className="rounded-md border bg-transparent px-2 py-1 text-sm font-medium text-primary" value={order} onChange={e => { setOrder(e.target.value); setPage(1); }}>
              {ORDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <BulkManageButton selected={selected} onDone={() => { setSelected(new Set()); load({ q, storeId, status, page, limit, order, extra: filters }); }} />
        </div>
        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(filters).filter(([, v]) => v !== '').map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-0.5 text-xs text-blue-700">
                {k}: {v}<button onClick={() => { const f = { ...filters }; delete f[k]; applyFilters(f); }} className="ml-1 hover:text-blue-900">×</button>
              </span>
            ))}
            <button onClick={() => applyFilters({})} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left"><input type="checkbox" checked={!!result && selected.size === result.data.length && result.data.length > 0} onChange={toggleAll} className="rounded" /></th>
              {['Name', 'Pets', 'Pref. Groomer', 'Contact', 'Last Appt.', 'Next Appt.', 'Total Sales', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>}
            {!loading && result?.data.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">No clients found.</td></tr>}
            {!loading && result?.data.map(c => (
              <tr key={c.id} className={`hover:bg-secondary/60 ${selected.has(c.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" /></td>
                <td className="px-4 py-3">
                  <a href={`/clients/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.fullName || 'Not Set'}</a>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {c.membershipTier && <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${TIER_BADGE[c.membershipTier] ?? 'bg-neutral-100 text-neutral-600'}`}>{c.membershipTier}</span>}
                    {c.tags.map(t => <span key={t} className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{t}</span>)}
                    {!c.lastAppt && <span className="rounded-full border border-rose-300 px-1.5 py-0.5 text-xs text-rose-500">New</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.pets.length > 0 ? c.pets.map(p => <div key={p.id} className="text-xs">{p.name}{p.breed ? ` (${p.breed})` : ''}</div>) : <span className="text-neutral-300">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-400">—</td>
                <td className="px-4 py-3 text-xs">
                  {c.phone && <a href={`tel:${c.phone}`} className="text-primary">{c.phone}</a>}
                  {c.email && <div className="text-muted-foreground">{c.email}</div>}
                  {!c.phone && !c.email && <span className="text-neutral-300">—</span>}
                </td>
                <td className="px-4 py-3 text-sm">{c.lastAppt ? fmtDate(c.lastAppt.scheduledStart) : <span className="text-neutral-300">N/A</span>}</td>
                <td className="px-4 py-3 text-sm">{c.nextAppt ? <span className="text-primary">{fmtDate(c.nextAppt.scheduledStart)}</span> : <span className="text-neutral-300">N/A</span>}</td>
                <td className="px-4 py-3 font-medium">{fmt(c.totalSalesCents)}</td>
                <td className="px-4 py-3"><ActionsMenu id={c.id} onDelete={() => deleteCustomer(c.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {result && result.total > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {(page - 1) * limit + 1} to {Math.min(page * limit, result.total)} of {result.total.toLocaleString()} clients</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded border px-2 py-1 hover:bg-secondary disabled:opacity-30">‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i === 3 ? -1 : totalPages - (6 - i);
                return p === -1 ? <span key="e" className="px-1">…</span>
                  : <button key={p} onClick={() => setPage(p)} className={`rounded border px-3 py-1 ${page === p ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>{p}</button>;
              })}
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded border px-2 py-1 hover:bg-secondary disabled:opacity-30">›</button>
            </div>
            <select className="rounded border bg-white px-2 py-1" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
              {LIMITS.map(l => <option key={l} value={l}>{l} / page</option>)}
            </select>
          </div>
        )}
      </Card>

      {/* Footer widgets */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2"><span className="text-xl">🏆</span><p className="font-semibold">Top Spender</p></div>
          {topSpender ? (
            <>
              <p className="text-2xl font-bold">{fmt(topSpender.totalSalesCents)}</p>
              <p className="text-xs text-muted-foreground">{topSpender.fullName}</p>
            </>
          ) : <p className="text-sm text-muted-foreground">No data.</p>}
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2"><span className="text-xl">🐾</span><p className="font-semibold">Most Popular</p></div>
          {popularBreed ? (
            <>
              <p className="text-2xl font-bold">{popularBreed[0]}</p>
              <p className="text-xs text-muted-foreground">{popularBreed[1]} pet{popularBreed[1] > 1 ? 's' : ''} on this page</p>
            </>
          ) : <p className="text-sm text-muted-foreground">No data.</p>}
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2"><span className="text-xl">🏷️</span><p className="font-semibold">Active Promo</p></div>
          {coupons.length > 0 ? (
            <>
              <p className="text-2xl font-bold text-amber-700">{coupons[0].code}</p>
              <p className="text-xs text-muted-foreground">{coupons[0].description ?? 'Discount code'} · {coupons.length} Active</p>
            </>
          ) : <p className="text-sm text-muted-foreground">No active promos.</p>}
        </Card>
      </div>

      {showAdd && <ClientFormModal customer={null} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load({ q, storeId, status, page: 1, limit, order, extra: filters }); }} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionsMenu({ id, onDelete }: { id: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="rounded border px-2 py-1 text-muted-foreground hover:bg-secondary">⋯</button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border bg-white text-sm shadow-lg">
          <a href={`/clients/${id}`} className="block px-4 py-2 hover:bg-secondary">View</a>
          <a href={`/clients/${id}?edit=1`} className="block px-4 py-2 hover:bg-secondary">Edit</a>
          <button onClick={() => { setOpen(false); onDelete(); }} className="block w-full px-4 py-2 text-left text-red-600 hover:bg-red-50">Delete</button>
        </div>
      )}
    </div>
  );
}

function FilterPanel({ filters, onApply, onClose }: { filters: Record<string, string>; onApply: (f: Record<string, string>) => void; onClose: () => void }) {
  const [local, setLocal] = useState({ ...filters });
  const set = (k: string, v: string) => setLocal(f => ({ ...f, [k]: v }));
  return (
    <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white text-sm shadow-xl">
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Quick Filters</p>
        <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-foreground">
          <input type="checkbox" checked={local.noBooking === 'true'} onChange={e => set('noBooking', e.target.checked ? 'true' : '')} />No booked appointment
        </label>
        <div className="flex items-center gap-2 py-1">
          <span>Haven&apos;t seen in</span>
          <input type="number" min="1" className="w-14 rounded border px-1.5 py-0.5 text-xs" placeholder="wks" value={local.notSeenWeeks ?? ''} onChange={e => set('notSeenWeeks', e.target.value)} />
          <span>weeks</span>
        </div>
      </div>
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Custom Filters</p>
        {[{ key: 'breed', label: 'Pet Breed' }, { key: 'tags', label: 'Client Tags' }, { key: 'membershipTier', label: 'Membership Tier' }, { key: 'city', label: 'City' }, { key: 'postalCode', label: 'Postal Code' }].map(f => (
          <div key={f.key} className="py-1">
            <label className="mb-0.5 block text-xs text-muted-foreground">{f.label}</label>
            <input className="w-full rounded border px-2 py-1 text-xs" placeholder={f.label} value={local[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-3">
        <button onClick={() => onApply(local)} className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Apply</button>
        <button onClick={onClose} className="flex-1 rounded-md border px-3 py-1.5 text-xs">Cancel</button>
      </div>
    </div>
  );
}

function BulkManageButton({ selected, onDone }: { selected: Set<string>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [newStatus, setNewStatus] = useState('');
  async function applyAction(action: string) {
    const ids = Array.from(selected);
    if (action === 'delete') {
      if (!confirm(`Delete ${ids.length} selected clients?`)) return;
      await Promise.all(ids.map(id => apiFetch(`/customers/${id}`, { method: 'DELETE' })));
    } else if (action === 'addTag' && tag) {
      await Promise.all(ids.map(async id => {
        const c = await apiFetch<{ tags: string[] }>(`/customers/${id}`);
        await apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ tags: [...new Set([...c.tags, tag])] }) });
      }));
    } else if (action === 'setStatus' && newStatus) {
      await Promise.all(ids.map(id => apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })));
    }
    setOpen(false); onDone();
  }
  if (selected.size === 0) return <span className="text-sm text-muted-foreground">Bulk Manage Clients</span>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">Bulk Manage ({selected.size})</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 space-y-3 rounded-xl border bg-white p-3 text-sm shadow-xl">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Add tag</label>
            <div className="flex gap-1">
              <input className="flex-1 rounded border px-2 py-1 text-xs" placeholder="tag name" value={tag} onChange={e => setTag(e.target.value)} />
              <button onClick={() => applyAction('addTag')} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Add</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Change status</label>
            <div className="flex gap-1">
              <select className="flex-1 rounded border px-1 py-1 text-xs" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                <option value="">Select…</option>
                {STATUS_OPTIONS.filter(s => s.value !== 'ALL').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={() => applyAction('setStatus')} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Set</button>
            </div>
          </div>
          <button onClick={() => applyAction('delete')} className="w-full rounded border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50">Delete selected</button>
          <button onClick={() => setOpen(false)} className="w-full rounded border py-1.5 text-xs text-muted-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}
