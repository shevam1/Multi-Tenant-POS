'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  emergencyContact: string | null;
  tags: string[];
  status: string;
}

interface Props {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientFormModal({ customer, onClose, onSaved }: Props) {
  const editing = !!customer;
  const [form, setForm] = useState({
    fullName: customer?.fullName ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    addressLine: customer?.addressLine ?? '',
    city: customer?.city ?? '',
    postalCode: customer?.postalCode ?? '',
    emergencyContact: customer?.emergencyContact ?? '',
    status: customer?.status ?? 'ACTIVE',
    tags: customer?.tags ?? [],
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  }

  async function save() {
    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    setSaving(true); setError('');
    try {
      const body = JSON.stringify({
        fullName: form.fullName.trim(),
        phone: form.phone || null,
        email: form.email || null,
        addressLine: form.addressLine || null,
        city: form.city || null,
        postalCode: form.postalCode || null,
        emergencyContact: form.emergencyContact || null,
        tags: form.tags,
        status: form.status,
      });
      if (editing) {
        await apiFetch(`/customers/${customer.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/customers', { method: 'POST', body });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 h-full w-[480px] overflow-y-auto bg-white shadow-2xl flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{editing ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4">
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Full name *</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="e.g. Sarah Chen" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" type="tel"
                value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (647) 555-0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" type="email"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Address</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
              value={form.addressLine} onChange={e => set('addressLine', e.target.value)} placeholder="Street address" />
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-lg border px-3 py-2 text-sm"
                value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
              <input className="rounded-lg border px-3 py-2 text-sm"
                value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="Postal code" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Emergency contact</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm"
              value={form.emergencyContact} onChange={e => set('emergencyContact', e.target.value)} placeholder="Name, phone" />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Status</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              value={form.status} onChange={e => set('status', e.target.value)}>
              {['ACTIVE', 'INACTIVE', 'PENDING', 'LEAD'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {form.tags.map(t => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {t}
                  <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} className="text-neutral-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                placeholder="e.g. VIP, Cash Only" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} />
              <button onClick={addTag} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">+ Add</button>
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add client'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-neutral-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
