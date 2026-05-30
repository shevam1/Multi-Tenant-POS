'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface StoreOverride { storeId: string; priceCents: number | null; available: boolean }
interface CatalogItem {
  id: string; kind: 'PACKAGE' | 'ADDON' | 'RETAIL'; name: string; description: string | null;
  basePriceCents: number; durationMin: number | null; active: boolean;
  storeOverrides: StoreOverride[];
}
interface AuthMe { role: string; permissions: string[] }

const KIND_LABEL: Record<string, string> = { PACKAGE: 'Packages', ADDON: 'Add-ons', RETAIL: 'Retail' };
const KIND_BADGE: Record<string, string> = {
  PACKAGE: 'bg-blue-100 text-blue-700', ADDON: 'bg-teal-100 text-teal-700', RETAIL: 'bg-amber-100 text-amber-700',
};
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function PackagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [pricingItem, setPricingItem] = useState<CatalogItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      apiFetch<CatalogItem[]>('/catalog'),
      apiFetch<Store[]>('/customers/stores').catch(() => []),
    ]);
    setItems(c); setStores(s);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(u => {
      if (!u.permissions.includes('packages.manage')) { router.push('/dashboard'); return; }
      load().finally(() => setLoading(false));
    }).catch(() => router.push('/login'));
  }, [router, load]);

  async function remove(id: string) {
    if (!confirm('Deactivate this item?')) return;
    await apiFetch(`/catalog/${id}`, { method: 'DELETE' });
    load();
  }

  const grouped = (['PACKAGE', 'ADDON', 'RETAIL'] as const).map(kind => ({
    kind, items: items.filter(i => i.kind === kind && i.active),
  }));

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Packages &amp; Pricing</h1>
        <button onClick={() => setShowAdd(true)} className="ml-auto rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New item</button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : grouped.map(g => (
          <section key={g.kind}>
            <h2 className="mb-3 font-semibold">{KIND_LABEL[g.kind]} ({g.items.length})</h2>
            <div className="space-y-2">
              {g.items.map(item => (
                <div key={item.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[item.kind]}`}>{item.kind}</span>
                      </div>
                      {item.description && <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>}
                      <p className="mt-1 text-sm">
                        <span className="font-semibold">{fmt(item.basePriceCents)}</span>
                        {item.durationMin && <span className="text-neutral-400"> · {item.durationMin} min</span>}
                        {item.storeOverrides.length > 0 && (
                          <span className="ml-2 text-xs text-violet-600">{item.storeOverrides.length} location override{item.storeOverrides.length > 1 ? 's' : ''}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setPricingItem(item)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50">Location pricing</button>
                      <button onClick={() => setEditItem(item)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50">Edit</button>
                      <button onClick={() => remove(item.id)} className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50">✕</button>
                    </div>
                  </div>
                </div>
              ))}
              {g.items.length === 0 && <p className="text-sm text-neutral-400">None yet.</p>}
            </div>
          </section>
        ))}
      </main>

      {(showAdd || editItem) && (
        <ItemModal item={editItem} onClose={() => { setShowAdd(false); setEditItem(null); }}
          onSaved={() => { setShowAdd(false); setEditItem(null); load(); }} />
      )}
      {pricingItem && (
        <PricingModal item={pricingItem} stores={stores}
          onClose={() => setPricingItem(null)} onSaved={() => { setPricingItem(null); load(); }} />
      )}
    </div>
  );
}

function ItemModal({ item, onClose, onSaved }: { item: CatalogItem | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!item;
  const [kind, setKind] = useState(item?.kind ?? 'PACKAGE');
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? String(item.basePriceCents / 100) : '');
  const [duration, setDuration] = useState(item?.durationMin ? String(item.durationMin) : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !price) return;
    setSaving(true);
    const body = JSON.stringify({
      kind, name: name.trim(), description: description || null,
      basePriceCents: Math.round(parseFloat(price) * 100),
      durationMin: duration ? parseInt(duration) : null,
    });
    if (editing) await apiFetch(`/catalog/${item.id}`, { method: 'PATCH', body });
    else await apiFetch('/catalog', { method: 'POST', body });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[440px] rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <h2 className="font-bold text-lg">{editing ? 'Edit item' : 'New catalog item'}</h2>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Type</label>
          <div className="flex gap-2">
            {(['PACKAGE', 'ADDON', 'RETAIL'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium ${kind === k ? 'bg-brand text-white border-brand' : 'hover:bg-neutral-50'}`}>{k}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Name *</label>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium Groom" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Description</label>
          <textarea rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Base price (CAD) *</label>
            <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Duration (min)</label>
            <input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={duration} onChange={e => setDuration(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !name || !price} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PricingModal({ item, stores, onClose, onSaved }: { item: CatalogItem; stores: Store[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(() => stores.map(s => {
    const ov = item.storeOverrides.find(o => o.storeId === s.id);
    return {
      storeId: s.id, storeName: s.name,
      available: ov ? ov.available : true,
      priceStr: ov?.priceCents != null ? String(ov.priceCents / 100) : '',
    };
  }));
  const [saving, setSaving] = useState(false);

  function setRow(storeId: string, patch: Partial<{ available: boolean; priceStr: string }>) {
    setRows(rs => rs.map(r => r.storeId === storeId ? { ...r, ...patch } : r));
  }

  async function save() {
    setSaving(true);
    const overrides = rows.map(r => ({
      storeId: r.storeId,
      priceCents: r.priceStr ? Math.round(parseFloat(r.priceStr) * 100) : null,
      available: r.available,
    }));
    await apiFetch(`/catalog/${item.id}/stores`, { method: 'PUT', body: JSON.stringify({ overrides }) });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <h2 className="font-bold text-lg">Location pricing — {item.name}</h2>
        <p className="text-xs text-neutral-500">Base price {fmt(item.basePriceCents)}. Leave price blank to use base. Toggle availability per location.</p>
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.storeId} className="flex items-center gap-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 flex-1 text-sm">
                <input type="checkbox" checked={r.available} onChange={e => setRow(r.storeId, { available: e.target.checked })} />
                {r.storeName}
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400">$</span>
                <input type="number" step="0.01" placeholder={(item.basePriceCents / 100).toFixed(2)}
                  className="w-24 rounded border px-2 py-1 text-sm disabled:bg-neutral-50"
                  disabled={!r.available} value={r.priceStr} onChange={e => setRow(r.storeId, { priceStr: e.target.value })} />
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-neutral-400">No stores.</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save pricing'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
