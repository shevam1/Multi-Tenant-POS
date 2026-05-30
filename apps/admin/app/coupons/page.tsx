'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Coupon {
  id: string; code: string; description: string | null;
  type: 'PERCENT' | 'FIXED'; value: number; active: boolean;
  minSubtotalCents: number; maxRedemptions: number | null; timesRedeemed: number;
  expiresAt: string | null;
}
interface AuthMe { permissions: string[] }

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function CouponsPage() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editC, setEditC] = useState<Coupon | null>(null);

  const load = useCallback(async () => {
    setCoupons(await apiFetch<Coupon[]>('/coupons'));
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(u => {
      if (!u.permissions.includes('coupons.manage')) { router.push('/dashboard'); return; }
      load().finally(() => setLoading(false));
    }).catch(() => router.push('/login'));
  }, [router, load]);

  async function remove(id: string) {
    if (!confirm('Deactivate this coupon?')) return;
    await apiFetch(`/coupons/${id}`, { method: 'DELETE' });
    load();
  }

  function couponValue(c: Coupon) {
    return c.type === 'PERCENT' ? `${c.value}% off` : `${fmt(c.value)} off`;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Coupons &amp; Discounts</h1>
        <button onClick={() => setShowAdd(true)} className="ml-auto rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New coupon</button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                <tr>{['Code', 'Discount', 'Min spend', 'Redemptions', 'Expires', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {coupons.map(c => (
                  <tr key={c.id} className={`hover:bg-neutral-50 ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3"><span className="rounded bg-neutral-100 px-2 py-1 font-mono text-xs font-bold">{c.code}</span>
                      {c.description && <p className="text-xs text-neutral-400 mt-0.5">{c.description}</p>}</td>
                    <td className="px-4 py-3 font-medium text-green-700">{couponValue(c)}</td>
                    <td className="px-4 py-3 text-neutral-500">{c.minSubtotalCents > 0 ? fmt(c.minSubtotalCents) : '—'}</td>
                    <td className="px-4 py-3 text-neutral-500">{c.timesRedeemed}{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}</td>
                    <td className="px-4 py-3 text-neutral-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-CA') : 'Never'}</td>
                    <td className="px-4 py-3">{c.active
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Active</span>
                      : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Inactive</span>}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEditC(c)} className="text-brand text-xs hover:underline mr-2">Edit</button>
                      <button onClick={() => remove(c.id)} className="text-red-500 text-xs hover:underline">✕</button>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">No coupons yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {(showAdd || editC) && (
        <CouponModal coupon={editC} onClose={() => { setShowAdd(false); setEditC(null); }}
          onSaved={() => { setShowAdd(false); setEditC(null); load(); }} />
      )}
    </div>
  );
}

function CouponModal({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!coupon;
  const [code, setCode] = useState(coupon?.code ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>(coupon?.type ?? 'PERCENT');
  const [value, setValue] = useState(coupon ? String(coupon.type === 'PERCENT' ? coupon.value : coupon.value / 100) : '');
  const [minSpend, setMinSpend] = useState(coupon?.minSubtotalCents ? String(coupon.minSubtotalCents / 100) : '');
  const [maxRedemptions, setMaxRedemptions] = useState(coupon?.maxRedemptions != null ? String(coupon.maxRedemptions) : '');
  const [expiresAt, setExpiresAt] = useState(coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!code.trim() || !value) { setError('Code and value required'); return; }
    setSaving(true); setError('');
    try {
      const valueCents = type === 'PERCENT' ? parseInt(value) : Math.round(parseFloat(value) * 100);
      const body = JSON.stringify({
        code: code.trim().toUpperCase(),
        description: description || null,
        type, value: valueCents,
        minSubtotalCents: minSpend ? Math.round(parseFloat(minSpend) * 100) : 0,
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        expiresAt: expiresAt || null,
      });
      if (editing) await apiFetch(`/coupons/${coupon.id}`, { method: 'PATCH', body });
      else await apiFetch('/coupons', { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[440px] rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <h2 className="font-bold text-lg">{editing ? 'Edit coupon' : 'New coupon'}</h2>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Code *</label>
          <input className="w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase disabled:bg-neutral-50"
            value={code} disabled={editing} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SUMMER20" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Description</label>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Summer promo" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Type</label>
            <div className="flex gap-2">
              {(['PERCENT', 'FIXED'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium ${type === t ? 'bg-brand text-white border-brand' : 'hover:bg-neutral-50'}`}>{t === 'PERCENT' ? '%' : '$'}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">{type === 'PERCENT' ? 'Percent off (1-100)' : 'Amount off (CAD)'}</label>
            <input type="number" step={type === 'PERCENT' ? '1' : '0.01'} className="w-full rounded-lg border px-3 py-2 text-sm" value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Min spend (CAD)</label>
            <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" value={minSpend} onChange={e => setMinSpend(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Max redemptions</label>
            <input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="Unlimited" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-neutral-500 mb-1">Expires</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !code || !value} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : editing ? 'Save' : 'Create coupon'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
