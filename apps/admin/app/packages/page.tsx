'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface StoreOverride { storeId: string; priceCents: number | null; available: boolean }
interface Category { id: string; name: string; sortOrder: number }
interface CatalogItem {
  id: string; kind: 'PACKAGE' | 'ADDON' | 'RETAIL'; name: string; description: string | null;
  basePriceCents: number; durationMin: number | null; active: boolean;
  categoryId: string | null; taxable: boolean; bookOnline: boolean;
  category: { id: string; name: string } | null;
  storeOverrides: StoreOverride[];
}
interface AuthMe { role: string; permissions: string[] }

const KIND_BADGE: Record<string, string> = {
  PACKAGE: 'bg-blue-100 text-blue-700', ADDON: 'bg-teal-100 text-teal-700', RETAIL: 'bg-amber-100 text-amber-700',
};
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const UNCATEGORIZED = '__none__';

export default function PackagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [addToCategory, setAddToCategory] = useState<string | null>(null);
  const [pricingItem, setPricingItem] = useState<CatalogItem | null>(null);
  const [raiseCat, setRaiseCat] = useState<Category | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [c, cats, s] = await Promise.all([
      apiFetch<CatalogItem[]>('/catalog'),
      apiFetch<Category[]>('/catalog/categories').catch(() => []),
      apiFetch<Store[]>('/customers/stores').catch(() => []),
    ]);
    setItems(c); setCategories(cats); setStores(s);
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
  async function duplicate(id: string) {
    await apiFetch(`/catalog/${id}/duplicate`, { method: 'POST' });
    load();
  }
  async function toggleField(item: CatalogItem, field: 'taxable' | 'bookOnline', value: boolean) {
    setItems(its => its.map(i => i.id === item.id ? { ...i, [field]: value } : i));
    await apiFetch(`/catalog/${item.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) }).catch(load);
  }

  async function addCategory() {
    const name = prompt('New category name');
    if (!name?.trim()) return;
    await apiFetch('/catalog/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    load();
  }
  async function renameCategory(cat: Category) {
    const name = prompt('Rename category', cat.name);
    if (!name?.trim() || name === cat.name) return;
    await apiFetch(`/catalog/categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
    load();
  }
  async function deleteCategory(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"? Items must be moved out first.`)) return;
    try { await apiFetch(`/catalog/categories/${cat.id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }
  async function move(index: number, dir: -1 | 1) {
    const next = [...categories];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setCategories(next);
    await apiFetch('/catalog/categories/reorder', { method: 'PUT', body: JSON.stringify({ orderedIds: next.map(c => c.id) }) }).catch(load);
  }

  // Build ordered buckets: each category in sort order, then Uncategorized last.
  const active = items.filter(i => i.active);
  const buckets: { id: string; cat: Category | null; items: CatalogItem[] }[] = [
    ...categories.map(c => ({ id: c.id, cat: c, items: active.filter(i => i.categoryId === c.id) })),
    { id: UNCATEGORIZED, cat: null, items: active.filter(i => !i.categoryId) },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-sm text-neutral-500 hover:text-neutral-700">← Settings</button>
        <h1 className="font-semibold">Services Catalog</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={addCategory} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-neutral-50">+ Category</button>
          <button onClick={() => setAddToCategory(UNCATEGORIZED)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New item</button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-5">
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : buckets.map((b, bi) => {
          const isOpen = !collapsed[b.id];
          return (
            <section key={b.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-neutral-50/70 px-4 py-2.5">
                <button onClick={() => setCollapsed(c => ({ ...c, [b.id]: !c[b.id] }))} className="text-neutral-400 hover:text-neutral-700 w-4">{isOpen ? '▾' : '▸'}</button>
                <span className="font-semibold">{b.cat ? b.cat.name : 'Uncategorized'}</span>
                <span className="text-xs text-neutral-400">{b.items.length}</span>
                <div className="ml-auto flex items-center gap-1">
                  {b.cat && (
                    <>
                      <button onClick={() => move(bi, -1)} disabled={bi === 0} className="rounded px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-200 disabled:opacity-30">↑</button>
                      <button onClick={() => move(bi, 1)} disabled={bi >= categories.length - 1} className="rounded px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-200 disabled:opacity-30">↓</button>
                      <button onClick={() => setRaiseCat(b.cat)} className="rounded border px-2 py-1 text-xs hover:bg-white" title="Raise prices">↑ Price</button>
                      <button onClick={() => renameCategory(b.cat!)} className="rounded border px-2 py-1 text-xs hover:bg-white">Rename</button>
                      <button onClick={() => deleteCategory(b.cat!)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">✕</button>
                    </>
                  )}
                  <button onClick={() => setAddToCategory(b.cat?.id ?? UNCATEGORIZED)} className="rounded border px-2 py-1 text-xs hover:bg-white">+ Item</button>
                </div>
              </div>
              {isOpen && (
                <div className="divide-y">
                  {b.items.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[item.kind]}`}>{item.kind}</span>
                          {!item.bookOnline && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">offline</span>}
                          {!item.taxable && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">tax-free</span>}
                        </div>
                        {item.description && <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>}
                        <p className="mt-1 text-sm">
                          <span className="font-semibold">{fmt(item.basePriceCents)}</span>
                          {item.durationMin && <span className="text-neutral-400"> · {item.durationMin} min</span>}
                          {item.storeOverrides.length > 0 && (
                            <span className="ml-2 text-xs text-violet-600">{item.storeOverrides.length} location override{item.storeOverrides.length > 1 ? 's' : ''}</span>
                          )}
                        </p>
                        <div className="mt-2 flex gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <input type="checkbox" checked={item.bookOnline} onChange={e => toggleField(item, 'bookOnline', e.target.checked)} /> Book online
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <input type="checkbox" checked={item.taxable} onChange={e => toggleField(item, 'taxable', e.target.checked)} /> Taxable
                          </label>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex gap-1.5">
                          <button onClick={() => setPricingItem(item)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-neutral-50">Pricing</button>
                          <button onClick={() => setEditItem(item)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-neutral-50">Edit</button>
                          <button onClick={() => duplicate(item.id)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-neutral-50">Duplicate</button>
                          <button onClick={() => remove(item.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {b.items.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">No items.</p>}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {(addToCategory !== null || editItem) && (
        <ItemModal item={editItem} categories={categories}
          defaultCategoryId={addToCategory === UNCATEGORIZED ? null : addToCategory}
          onClose={() => { setAddToCategory(null); setEditItem(null); }}
          onSaved={() => { setAddToCategory(null); setEditItem(null); load(); }} />
      )}
      {pricingItem && (
        <PricingModal item={pricingItem} stores={stores}
          onClose={() => setPricingItem(null)} onSaved={() => { setPricingItem(null); load(); }} />
      )}
      {raiseCat && (
        <RaisePriceModal cat={raiseCat} onClose={() => setRaiseCat(null)} onSaved={() => { setRaiseCat(null); load(); }} />
      )}
    </div>
  );
}

function ItemModal({ item, categories, defaultCategoryId, onClose, onSaved }: {
  item: CatalogItem | null; categories: Category[]; defaultCategoryId: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = !!item;
  const [kind, setKind] = useState(item?.kind ?? 'PACKAGE');
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? String(item.basePriceCents / 100) : '');
  const [duration, setDuration] = useState(item?.durationMin ? String(item.durationMin) : '');
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? defaultCategoryId ?? '');
  const [taxable, setTaxable] = useState(item?.taxable ?? true);
  const [bookOnline, setBookOnline] = useState(item?.bookOnline ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !price) return;
    setSaving(true);
    const body = JSON.stringify({
      kind, name: name.trim(), description: description || null,
      basePriceCents: Math.round(parseFloat(price) * 100),
      durationMin: duration ? parseInt(duration) : null,
      categoryId: categoryId || null, taxable, bookOnline,
    });
    if (editing) await apiFetch(`/catalog/${item.id}`, { method: 'PATCH', body });
    else await apiFetch('/catalog', { method: 'POST', body });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-[460px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
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
          <label className="block text-xs text-neutral-500 mb-1">Category</label>
          <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bookOnline} onChange={e => setBookOnline(e.target.checked)} /> Available for online booking</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} /> Taxable</label>
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

function RaisePriceModal({ cat, onClose, onSaved }: { cat: Category; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setSaving(true);
    const payload = mode === 'PERCENT' ? { mode, value: num } : { mode, value: Math.round(num * 100) };
    await apiFetch(`/catalog/categories/${cat.id}/raise-price`, { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-[380px] rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <h2 className="font-bold text-lg">Raise prices — {cat.name}</h2>
        <p className="text-xs text-neutral-500">Apply to every active item in this category.</p>
        <div className="flex gap-2">
          {(['PERCENT', 'FIXED'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${mode === m ? 'bg-brand text-white border-brand' : 'hover:bg-neutral-50'}`}>
              {m === 'PERCENT' ? 'Percent %' : 'Fixed $'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">{mode === 'PERCENT' ? 'Increase by (%)' : 'Increase by (CAD)'}</label>
          <input type="number" step={mode === 'PERCENT' ? '1' : '0.01'} className="w-full rounded-lg border px-3 py-2 text-sm"
            value={value} onChange={e => setValue(e.target.value)} placeholder={mode === 'PERCENT' ? '10' : '5.00'} />
          <p className="mt-1 text-xs text-neutral-400">Use a negative value to lower prices.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !value} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Applying…' : 'Apply'}</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
