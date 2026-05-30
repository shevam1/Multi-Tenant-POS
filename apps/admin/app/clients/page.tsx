'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';
import ClientFormModal from '@/components/client-form-modal';

interface Store { id: string; name: string; city: string | null; province: string }

interface PetRow { id: string; name: string; breed: string | null; species: string; tags: string[]; preferredGroomerId?: string | null }
interface ApptRow { id: string; scheduledStart: string; status: string }

interface CustomerRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  membershipTier: string | null;
  loyaltyPoints: number;
  status: string;
  createdAt: string;
  pets: PetRow[];
  lastAppt: ApptRow | null;
  nextAppt: { id: string; scheduledStart: string } | null;
  totalSalesCents: number;
}

interface ListResponse { data: CustomerRow[]; total: number; page: number; limit: number }

interface AuthMe { storeId: string | null; role: string; fullName: string }

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
  SILVER: 'bg-neutral-200 text-neutral-700',
  GOLD: 'bg-amber-200 text-amber-800',
  PLATINUM: 'bg-violet-200 text-violet-800',
};

function fmt(c: number) { return `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function ClientsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState(''); // '' = All locations
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (params: {
    q?: string; storeId?: string; status?: string; page?: number; limit?: number;
    orderBy?: string; order?: string; extra?: Record<string, string>;
  }) => {
    setLoading(true);
    const [ob, od] = (params.order ?? 'firstName:asc').split(':');
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 20),
      status: params.status ?? 'ACTIVE',
      orderBy: ob,
      order: od,
      ...(params.q ? { q: params.q } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.extra ?? {}),
    });
    const data = await apiFetch<ListResponse>(`/customers?${qs}`).catch(() => null);
    setResult(data);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    Promise.all([
      apiFetch<AuthMe>('/auth/me'),
      apiFetch<Store[]>('/customers/stores'),
    ]).then(([u, s]) => {
      setMe(u);
      setStores(s);
      const defaultStore = (u.role !== 'FRANCHISE_HQ_ADMIN' && u.storeId) ? u.storeId : '';
      setStoreId(defaultStore);
      load({ storeId: defaultStore, status: 'ACTIVE', page: 1, limit: 20, order: 'firstName:asc' });
    }).catch(() => router.push('/login'));
  }, [router, load]);

  // Re-load when controls change (except q — that's debounced)
  useEffect(() => {
    if (!me) return;
    load({ q, storeId, status, page, limit, order, extra: Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '')
    ) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, status, order, page, limit, me]);

  function onSearch(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ q: val, storeId, status, page: 1, limit, order, extra: Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== '')) });
    }, 300);
  }

  function applyFilters(newFilters: Record<string, string>) {
    setFilters(newFilters);
    setPage(1);
    setShowFilter(false);
    load({ q, storeId, status, page: 1, limit, order, extra: Object.fromEntries(Object.entries(newFilters).filter(([,v]) => v !== '')) });
  }

  async function deleteCustomer(id: string) {
    if (!confirm('Delete this client? They will be soft-deleted and can be restored.')) return;
    await apiFetch(`/customers/${id}`, { method: 'DELETE' });
    load({ q, storeId, status, page, limit, order, extra: filters });
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
  }

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (!result) return;
    if (selected.size === result.data.length) setSelected(new Set());
    else setSelected(new Set(result.data.map(c => c.id)));
  }

  const totalPages = result ? Math.ceil(result.total / limit) : 1;
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
          <h1 className="font-semibold text-lg">Clients</h1>
          {result && <span className="text-sm text-neutral-400">{result.total.toLocaleString()}</span>}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-500">
          Add Client
        </button>
      </header>

      {/* Controls */}
      <div className="border-b bg-white px-6 py-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
          <input className="w-full rounded-md border pl-9 pr-3 py-1.5 text-sm placeholder:text-neutral-400"
            placeholder="Search by client or pet name or by phone"
            value={q} onChange={e => onSearch(e.target.value)} />
        </div>

        {/* Location */}
        <select className="rounded-md border px-3 py-1.5 text-sm bg-white"
          value={storeId} onChange={e => { setStoreId(e.target.value); setPage(1); }}>
          <option value="">All locations</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Status */}
        <select className="rounded-md border px-3 py-1.5 text-sm bg-white"
          value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Order by */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-neutral-500">Order by:</span>
          <select className="rounded-md border px-3 py-1.5 text-sm bg-white"
            value={order} onChange={e => { setOrder(e.target.value); setPage(1); }}>
            {ORDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Filter */}
        <div className="relative">
          <button onClick={() => setShowFilter(!showFilter)}
            className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-amber-500 flex items-center gap-1">
            + Add Filter
            {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-white text-amber-600 px-1.5 text-xs">{activeFilterCount}</span>}
          </button>
          {showFilter && <FilterPanel filters={filters} onApply={applyFilters} onClose={() => setShowFilter(false)} />}
        </div>

        {/* Bulk manage */}
        <BulkManageButton selected={selected} onDone={() => { setSelected(new Set()); load({ q, storeId, status, page, limit, order, extra: filters }); }} />
      </div>

      {/* Active filters chips */}
      {activeFilterCount > 0 && (
        <div className="px-6 py-2 flex flex-wrap gap-2 bg-neutral-50 border-b">
          {Object.entries(filters).filter(([,v]) => v !== '').map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-0.5 text-xs text-blue-700">
              {k}: {v}
              <button onClick={() => { const f = { ...filters }; delete f[k]; applyFilters(f); }} className="ml-1 hover:text-blue-900">×</button>
            </span>
          ))}
          <button onClick={() => applyFilters({})} className="text-xs text-neutral-500 hover:text-neutral-700">Clear all</button>
        </div>
      )}

      {/* Table */}
      <main className="px-6 py-4">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={!!result && selected.size === result.data.length && result.data.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                {['Name', 'Pets', 'Pref. groomer', 'Phone', 'Email', 'Last Appt.', 'Next Appt.', 'Total Sales', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</td></tr>
              )}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-neutral-400">No clients found.</td></tr>
              )}
              {!loading && result?.data.map(c => (
                <tr key={c.id} className={`hover:bg-neutral-50 ${selected.has(c.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/clients/${c.id}`} className="font-medium text-neutral-900 hover:text-brand">
                      {c.fullName || 'Not Set'}
                    </a>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {c.membershipTier && (
                        <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${TIER_BADGE[c.membershipTier] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          {c.membershipTier}
                        </span>
                      )}
                      {c.tags.map(t => <span key={t} className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{t}</span>)}
                      {!c.lastAppt && <span className="rounded-full border border-rose-300 px-1.5 py-0.5 text-xs text-rose-500">New</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.pets.length > 0
                      ? c.pets.map(p => <div key={p.id} className="text-xs">{p.name}{p.breed ? ` (${p.breed})` : ''}</div>)
                      : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400 text-xs">
                    {c.pets.find(p => p.preferredGroomerId) ? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600">{c.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{c.email ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.lastAppt ? fmtDate(c.lastAppt.scheduledStart) : <span className="text-neutral-300">N/A</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {c.nextAppt ? fmtDate(c.nextAppt.scheduledStart) : <span className="text-neutral-300">N/A</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{fmt(c.totalSalesCents)}</td>
                  <td className="px-4 py-3">
                    <ActionsMenu id={c.id} onDelete={() => deleteCustomer(c.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result && result.total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
            <span>{(page - 1) * limit + 1}–{Math.min(page * limit, result.total)} of {result.total.toLocaleString()} clients</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="rounded border px-2 py-1 disabled:opacity-30 hover:bg-neutral-50">‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i === 3 ? -1 : totalPages - (6 - i);
                return p === -1
                  ? <span key="ellipsis" className="px-1">…</span>
                  : <button key={p} onClick={() => setPage(p)}
                      className={`rounded border px-3 py-1 ${page === p ? 'bg-brand text-white border-brand' : 'hover:bg-neutral-50'}`}>{p}</button>;
              })}
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="rounded border px-2 py-1 disabled:opacity-30 hover:bg-neutral-50">›</button>
            </div>
            <select className="rounded border px-2 py-1 bg-white" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
              {LIMITS.map(l => <option key={l} value={l}>{l} / page</option>)}
            </select>
          </div>
        )}
      </main>

      {showAdd && (
        <ClientFormModal customer={null} onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load({ q, storeId, status, page: 1, limit, order, extra: filters }); }} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionsMenu({ id, onDelete }: { id: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="rounded border px-2 py-1 text-neutral-500 hover:bg-neutral-50">⋯</button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border bg-white shadow-lg text-sm">
          <a href={`/clients/${id}`} className="block px-4 py-2 hover:bg-neutral-50">View</a>
          <a href={`/clients/${id}?edit=1`} className="block px-4 py-2 hover:bg-neutral-50">Edit</a>
          <button onClick={() => { setOpen(false); onDelete(); }} className="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50">Delete</button>
        </div>
      )}
    </div>
  );
}

function FilterPanel({ filters, onApply, onClose }: { filters: Record<string, string>; onApply: (f: Record<string, string>) => void; onClose: () => void }) {
  const [local, setLocal] = useState({ ...filters });
  const set = (k: string, v: string) => setLocal(f => ({ ...f, [k]: v }));
  return (
    <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border bg-white shadow-xl text-sm">
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-2">Quick Filters</p>
        <label className="flex items-center gap-2 py-1 hover:text-neutral-900 cursor-pointer">
          <input type="checkbox" checked={local.noBooking === 'true'} onChange={e => set('noBooking', e.target.checked ? 'true' : '')} />
          No booked appointment
        </label>
        <div className="flex items-center gap-2 py-1">
          <span>Haven&apos;t seen in</span>
          <input type="number" min="1" className="w-14 rounded border px-1.5 py-0.5 text-xs" placeholder="wks"
            value={local.notSeenWeeks ?? ''} onChange={e => set('notSeenWeeks', e.target.value)} />
          <span>weeks</span>
        </div>
      </div>
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-neutral-400 uppercase mb-2">Custom Filters</p>
        {[
          { key: 'breed', label: 'Pet Breed' },
          { key: 'tags', label: 'Client Tags' },
          { key: 'membershipTier', label: 'Membership Tier' },
          { key: 'city', label: 'City' },
          { key: 'postalCode', label: 'Postal Code' },
        ].map(f => (
          <div key={f.key} className="py-1">
            <label className="block text-xs text-neutral-500 mb-0.5">{f.label}</label>
            <input className="w-full rounded border px-2 py-1 text-xs" placeholder={f.label}
              value={local[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-3">
        <button onClick={() => onApply(local)} className="flex-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white">Apply</button>
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
      // Fetch current tags, add new tag, patch
      await Promise.all(ids.map(async id => {
        const c = await apiFetch<{ tags: string[] }>(`/customers/${id}`);
        const tags = [...new Set([...c.tags, tag])];
        await apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ tags }) });
      }));
    } else if (action === 'setStatus' && newStatus) {
      await Promise.all(ids.map(id => apiFetch(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })));
    }
    setOpen(false);
    onDone();
  }

  if (selected.size === 0) {
    return <button className="rounded-md border px-3 py-1.5 text-sm text-neutral-500" disabled>Bulk Manage Clients</button>;
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100">
        Bulk Manage ({selected.size})
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border bg-white shadow-xl text-sm p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Add tag</label>
            <div className="flex gap-1">
              <input className="flex-1 rounded border px-2 py-1 text-xs" placeholder="tag name" value={tag} onChange={e => setTag(e.target.value)} />
              <button onClick={() => applyAction('addTag')} className="rounded bg-brand px-2 py-1 text-xs text-white">Add</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Change status</label>
            <div className="flex gap-1">
              <select className="flex-1 rounded border px-1 py-1 text-xs" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                <option value="">Select…</option>
                {STATUS_OPTIONS.filter(s => s.value !== 'ALL').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={() => applyAction('setStatus')} className="rounded bg-brand px-2 py-1 text-xs text-white">Set</button>
            </div>
          </div>
          <button onClick={() => applyAction('delete')} className="w-full rounded border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50">
            Delete selected
          </button>
          <button onClick={() => setOpen(false)} className="w-full rounded border py-1.5 text-xs text-neutral-500">Cancel</button>
        </div>
      )}
    </div>
  );
}
