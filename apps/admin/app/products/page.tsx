'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; name: string; contactName: string | null; phone: string | null; email: string | null }
interface Product {
  id: string; name: string; sku: string | null; priceCents: number; costCents: number;
  stockQty: number; reorderLevel: number; storeId: string;
  category: { name: string } | null; supplier: { name: string } | null;
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ProductsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [tab, setTab] = useState<'products' | 'categories' | 'suppliers'>('products');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadProducts = useCallback(async (sid: string) => {
    const p = await apiFetch<Product[]>(`/products${sid ? `?storeId=${sid}` : ''}`).catch(() => []);
    setProducts(p);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      const [s, cats, sups] = await Promise.all([
        apiFetch<Store[]>('/customers/stores').catch(() => []),
        apiFetch<Category[]>('/products/meta/categories').catch(() => []),
        apiFetch<Supplier[]>('/products/meta/suppliers').catch(() => []),
      ]);
      setStores(s); setCategories(cats); setSuppliers(sups);
      const sid = u.role === 'FRANCHISE_HQ_ADMIN' ? (s[0]?.id ?? '') : (u.storeId ?? '');
      setStoreId(sid);
      await loadProducts(sid);
      setLoading(false);
    }).catch(() => router.push('/login'));
  }, [router, loadProducts]);

  async function removeProduct(id: string) {
    if (!confirm('Remove this product?')) return;
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    loadProducts(storeId);
  }
  async function adjustStock(id: string) {
    const d = prompt('Adjust stock by (e.g. 10 to add, -2 to remove):');
    if (!d) return;
    await apiFetch(`/products/${id}/adjust`, { method: 'POST', body: JSON.stringify({ delta: Number(d) }) });
    loadProducts(storeId);
  }

  const reload = () => { loadProducts(storeId); apiFetch<Category[]>('/products/meta/categories').then(setCategories); apiFetch<Supplier[]>('/products/meta/suppliers').then(setSuppliers); };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Product Store</h1>
        <div className="ml-auto flex items-center gap-2">
          {me?.role === 'FRANCHISE_HQ_ADMIN' && stores.length > 0 && (
            <select className="rounded-md border px-2 py-1.5 text-xs bg-white" value={storeId} onChange={e => { setStoreId(e.target.value); loadProducts(e.target.value); }}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {tab === 'products' && <button onClick={() => setShowAdd(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Product</button>}
        </div>
      </header>

      <div className="border-b bg-white px-6">
        <div className="flex gap-1">
          {(['products', 'categories', 'suppliers'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 capitalize ${tab === t ? 'border-amber-400 text-neutral-900' : 'border-transparent text-neutral-500'}`}>{t}</button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <>
            {tab === 'products' && (
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500 tracking-wide">
                    <tr>{['Product', 'Category', 'Supplier', 'Price', 'Cost', 'Stock', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {products.map(p => {
                      const low = p.stockQty <= p.reorderLevel;
                      return (
                        <tr key={p.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3"><span className="font-medium">{p.name}</span>{p.sku && <span className="block text-xs text-neutral-400">{p.sku}</span>}</td>
                          <td className="px-4 py-3 text-neutral-500">{p.category?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-neutral-500">{p.supplier?.name ?? '—'}</td>
                          <td className="px-4 py-3 font-medium">{fmt(p.priceCents)}</td>
                          <td className="px-4 py-3 text-neutral-500">{fmt(p.costCents)}</td>
                          <td className="px-4 py-3">
                            <span className={low ? 'text-red-600 font-medium' : ''}>{p.stockQty}</span>
                            {low && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">low</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => adjustStock(p.id)} className="text-xs text-brand hover:underline mr-2">Stock</button>
                            <button onClick={() => setEditProduct(p)} className="text-xs text-brand hover:underline mr-2">Edit</button>
                            <button onClick={() => removeProduct(p.id)} className="text-xs text-red-500 hover:underline">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                    {products.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">No products. Click + Product to add.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'categories' && <CategoriesTab categories={categories} onSaved={reload} />}
            {tab === 'suppliers' && <SuppliersTab suppliers={suppliers} onSaved={reload} />}
          </>
        )}
      </main>

      {(showAdd || editProduct) && (
        <ProductModal product={editProduct} storeId={storeId} categories={categories} suppliers={suppliers}
          onClose={() => { setShowAdd(false); setEditProduct(null); }}
          onSaved={() => { setShowAdd(false); setEditProduct(null); loadProducts(storeId); }} />
      )}
    </div>
  );
}

function CategoriesTab({ categories, onSaved }: { categories: Category[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  async function add() { if (!name.trim()) return; await apiFetch('/products/meta/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setName(''); onSaved(); }
  return (
    <div className="max-w-md space-y-3">
      <div className="flex gap-2">
        <input className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="New category" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Add</button>
      </div>
      <div className="rounded-xl border bg-white divide-y">
        {categories.map(c => <div key={c.id} className="px-4 py-2.5 text-sm">{c.name}</div>)}
        {categories.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">No categories.</p>}
      </div>
    </div>
  );
}

function SuppliersTab({ suppliers, onSaved }: { suppliers: Supplier[]; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', contactName: '', phone: '', email: '' });
  async function add() {
    if (!form.name.trim()) return;
    await apiFetch('/products/meta/suppliers', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', contactName: '', phone: '', email: '' }); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 grid grid-cols-2 gap-3 max-w-2xl">
        {(['name', 'contactName', 'phone', 'email'] as const).map(k => (
          <input key={k} className="rounded-lg border px-3 py-2 text-sm" placeholder={k === 'name' ? 'Supplier name *' : k} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
        ))}
        <button onClick={add} className="col-span-2 rounded-lg bg-brand py-2 text-sm font-medium text-white">Add supplier</button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{['Supplier', 'Contact', 'Phone', 'Email'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {suppliers.map(s => <tr key={s.id}><td className="px-4 py-2 font-medium">{s.name}</td><td className="px-4 py-2 text-neutral-500">{s.contactName ?? '—'}</td><td className="px-4 py-2 text-neutral-500">{s.phone ?? '—'}</td><td className="px-4 py-2 text-neutral-500">{s.email ?? '—'}</td></tr>)}
            {suppliers.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No suppliers.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductModal({ product, storeId, categories, suppliers, onClose, onSaved }: {
  product: Product | null; storeId: string; categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? '', sku: product?.sku ?? '',
    categoryId: '', supplierId: '',
    price: product ? String(product.priceCents / 100) : '',
    cost: product ? String(product.costCents / 100) : '',
    stockQty: product ? String(product.stockQty) : '0',
    reorderLevel: product ? String(product.reorderLevel) : '0',
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    const body = JSON.stringify({
      storeId, name: form.name.trim(), sku: form.sku || undefined,
      categoryId: form.categoryId || null, supplierId: form.supplierId || null,
      priceCents: Math.round(parseFloat(form.price) * 100), costCents: Math.round(parseFloat(form.cost || '0') * 100),
      stockQty: parseInt(form.stockQty || '0'), reorderLevel: parseInt(form.reorderLevel || '0'),
    });
    if (editing) await apiFetch(`/products/${product.id}`, { method: 'PATCH', body });
    else await apiFetch('/products', { method: 'POST', body });
    setSaving(false); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[460px] rounded-2xl bg-white p-6 shadow-2xl space-y-3">
        <h2 className="font-bold text-lg">{editing ? 'Edit product' : 'New product'}</h2>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Product name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="SKU / barcode" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <select className="rounded-lg border px-3 py-2 text-sm bg-white" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
            <option value="">Category…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm bg-white" value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}>
            <option value="">Supplier…</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div><label className="block text-xs text-neutral-500 mb-1">Price (CAD) *</label><input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Cost (CAD)</label><input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Stock qty</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.stockQty} onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))} /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Reorder level</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.reorderLevel} onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} /></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving || !form.name || !form.price} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
